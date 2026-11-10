import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleAdmin } from "../../netlify/functions/lib/routes/admin.mjs";
import { toIso } from "../../netlify/functions/lib/routes/audit-logs.mjs";
import { createFakeDb } from "../helpers/fake-firestore.mjs";

const ADMIN = { uid: "admin-1", role: "admin" };
const TEACHER = { uid: "teacher-1", role: "teacher" };
const STUDENT = { uid: "student-1", role: "student" };

const USERS = {
  "admin-1": { role: "admin", active: true, displayName: "Secret Admin Name", academyId: "SA-ADM-001", email: "admin@example.invalid" },
  "teacher-1": { role: "teacher", active: true, displayName: "Secret Teacher Name", academyId: "SA-TCH-001" },
  "student-1": { role: "student", active: true, displayName: "Secret Student Name", academyId: "SA-2026-001" }
};

function entry(overrides = {}) {
  return {
    actorUid: "teacher-1", actorRole: "teacher", action: "assignment.created",
    targetType: "assignment", targetId: "asg-1", metadata: { classId: "grade-9-a", subjectId: "physics-9" },
    createdAt: "2026-11-08T04:20:00.000Z", ...overrides
  };
}

function seedLogs(items) {
  return { users: USERS, auditLogs: Object.fromEntries(items.map((item, index) => [`log-${String(index).padStart(4, "0")}`, item])) };
}

async function call(db, user, method, path, body) {
  const init = { method };
  if (body !== undefined) init.body = JSON.stringify(body);
  const url = `https://example.test/api${path}`;
  const response = await handleAdmin(new Request(url, init), {
    path: new URL(url).pathname.replace(/^\/api/, ""), user, db, serverTimestamp: () => "SERVER_TS"
  });
  return { status: response.status, json: await response.json() };
}

const BASE = [
  entry({ id: 1, action: "assignment.created", createdAt: "2026-11-08T04:20:00.000Z" }),
  entry({ action: "attendance.marked", targetType: "attendance", targetId: "grade-9-a", metadata: { classId: "grade-9-a", attendanceDate: "2026-11-08", count: 24 }, createdAt: "2026-11-08T03:55:00.000Z" }),
  entry({ actorUid: "admin-1", actorRole: "admin", action: "notice.created", targetType: "notice", targetId: "n-1", metadata: { scope: "school", classId: null }, createdAt: "2026-11-07T10:10:00.000Z" }),
  entry({ actorUid: "admin-1", actorRole: "admin", action: "account.provisioned.pending_activation", targetType: "user", targetId: "student-1", metadata: { role: "student", academyId: "SA-2026-001" }, createdAt: "2026-11-06T06:45:00.000Z" }),
  entry({ actorUid: "admin-1", actorRole: "admin", action: "membership.enrolled", targetType: "classAccess", targetId: "ca_hash", metadata: { classId: "grade-9-a", studentUid: "student-1" }, createdAt: "2026-11-05T05:00:00.000Z" }),
  entry({ actorUid: "teacher-1", actorRole: "teacher", action: "assessment.submitted", targetType: "assessment", targetId: "as-1", metadata: { score: 98, answers: ["secret"], studentName: "Secret Student Name" }, createdAt: "2026-10-30T05:00:00.000Z" })
];

test("administrator receives real audit records, newest first, with readable descriptions", async () => {
  const db = createFakeDb(seedLogs(BASE));
  const result = await call(db, ADMIN, "GET", "/admin/audit-logs");
  assert.equal(result.status, 200);
  const { records, hasMore, nextCursor, limit } = result.json.data;
  assert.equal(records.length, 6);
  assert.equal(hasMore, false);
  assert.equal(nextCursor, null);
  assert.equal(limit, 25);
  assert.deepEqual(records.map((r) => r.action), [
    "assignment.created", "attendance.marked", "notice.created",
    "account.provisioned.pending_activation", "membership.enrolled", "assessment.submitted"
  ]);
  assert.equal(records[0].description, "Created an assignment draft");
  assert.equal(records[0].category, "Assignments");
  assert.equal(records[0].createdAt, "2026-11-08T04:20:00.000Z");
  assert.equal(records[0].actorAcademyId, "SA-TCH-001");
  assert.equal(records[0].actorRole, "teacher");
});

