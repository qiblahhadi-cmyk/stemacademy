import test from "node:test";
import assert from "node:assert/strict";
import { handleMemberships } from "../../netlify/functions/lib/routes/memberships.mjs";
import { classAccessDocumentId } from "../../netlify/functions/lib/authorization.mjs";
import { createFakeDb } from "../helpers/fake-firestore.mjs";

const ADMIN = { uid: "admin-1", role: "admin" };
const TEACHER = { uid: "teacher-1", role: "teacher" };
const SEED = {
  classes: { "grade-9-a": { grade: 9, active: true } },
  users: {
    "student-1": { role: "student", active: true, academyId: "SA-2026-001" },
    "teacher-1": { role: "teacher", active: true }
  }
};
const MEMBERSHIP_ID = classAccessDocumentId("grade-9-a", "student-1", "student");

async function call(db, user, method, path, body) {
  const init = { method };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await handleMemberships(new Request(`https://example.test/api${path}`, init), {
    path, user, db, serverTimestamp: () => "SERVER_TS"
  });
  return { status: response.status, json: await response.json() };
}

test("membership IDs are deterministic and tuple-specific", () => {
  assert.match(MEMBERSHIP_ID, /^ca_[a-f0-9]{64}$/);
  assert.notEqual(MEMBERSHIP_ID, classAccessDocumentId("grade-9", "a__student__student-1", "student"));
});

test("only an authenticated administrator can manage memberships", async () => {
  const db = createFakeDb(SEED);
  assert.equal((await call(db, TEACHER, "POST", "/memberships", { classId: "grade-9-a", studentUid: "student-1" })).status, 403);
});

test("enrollment validates active class and active student relationship", async () => {
  const db = createFakeDb(SEED);
  assert.equal((await call(db, ADMIN, "POST", "/memberships", { classId: "missing", studentUid: "student-1" })).status, 404);
  assert.equal((await call(db, ADMIN, "POST", "/memberships", { classId: "grade-9-a", studentUid: "teacher-1" })).status, 400);
  db.updateDocument("users", "student-1", { active: false });
  assert.equal((await call(db, ADMIN, "POST", "/memberships", { classId: "grade-9-a", studentUid: "student-1" })).status, 400);
  assert.equal(db.store.has(`classAccess/${MEMBERSHIP_ID}`), false);
});

test("duplicate concurrent enrollment creates exactly one active membership", async () => {
  const db = createFakeDb(SEED);
  const [first, second] = await Promise.all([
    call(db, ADMIN, "POST", "/memberships", { classId: "grade-9-a", studentUid: "student-1" }),
    call(db, ADMIN, "POST", "/memberships", { classId: "grade-9-a", studentUid: "student-1" })
  ]);
  assert.deepEqual([first.status, second.status].sort(), [201, 409]);
  assert.equal(db.store.get(`classAccess/${MEMBERSHIP_ID}`).active, true);
  assert.equal([...db.store.keys()].filter((key) => key.startsWith("membershipHistory/")).length, 1);
});

test("deactivation is atomic, concurrent-safe and preserves membership history", async () => {
  const db = createFakeDb(SEED);
  await call(db, ADMIN, "POST", "/memberships", { classId: "grade-9-a", studentUid: "student-1" });
  const path = "/memberships/grade-9-a/student-1/deactivate";
  const [first, second] = await Promise.all([
    call(db, ADMIN, "POST", path), call(db, ADMIN, "POST", path)
  ]);
  assert.deepEqual([first.status, second.status].sort(), [200, 409]);
  assert.equal(db.store.get(`classAccess/${MEMBERSHIP_ID}`).active, false);
  assert.equal(db.store.has(`users/student-1`), true);
  const history = [...db.store.entries()].filter(([key]) => key.startsWith("membershipHistory/")).map(([, value]) => value);
  assert.deepEqual(history.map((entry) => entry.action).sort(), ["membership.deactivated", "membership.enrolled"]);
});

test("an inactive historical membership can be reactivated without creating a second record", async () => {
  const db = createFakeDb(SEED);
  await call(db, ADMIN, "POST", "/memberships", { classId: "grade-9-a", studentUid: "student-1" });
  await call(db, ADMIN, "POST", "/memberships/grade-9-a/student-1/deactivate");
  const result = await call(db, ADMIN, "POST", "/memberships", { classId: "grade-9-a", studentUid: "student-1" });
  assert.equal(result.status, 200);
  assert.equal(db.store.get(`classAccess/${MEMBERSHIP_ID}`).active, true);
  assert.equal([...db.store.keys()].filter((key) => key.startsWith("classAccess/")).length, 1);
  assert.equal([...db.store.keys()].filter((key) => key.startsWith("membershipHistory/")).length, 3);
});

test("administrator can filter membership records by student UID", async () => {
  const db = createFakeDb(SEED);
  await call(db, ADMIN, "POST", "/memberships", { classId: "grade-9-a", studentUid: "student-1" });
  const response = await handleMemberships(new Request("https://example.test/api/memberships?studentUid=student-1"), {
    path: "/memberships", user: ADMIN, db, serverTimestamp: () => "SERVER_TS"
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.data.memberships.length, 1);
  assert.equal(result.data.memberships[0].userUid, "student-1");
});
