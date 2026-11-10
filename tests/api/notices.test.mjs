import test from "node:test";
import assert from "node:assert/strict";
import { handleNotices } from "../../netlify/functions/lib/routes/notices.mjs";
import { classAccessDocumentId } from "../../netlify/functions/lib/authorization.mjs";
import { createFakeDb } from "../helpers/fake-firestore.mjs";

const ADMIN = { uid: "admin-1", role: "admin" };
const TEACHER = { uid: "teacher-1", role: "teacher" };
const STUDENT = { uid: "student-1", role: "student" };
const SEED = {
  classes: { "grade-9": { grade: 9, active: true }, "grade-10": { grade: 10, active: true } },
  subjects: { physics9: { grade: 9, active: true } },
  users: {
    "teacher-1": { role: "teacher", active: true },
    "student-1": { role: "student", active: true },
    "student-2": { role: "student", active: true }
  },
  classAccess: {
    [classAccessDocumentId("grade-9", "teacher-1", "teacher")]: { classId: "grade-9", userUid: "teacher-1", accessType: "teacher", active: true },
    [classAccessDocumentId("grade-9", "student-1", "student")]: { classId: "grade-9", userUid: "student-1", accessType: "student", active: true }
  },
  teachingAssignments: {
    "assignment-1": { teacherUid: "teacher-1", classId: "grade-9", subjectId: "physics9", active: true }
  }
};

async function call(db, user, method, path, body) {
  const init = { method };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await handleNotices(new Request(`https://example.test/api${path}`, init), {
    path, user, db, serverTimestamp: () => "SERVER_TS"
  });
  return { status: response.status, json: await response.json() };
}
const academyNotice = { title: "Academy closure", body: "The academy will be closed tomorrow.", scope: "academy", priority: "important" };
const classNotice = { title: "Physics lesson", body: "Bring your notebook for the next lesson.", scope: "class", classId: "grade-9", priority: "normal" };

test("admin can publish academy-wide notices and students can read them", async () => {
  const db = createFakeDb(SEED);
  const created = await call(db, ADMIN, "POST", "/notices", academyNotice);
  assert.equal(created.status, 201);
  const result = await call(db, STUDENT, "GET", "/notices");
  assert.equal(result.status, 200);
  assert.equal(result.json.data.notices.length, 1);
  assert.equal(result.json.data.notices[0].title, academyNotice.title);
});

test("class notices are visible only to members of the targeted class", async () => {
  const db = createFakeDb(SEED);
  await call(db, ADMIN, "POST", "/notices", classNotice);
  assert.equal((await call(db, STUDENT, "GET", "/notices")).json.data.notices.length, 1);
  assert.equal((await call(db, ADMIN, "GET", "/notices")).json.data.notices.length, 1);
  const outsider = { uid: "student-2", role: "student" };
  assert.equal((await call(db, outsider, "GET", "/notices")).json.data.notices.length, 0);
});

test("teacher can publish only to an assigned class and cannot publish academy-wide", async () => {
  const db = createFakeDb(SEED);
  assert.equal((await call(db, TEACHER, "POST", "/notices", classNotice)).status, 201);
  assert.equal((await call(db, TEACHER, "POST", "/notices", academyNotice)).status, 403);
  assert.equal((await call(db, TEACHER, "POST", "/notices", { ...classNotice, classId: "grade-10" })).status, 404);
});

test("students cannot create notices and unsupported fields are refused", async () => {
  const db = createFakeDb(SEED);
  assert.equal((await call(db, STUDENT, "POST", "/notices", classNotice)).status, 403);
  assert.equal((await call(db, ADMIN, "POST", "/notices", { ...academyNotice, createdBy: "student-1" })).status, 400);
});

test("notice update and deactivation are authorized, audited and non-destructive", async () => {
  const db = createFakeDb(SEED);
  const created = await call(db, ADMIN, "POST", "/notices", classNotice);
  const id = created.json.data.id;
  assert.equal((await call(db, TEACHER, "PATCH", `/notices/${id}`, { title: "Updated lesson" })).status, 200);
  assert.equal(db.store.get(`notices/${id}`).title, "Updated lesson");
  assert.equal((await call(db, TEACHER, "POST", `/notices/${id}`)).status, 200);
  assert.equal(db.store.get(`notices/${id}`).active, false);
  assert.ok(db.store.has(`notices/${id}`));
  assert.equal([...db.store.keys()].filter((key) => key.startsWith("auditLogs/")).length, 3);
});

test("update accepts only title, body and priority; scope and class are fixed", async () => {
  const db = createFakeDb(SEED);
  const id = (await call(db, ADMIN, "POST", "/notices", classNotice)).json.data.id;
  const scoped = await call(db, ADMIN, "PATCH", `/notices/${id}`, { title: "Lab", body: "Goggles on", priority: "normal", scope: "academy" });
  assert.equal(scoped.status, 400);
  const withClass = await call(db, ADMIN, "PATCH", `/notices/${id}`, { title: "Lab", classId: "grade-10" });
  assert.equal(withClass.status, 400);
  assert.equal(db.store.get(`notices/${id}`).scope, "class");
  assert.equal(db.store.get(`notices/${id}`).classId, "grade-9");
});

