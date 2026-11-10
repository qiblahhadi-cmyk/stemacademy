import test from "node:test";
import assert from "node:assert/strict";
import { handleRoster } from "../../netlify/functions/lib/routes/roster.mjs";
import { handleDashboard } from "../../netlify/functions/lib/routes/dashboard.mjs";
import { handleOwnProfile, validateProfileUpdate } from "../../netlify/functions/lib/routes/profile.mjs";
import { classAccessDocumentId } from "../../netlify/functions/lib/authorization.mjs";
import { createFakeDb } from "../helpers/fake-firestore.mjs";

const ADMIN = { uid: "admin-1", role: "admin" };
const TEACHER = { uid: "teacher-1", role: "teacher" };
const OTHER_TEACHER = { uid: "teacher-2", role: "teacher" };
const STUDENT = { uid: "student-1", role: "student" };

function membership(classId, uid, active = true) {
  return [classAccessDocumentId(classId, uid, "student"), { classId, userUid: uid, accessType: "student", active }];
}
function teacherAccess(classId, uid) {
  return [classAccessDocumentId(classId, uid, "teacher"), { classId, userUid: uid, accessType: "teacher", active: true }];
}

const SEED = {
  classes: {
    "grade-9-a": { name: "Grade 9 A", grade: 9, active: true, academicSessionId: "2026-27" },
    "grade-9-b": { name: "Grade 9 B", grade: 9, active: true, academicSessionId: "2026-27" },
    "grade-10-a": { name: "Grade 10 A", grade: 10, active: true, academicSessionId: "2026-27" },
    "archived-class": { name: "Old class", grade: 9, active: false }
  },
  subjects: { physics9: { grade: 9, active: true, name: "Physics", board: "AJK" } },
  users: {
    "admin-1": { role: "admin", active: true, displayName: "Admin", academyId: "SA-ADM-001" },
    "teacher-1": { role: "teacher", active: true, displayName: "Teacher One", academyId: "SA-TCH-001", email: "t1@example.invalid" },
    "teacher-2": { role: "teacher", active: true, displayName: "Teacher Two", academyId: "SA-TCH-002" },
    "student-1": { role: "student", active: true, displayName: "Ali Raza", academyId: "SA-2026-001", uid: "student-1" },
    "student-2": { role: "student", active: true, displayName: "Sana Khan", academyId: "SA-2026-002" },
    "student-3": { role: "student", active: false, displayName: "Left Student", academyId: "SA-2026-003" }
  },
  classAccess: Object.fromEntries([
    membership("grade-9-a", "student-1"),
    membership("grade-9-a", "student-2"),
    membership("grade-9-a", "student-3"),
    membership("grade-9-b", "student-2"),
    membership("grade-10-a", "student-1", false),
    teacherAccess("grade-9-a", "teacher-1"),
    teacherAccess("grade-9-b", "teacher-1"),
    teacherAccess("grade-9-a", "teacher-2"),
    teacherAccess("grade-10-a", "teacher-2")
  ]),
  teachingAssignments: {
    "ta-1": { teacherUid: "teacher-1", classId: "grade-9-a", subjectId: "physics9", active: true },
    "ta-2": { teacherUid: "teacher-1", classId: "grade-9-b", subjectId: "physics9", active: true },
    "ta-3": { teacherUid: "teacher-2", classId: "grade-9-a", subjectId: "physics9", active: true },
    "ta-4": { teacherUid: "teacher-2", classId: "grade-10-a", subjectId: "physics9", active: false }
  },
  notices: {
    "n-academy": { title: "Academy notice", body: "Hello all", scope: "academy", priority: "normal", active: true, createdAt: { _seconds: 100 } },
    "n-9a": { title: "Grade 9 A notice", body: "Bring lab coats", scope: "class", classId: "grade-9-a", priority: "normal", active: true, createdAt: { _seconds: 200 } },
    "n-10a": { title: "Grade 10 notice", body: "Not for grade 9", scope: "class", classId: "grade-10-a", priority: "normal", active: true, createdAt: { _seconds: 300 } }
  }
};