test("teachers and students are denied before any audit data is read", async () => {
  const db = createFakeDb(seedLogs(BASE));
  for (const user of [TEACHER, STUDENT]) {
    const result = await call(db, user, "GET", "/admin/audit-logs");
    assert.equal(result.status, 403);
    assert.equal(result.json.error.code, "FORBIDDEN");
    assert.equal(result.json.data, undefined);
    assert.equal(JSON.stringify(result.json).includes("assignment.created"), false);
  }
  assert.equal((await call(db, TEACHER, "GET", "/admin/audit-logs?limit=1&action=notice.created")).status, 403);
  assert.equal((await call(db, undefined, "GET", "/admin/audit-logs")).status, 403);
  assert.equal((await call(db, { uid: "x", role: "guest" }, "GET", "/admin/audit-logs")).status, 403);
});

test("audit logs cannot be created, changed or deleted through this endpoint", async () => {
  const db = createFakeDb(seedLogs(BASE));
  const before = JSON.stringify([...db.store.entries()]);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const result = await call(db, ADMIN, method, "/admin/audit-logs", { action: "forged.action" });
    assert.equal(result.status, 405, `${method} must be rejected`);
  }
  assert.equal((await call(db, ADMIN, "GET", "/admin/audit-logs/log-0000")).status, 404);
  assert.equal((await call(db, ADMIN, "DELETE", "/admin/audit-logs/log-0000")).status, 404);
  assert.equal((await call(db, ADMIN, "GET", "/admin/audit-logs?limit=5")).status, 200);
  assert.equal(JSON.stringify([...db.store.entries()]), before);
});

test("listing reads only auditLogs and the academy ID of actors", async () => {
  const db = createFakeDb(seedLogs(BASE));
  const touched = new Set();
  const original = db.collection.bind(db);
  db.collection = (name) => { touched.add(name); return original(name); };
  assert.equal((await call(db, ADMIN, "GET", "/admin/audit-logs")).status, 200);
  assert.deepEqual([...touched].sort(), ["auditLogs", "users"]);
});

test("pagination returns every record exactly once and stays stable across identical timestamps", async () => {
  const items = Array.from({ length: 12 }, (_, i) => entry({
    action: "notice.created", targetId: `n-${i}`,
    // Pairs of records share one timestamp to exercise the document-ID tiebreak.
    createdAt: `2026-11-0${1 + Math.floor(i / 2)}T08:00:00.000Z`
  }));
  const db = createFakeDb(seedLogs(items));
  const seen = [];
  let cursor = null;
  let pages = 0;
  do {
    const query = `/admin/audit-logs?limit=5${cursor ? `&cursor=${cursor}` : ""}`;
    const result = await call(db, ADMIN, "GET", query);
    assert.equal(result.status, 200);
    seen.push(...result.json.data.records.map((r) => r.targetId));
    cursor = result.json.data.nextCursor;
    pages += 1;
    assert.equal(result.json.data.hasMore, cursor !== null);
  } while (cursor && pages < 10);
  assert.equal(pages, 3);
  assert.equal(seen.length, 12);
  assert.equal(new Set(seen).size, 12);
  const dates = seen.map((id) => items.find((item) => item.targetId === id).createdAt);
  assert.deepEqual(dates, [...dates].sort().reverse());
});

test("limit defaults, caps and validation", async () => {
  const items = Array.from({ length: 30 }, (_, i) => entry({ targetId: `a-${i}`, createdAt: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString() }));
  const db = createFakeDb(seedLogs(items));
  assert.equal((await call(db, ADMIN, "GET", "/admin/audit-logs")).json.data.records.length, 25);
  assert.equal((await call(db, ADMIN, "GET", "/admin/audit-logs?limit=1")).json.data.records.length, 1);
  for (const bad of ["0", "101", "-1", "abc", "1.5", "9999"]) {
    assert.equal((await call(db, ADMIN, "GET", `/admin/audit-logs?limit=${bad}`)).status, 400, `limit=${bad}`);
  }
});

test("invalid or unknown cursors are rejected without leaking data", async () => {
  const db = createFakeDb(seedLogs(BASE));
  for (const cursor of ["does-not-exist", "../users/admin-1", "a b", "x".repeat(200)]) {
    const result = await call(db, ADMIN, "GET", `/admin/audit-logs?cursor=${encodeURIComponent(cursor)}`);
    assert.equal(result.status, 400, cursor);
    assert.equal(result.json.data, undefined);
  }
});