test("priority must be the lowercase API value on create and update", async () => {
  const db = createFakeDb(SEED);
  assert.equal((await call(db, ADMIN, "POST", "/notices", { ...academyNotice, priority: "Important" })).status, 400);
  assert.equal((await call(db, ADMIN, "POST", "/notices", { ...academyNotice, priority: "urgent" })).status, 400);
  const id = (await call(db, ADMIN, "POST", "/notices", academyNotice)).json.data.id;
  assert.equal((await call(db, ADMIN, "PATCH", `/notices/${id}`, { priority: "Normal" })).status, 400);
  assert.equal((await call(db, ADMIN, "PATCH", `/notices/${id}`, { priority: "normal" })).status, 200);
  assert.equal(db.store.get(`notices/${id}`).priority, "normal");
});

test("a teacher cannot edit or deactivate an academy-wide notice, and students cannot edit at all", async () => {
  const db = createFakeDb(SEED);
  const id = (await call(db, ADMIN, "POST", "/notices", academyNotice)).json.data.id;
  assert.equal((await call(db, TEACHER, "PATCH", `/notices/${id}`, { title: "Changed" })).status, 403);
  assert.equal((await call(db, TEACHER, "POST", `/notices/${id}`)).status, 403);
  assert.equal(db.store.get(`notices/${id}`).title, academyNotice.title);
  assert.equal((await call(db, STUDENT, "PATCH", `/notices/${id}`, { title: "Changed" })).status, 403);
});

test("a deactivated notice disappears from every role's list but is kept in storage", async () => {
  const db = createFakeDb(SEED);
  const id = (await call(db, ADMIN, "POST", "/notices", academyNotice)).json.data.id;
  await call(db, ADMIN, "POST", `/notices/${id}`);
  assert.equal((await call(db, STUDENT, "GET", "/notices")).json.data.notices.length, 0);
  assert.equal((await call(db, ADMIN, "GET", "/notices")).json.data.notices.length, 0);
  assert.equal(db.store.get(`notices/${id}`).active, false);
});

test("notices are listed newest first using stored timestamps, not insertion order", async () => {
  const db = createFakeDb(SEED);
  const older = (await call(db, ADMIN, "POST", "/notices", { ...academyNotice, title: "Older notice" })).json.data.id;
  const newer = (await call(db, ADMIN, "POST", "/notices", { ...academyNotice, title: "Newer notice" })).json.data.id;
  db.store.set(`notices/${older}`, { ...db.store.get(`notices/${older}`), createdAt: { _seconds: 1_700_000_000 } });
  db.store.set(`notices/${newer}`, { ...db.store.get(`notices/${newer}`), createdAt: { _seconds: 1_800_000_000 } });
  const titles = (await call(db, ADMIN, "GET", "/notices")).json.data.notices.map((notice) => notice.title);
  assert.deepEqual(titles, ["Newer notice", "Older notice"]);
});

test("timeKey orders Firestore Timestamps, serialized timestamps and ISO strings", async () => {
  const { timeKey } = await import("../../netlify/functions/lib/routes/notices.mjs");
  assert.equal(timeKey({ toMillis: () => 5000 }), 5000);
  assert.equal(timeKey({ _seconds: 2, _nanoseconds: 500_000_000 }), 2500);
  assert.equal(timeKey("2026-11-09T10:00:00Z"), Date.parse("2026-11-09T10:00:00Z"));
  assert.equal(timeKey("SERVER_TS"), 0);
  assert.equal(timeKey(undefined), 0);
});

test("create, update and deactivate each write a named audit entry", async () => {
  const db = createFakeDb(SEED);
  const id = (await call(db, ADMIN, "POST", "/notices", academyNotice)).json.data.id;
  await call(db, ADMIN, "PATCH", `/notices/${id}`, { title: "Revised closure" });
  await call(db, ADMIN, "POST", `/notices/${id}`);
  const actions = [...db.store.keys()].filter((key) => key.startsWith("auditLogs/"))
    .map((key) => db.store.get(key).action);
  assert.deepEqual(actions.sort(), ["notice.created", "notice.deactivated", "notice.updated"]);
});

test("class notices are hidden from students and teachers after class deactivation", async () => {
  const db = createFakeDb(SEED);
  const id = (await call(db, ADMIN, "POST", "/notices", classNotice)).json.data.id;
  assert.equal((await call(db, STUDENT, "GET", "/notices")).json.data.notices.length, 1);
  assert.equal((await call(db, TEACHER, "GET", "/notices")).json.data.notices.length, 1);

  db.store.set("classes/grade-9", { ...db.store.get("classes/grade-9"), active: false });

  assert.equal((await call(db, STUDENT, "GET", "/notices")).json.data.notices.length, 0);
  assert.equal((await call(db, TEACHER, "GET", "/notices")).json.data.notices.length, 0);
  assert.equal((await call(db, ADMIN, "GET", "/notices")).json.data.notices.length, 1);
  assert.equal(db.store.get(`notices/${id}`).active, true, "class deactivation does not destroy or rewrite notice history");
});