const roster = (db, user, classId) => handleRoster(
  new Request(`https://example.test/api/classes/${classId}/roster`, { method: "GET" }),
  { path: `/classes/${classId}/roster`, user, db }
);
const dashboard = (db, user) => handleDashboard(new Request("https://example.test/api/dashboard"), { path: "/dashboard", user, db });

test("administrators see active students and staff of any active class; inactive people are excluded", async () => {
  const db = createFakeDb(SEED);
  const response = await roster(db, ADMIN, "grade-9-a");
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.deepEqual(data.students.map((s) => s.displayName), ["Ali Raza", "Sana Khan"]);
  assert.deepEqual(data.teachers.map((t) => t.displayName), ["Teacher One", "Teacher Two"]);
  assert.deepEqual(data.counts, { students: 2, teachers: 2 });
});

test("roster rows expose only academy ID and display name, never UIDs, emails or timestamps", async () => {
  const db = createFakeDb(SEED);
  const { data } = await (await roster(db, ADMIN, "grade-9-a")).json();
  for (const row of [...data.students, ...data.teachers]) {
    assert.deepEqual(Object.keys(row).sort(), ["academyId", "displayName"]);
  }
  assert.doesNotMatch(JSON.stringify(data), /student-1|teacher-1|t1@example|createdAt/);
});

test("a teacher sees the roster of an assigned class", async () => {
  const db = createFakeDb(SEED);
  const response = await roster(db, TEACHER, "grade-9-b");
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.students.map((s) => s.academyId), ["SA-2026-002"]);
});

test("a teacher with class access but no teaching assignment gets the same 404 as a missing class", async () => {
  const db = createFakeDb({ ...SEED, teachingAssignments: {} });
  const denied = await roster(db, TEACHER, "grade-9-a");
  const missing = await roster(db, TEACHER, "no-such-class");
  assert.equal(denied.status, 404);
  assert.equal(missing.status, 404);
  assert.deepEqual(await denied.json(), await missing.json());
});

test("inactive or archived classes are not found for any role", async () => {
  const db = createFakeDb(SEED);
  assert.equal((await roster(db, ADMIN, "archived-class")).status, 404);
  assert.equal((await roster(db, ADMIN, "bad/id")).status, 404);
});

test("students are refused the roster outright", async () => {
  const db = createFakeDb(SEED);
  assert.equal((await roster(db, STUDENT, "grade-9-a")).status, 403);
});

test("the roster ignores teaching assignments that have been deactivated", async () => {
  const db = createFakeDb(SEED);
  const { data } = await (await roster(db, ADMIN, "grade-10-a")).json();
  assert.deepEqual(data.teachers, []);
  assert.deepEqual(data.students, []);
  assert.equal(data.counts.students, 0);
});

test("administrator dashboard counts active academy-wide records only", async () => {
  const db = createFakeDb(SEED);
  const { data } = await (await dashboard(db, ADMIN)).json();
  assert.equal(data.role, "admin");
  assert.deepEqual(data.metrics, { activeClasses: 3, activeStudents: 2, activeTeachers: 2, activeNotices: 3, unreadMessages: 0 });
});

test("teacher dashboard counts only assigned classes, their students and their assignments", async () => {
  const db = createFakeDb(SEED);
  const { data } = await (await dashboard(db, TEACHER)).json();
  assert.deepEqual(data.metrics, {
    assignedClasses: 2,
    studentsInMyClasses: 2,
    myTeachingAssignments: 2,
    visibleNotices: 2,
    unreadMessages: 0
  });
});

test("teacher dashboard does not reveal notices or students for classes outside the assignment", async () => {
  const db = createFakeDb({ ...SEED, teachingAssignments: { "ta-1": SEED.teachingAssignments["ta-1"] } });
  const { data } = await (await dashboard(db, TEACHER)).json();
  assert.equal(data.metrics.assignedClasses, 1);
  assert.equal(data.metrics.studentsInMyClasses, 2);
  assert.equal(data.metrics.visibleNotices, 2);
});