test("filters: action, role, category, date range and text search", async () => {
  const db = createFakeDb(seedLogs(BASE));
  const get = async (query) => (await call(db, ADMIN, "GET", `/admin/audit-logs?${query}`)).json.data.records.map((r) => r.action);

  assert.deepEqual(await get("action=notice.created"), ["notice.created"]);
  assert.deepEqual(await get("actorRole=admin"), ["notice.created", "account.provisioned.pending_activation", "membership.enrolled"]);
  assert.deepEqual(await get("category=Attendance"), ["attendance.marked"]);
  assert.deepEqual(await get("category=Classes"), ["membership.enrolled"]);
  assert.deepEqual(await get("category=Account"), ["account.provisioned.pending_activation"]);
  assert.deepEqual(await get("actorRole=teacher&category=Assessments"), ["assessment.submitted"]);
  assert.deepEqual(await get("action=notice.created&actorRole=teacher"), []);
  assert.deepEqual(await get("from=2026-11-07&to=2026-11-08"), ["assignment.created", "attendance.marked", "notice.created"]);
  assert.deepEqual(await get("to=2026-10-31"), ["assessment.submitted"]);
  assert.deepEqual(await get("q=ENROLLED"), ["membership.enrolled"]);
  assert.deepEqual(await get("q=grade-9-a"), ["attendance.marked", "assignment.created", "membership.enrolled"].sort((a, b) => BASE.findIndex((e) => e.action === a) - BASE.findIndex((e) => e.action === b)));
  assert.deepEqual(await get("q=no-such-text"), []);
});

test("date filters use the academy calendar day (UTC+05:00)", async () => {
  const db = createFakeDb(seedLogs([
    entry({ action: "notice.created", targetId: "late-night", createdAt: "2026-11-07T19:30:00.000Z" }), // 2026-11-08 00:30 local
    entry({ action: "notice.created", targetId: "evening", createdAt: "2026-11-07T18:30:00.000Z" })     // 2026-11-07 23:30 local
  ]));
  const result = await call(db, ADMIN, "GET", "/admin/audit-logs?from=2026-11-08&to=2026-11-08");
  assert.deepEqual(result.json.data.records.map((r) => r.targetId), ["late-night"]);
});

test("invalid filter values are rejected", async () => {
  const db = createFakeDb(seedLogs(BASE));
  const bad = [
    "actorRole=superuser", "category=Secrets", "action=bad%20action!", "from=2026-13-01", "from=2026-02-31",
    "to=yesterday", "from=2026-11-09&to=2026-11-01", `q=${"x".repeat(101)}`
  ];
  for (const query of bad) {
    const result = await call(db, ADMIN, "GET", `/admin/audit-logs?${query}`);
    assert.equal(result.status, 400, query);
    assert.equal(result.json.error.code, "INVALID_INPUT");
  }
});

test("responses are allowlisted: no names, e-mail, raw metadata, scores or actor UIDs", async () => {
  const db = createFakeDb(seedLogs(BASE));
  const result = await call(db, ADMIN, "GET", "/admin/audit-logs");
  const serialized = JSON.stringify(result.json);
  for (const secret of ["Secret Admin Name", "Secret Teacher Name", "Secret Student Name", "example.invalid", "\"score\"", "answers", "studentUid", "actorUid", "teacher-1\""]) {
    assert.equal(serialized.includes(secret), false, `response must not contain ${secret}`);
  }
  const allowed = new Set(["id", "action", "category", "description", "actorRole", "actorAcademyId", "targetType", "targetId", "metadata", "createdAt"]);
  for (const record of result.json.data.records) {
    assert.deepEqual(Object.keys(record).filter((key) => !allowed.has(key)), []);
  }
  const submitted = result.json.data.records.find((r) => r.action === "assessment.submitted");
  assert.deepEqual(submitted.metadata, {});
  const enrolled = result.json.data.records.find((r) => r.action === "membership.enrolled");
  assert.deepEqual(enrolled.metadata, { classId: "grade-9-a" });
});

test("search does not match fields that are withheld from the response", async () => {
  const db = createFakeDb(seedLogs(BASE));
  for (const hidden of ["Secret Student Name", "secret", "98", "teacher-1"]) {
    const result = await call(db, ADMIN, "GET", `/admin/audit-logs?q=${encodeURIComponent(hidden)}`);
    assert.deepEqual(result.json.data.records, [], hidden);
  }
});