test("student dashboard counts only the student's own active enrolments", async () => {
  const db = createFakeDb(SEED);
  const { data } = await (await dashboard(db, STUDENT)).json();
  assert.deepEqual(data.metrics, { enrolledClasses: 1, visibleNotices: 2, unreadMessages: 0 });
});

test("a student with no enrolments sees zeros, not sample figures", async () => {
  const db = createFakeDb({ ...SEED, classAccess: {} });
  const { data } = await (await dashboard(db, STUDENT)).json();
  assert.deepEqual(data.metrics, { enrolledClasses: 0, visibleNotices: 1, unreadMessages: 0 });
});

test("dashboard rejects non-GET methods", async () => {
  const db = createFakeDb(SEED);
  const response = await handleDashboard(new Request("https://example.test/api/dashboard", { method: "POST" }), { path: "/dashboard", user: ADMIN, db });
  assert.equal(response.status, 405);
});

const profileCall = (db, user, body) => handleOwnProfile(
  new Request("https://example.test/api/me", { method: "PATCH", body: JSON.stringify(body) }),
  { path: "/me", user, db, serverTimestamp: () => "SERVER_TS" }
);

test("a user may change their own display name and the change is audited", async () => {
  const db = createFakeDb(SEED);
  const response = await profileCall(db, STUDENT, { displayName: "  Ali  Raza  " });
  assert.equal(response.status, 200);
  assert.equal(db.store.get("users/student-1").displayName, "Ali  Raza");
  const audit = [...db.store.entries()].filter(([k]) => k.startsWith("auditLogs/")).map(([, v]) => v);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, "profile.displayName.updated");
  assert.equal(audit[0].targetId, "student-1");
  assert.deepEqual(audit[0].metadata, { fields: ["displayName"] });
  assert.doesNotMatch(JSON.stringify(audit[0]), /Ali/);
});

test("profile update refuses role, active status, academy ID and other protected fields", async () => {
  const db = createFakeDb(SEED);
  for (const field of ["role", "active", "academyId", "uid", "provisioningStatus", "mustChangePassword", "email"]) {
    const response = await profileCall(db, STUDENT, { displayName: "Ali Raza", [field]: "x" });
    assert.equal(response.status, 400, `${field} must be refused`);
  }
  const unchanged = db.store.get("users/student-1");
  assert.equal(unchanged.role, "student");
  assert.equal(unchanged.academyId, "SA-2026-001");
  assert.equal(unchanged.active, true);
});

test("display name validation rejects empty, oversized, non-text and control-character values", () => {
  assert.ok(validateProfileUpdate({ displayName: " " }).error);
  assert.ok(validateProfileUpdate({ displayName: "A" }).error);
  assert.ok(validateProfileUpdate({ displayName: "x".repeat(61) }).error);
  assert.ok(validateProfileUpdate({ displayName: 42 }).error);
  assert.ok(validateProfileUpdate({ displayName: "Ali\u0000" }).error);
  assert.ok(validateProfileUpdate({ displayName: "Ali\nRaza" }).error);
  assert.ok(validateProfileUpdate(null).error);
  assert.ok(validateProfileUpdate({}).error);
  assert.equal(validateProfileUpdate({ displayName: "Ali Raza" }).value, "Ali Raza");
});

test("a profile update cannot target another account, because the UID comes from the verified user only", async () => {
  const db = createFakeDb(SEED);
  await profileCall(db, STUDENT, { displayName: "Changed Name" });
  assert.equal(db.store.get("users/student-2").displayName, "Sana Khan");
  assert.equal(db.store.get("users/student-1").displayName, "Changed Name");
});

test("an inactive account cannot update its profile through this route", async () => {
  const db = createFakeDb({ ...SEED, users: { ...SEED.users, "student-1": { ...SEED.users["student-1"], active: false } } });
  const response = await profileCall(db, STUDENT, { displayName: "Ali Raza" });
  assert.equal(response.status, 404);
});