test("unknown actions, missing actors and odd timestamps degrade safely", async () => {
  const db = createFakeDb({
    users: USERS,
    auditLogs: {
      "log-a": { actorUid: "ghost", actorRole: "admin", action: "future.thing_happened", createdAt: "2026-11-02T00:00:00.000Z" },
      "log-b": { actorUid: "admin-1", actorRole: "wizard", action: 42, targetType: { x: 1 }, metadata: "oops", createdAt: { _seconds: 1793000000, _nanoseconds: 0 } },
      "log-c": { actorRole: "teacher", action: "notice.created", createdAt: "2026-11-01T00:00:00.000Z" }
    }
  });
  const result = await call(db, ADMIN, "GET", "/admin/audit-logs");
  assert.equal(result.status, 200);
  const byId = Object.fromEntries(result.json.data.records.map((r) => [r.id, r]));
  assert.equal(byId["log-a"].category, "Other");
  assert.equal(byId["log-a"].description, "Recorded action: future thing happened");
  assert.equal(byId["log-a"].actorAcademyId, null);
  assert.equal(byId["log-b"].action, null);
  assert.equal(byId["log-b"].actorRole, null);
  assert.equal(byId["log-b"].targetType, null);
  assert.deepEqual(byId["log-b"].metadata, {});
  assert.equal(byId["log-c"].actorAcademyId, null);
});

test("timestamp normalisation supports Firestore Timestamp shapes", () => {
  assert.equal(toIso({ toDate: () => new Date("2026-11-08T00:00:00.000Z") }), "2026-11-08T00:00:00.000Z");
  assert.equal(toIso({ _seconds: 1, _nanoseconds: 500000000 }), "1970-01-01T00:00:01.500Z");
  assert.equal(toIso({ seconds: 2, nanoseconds: 0 }), "1970-01-01T00:00:02.000Z");
  assert.equal(toIso(new Date("2026-01-01T00:00:00Z")), "2026-01-01T00:00:00.000Z");
  assert.equal(toIso("not a date"), null);
  assert.equal(toIso(undefined), null);
  assert.equal(toIso("SERVER_TS"), null);
});

test("a long run of non-matching records is scanned within a bounded window and can be resumed", async () => {
  const noise = Array.from({ length: 620 }, (_, i) => entry({ action: "notice.created", targetId: `noise-${i}`, createdAt: new Date(Date.UTC(2026, 10, 1) - i * 60000).toISOString() }));
  const target = entry({ action: "attendance.marked", targetType: "attendance", targetId: "needle", createdAt: "2020-01-01T00:00:00.000Z" });
  const db = createFakeDb(seedLogs([...noise, target]));
  const first = await call(db, ADMIN, "GET", "/admin/audit-logs?category=Attendance&limit=5");
  assert.equal(first.status, 200);
  assert.equal(first.json.data.records.length, 0);
  assert.equal(first.json.data.hasMore, true);
  assert.equal(first.json.data.scanLimited, true);
  const second = await call(db, ADMIN, "GET", `/admin/audit-logs?category=Attendance&limit=5&cursor=${first.json.data.nextCursor}`);
  assert.deepEqual(second.json.data.records.map((r) => r.targetId), ["needle"]);
  assert.equal(second.json.data.hasMore, false);
  assert.equal(second.json.data.scanLimited, false);
});

test("empty audit collection returns an accurate empty result", async () => {
  const db = createFakeDb({ users: USERS });
  const result = await call(db, ADMIN, "GET", "/admin/audit-logs");
  assert.equal(result.status, 200);
  assert.deepEqual(result.json.data, { records: [], nextCursor: null, hasMore: false, scanLimited: false, limit: 25 });
});

test("browser Firestore rules stay deny-all and the needed indexes are declared", () => {
  const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
  assert.match(rules, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);
  assert.equal(/auditLogs/.test(rules), false, "no rule may open auditLogs to browsers");
  const indexes = JSON.parse(readFileSync(new URL("../../firestore.indexes.json", import.meta.url), "utf8")).indexes;
  const has = (first) => indexes.some((index) => index.collectionGroup === "auditLogs" &&
    index.fields[0].fieldPath === first && index.fields[1]?.fieldPath === "createdAt" && index.fields[1].order === "DESCENDING");
  assert.ok(has("action"), "auditLogs action+createdAt index");
  assert.ok(has("actorRole"), "auditLogs actorRole+createdAt index");
});
