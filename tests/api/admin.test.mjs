import test from "node:test";
import assert from "node:assert/strict";
import { handleAdmin } from "../../netlify/functions/lib/routes/admin.mjs";
import { createFakeDb } from "../helpers/fake-firestore.mjs";

const ADMIN = { uid: "admin-1", role: "admin" };
const TEACHER = { uid: "teacher-1", role: "teacher" };
const SEED = {
  users: {
    "admin-1": { role: "admin", active: true },
    "teacher-1": { role: "teacher", active: true, displayName: "Teacher One", academyId: "SA-TCH-001" },
    "student-1": { role: "student", active: true, displayName: "Student One", academyId: "SA-2026-001" }
  },
  classes: { "grade-9-a": { name: "Grade 9 A", grade: 9, academicSessionId: "2026", active: true } },
  subjects: { "physics-9": { name: "Physics", board: "AJK", grade: 9, active: true } }
};
async function call(db, user, method, path, body, extra = {}) {
  const init = { method };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await handleAdmin(new Request(`https://example.test/api${path}`, init), {
    path: new URL(`https://example.test/api${path}`).pathname.replace(/^\/api/, ""), user, db, serverTimestamp: () => "SERVER_TS", ...extra
  });
  return { status: response.status, json: await response.json() };
}

test("administrator API rejects non-admins before exposing management records", async () => {
  const db = createFakeDb(SEED);
  assert.equal((await call(db, TEACHER, "GET", "/admin/students")).status, 403);
});

test("student and teacher listings are role-filtered and searchable", async () => {
  const db = createFakeDb(SEED);
  const students = await call(db, ADMIN, "GET", "/admin/students?q=student");
  assert.equal(students.status, 200);
  assert.deepEqual(students.json.data.records.map((r) => r.academyId), ["SA-2026-001"]);
  const staff = await call(db, ADMIN, "GET", "/admin/staff");
  assert.deepEqual(staff.json.data.records.map((r) => r.academyId), ["SA-TCH-001"]);
});

test("class and subject creation validates AJK grade relationships and audits changes", async () => {
  const db = createFakeDb(SEED);
  assert.equal((await call(db, ADMIN, "POST", "/admin/classes", { name: "Bad", grade: 11, academicSessionId: "2026" })).status, 400);
  const createdClass = await call(db, ADMIN, "POST", "/admin/classes", { name: "Grade 10 B", grade: 10, academicSessionId: "2026" });
  assert.equal(createdClass.status, 201);
  const id = createdClass.json.data.id;
  assert.equal((await call(db, ADMIN, "PATCH", `/admin/classes/${id}`, { name: "Grade 10 B Updated" })).status, 200);
  assert.equal(db.store.get(`classes/${id}`).name, "Grade 10 B Updated");
  assert.equal((await call(db, ADMIN, "PATCH", `/admin/classes/${id}`, { grade: 9 })).status, 400);
  assert.equal([...db.store.keys()].filter((key) => key.startsWith("auditLogs/")).length, 2);
});

test("student and staff updates cannot alter role or permanent academy ID", async () => {
  const db = createFakeDb(SEED);
  assert.equal((await call(db, ADMIN, "PATCH", "/admin/students/student-1", { academyId: "SA-2026-999" })).status, 400);
  assert.equal((await call(db, ADMIN, "PATCH", "/admin/staff/teacher-1", { role: "admin" })).status, 400);
  assert.equal((await call(db, ADMIN, "POST", "/admin/students/student-1/deactivate")).status, 200);
  assert.equal(db.store.get("users/student-1").active, false);
  assert.equal(db.store.get("users/student-1").academyId, "SA-2026-001");
});

test("teaching assignment requires an active teacher and same-grade active class and subject", async () => {
  const db = createFakeDb(SEED);
  assert.equal((await call(db, ADMIN, "POST", "/admin/teaching-assignments", {
    teacherUid: "student-1", classId: "grade-9-a", subjectId: "physics-9"
  })).status, 400);
  const created = await call(db, ADMIN, "POST", "/admin/teaching-assignments", {
    teacherUid: "teacher-1", classId: "grade-9-a", subjectId: "physics-9"
  });
  assert.equal(created.status, 201);
  assert.equal(db.store.get(`teachingAssignments/${created.json.data.id}`).active, true);
  assert.equal([...db.store.entries()].some(([key, value]) => key.startsWith("classAccess/") && value.userUid === "teacher-1" && value.active), true);
});

test("provisioning creates a disabled Auth account and pending profile without exposing a credential", async () => {
  const db = createFakeDb(SEED);
  const createdAuth = [];
  const auth = {
    async createUser(input) { createdAuth.push(input); return { uid: "new-student-uid" }; },
    async deleteUser() {}
  };
  const result = await call(db, ADMIN, "POST", "/admin/accounts", { role: "student", displayName: "New Student" }, {
    auth, allocateStudentId: async () => "SA-2026-003"
  });
  assert.equal(result.status, 201);
  assert.deepEqual(createdAuth, [{ email: "sa-2026-003@stemacademy.edu.pk", displayName: "New Student", disabled: true }]);
  assert.equal(db.store.get("users/new-student-uid").active, false);
  assert.equal(db.store.get("users/new-student-uid").provisioningStatus, "pending_activation");
  assert.equal("password" in result.json.data, false);
  assert.equal("email" in result.json.data, false);
});

test("provisioning rejects role escalation and compensates failed profile persistence", async () => {
  const db = createFakeDb(SEED);
  const authCalls = [];
  const auth = {
    async createUser(input) { authCalls.push(["create", input]); return { uid: "new-uid" }; },
    async deleteUser(uid) { authCalls.push(["delete", uid]); }
  };
  assert.equal((await call(db, ADMIN, "POST", "/admin/accounts", { role: "admin", displayName: "Escalation" }, { auth })).status, 400);
  const noAuth = await call(db, ADMIN, "POST", "/admin/accounts", { role: "teacher", displayName: "New Teacher" }, {
    auth, allocateStaffId: async () => "SA-TCH-002",
    // Force a collision at the trusted profile key to verify Auth cleanup.
    db: { ...db, runTransaction: async () => { throw new Error("CONFLICT"); } }
  });
  assert.equal(noAuth.status, 409);
  assert.deepEqual(authCalls.map((x) => x[0]), ["create", "delete"]);
});

test("pending accounts cannot be activated through ordinary administrator profile edits", async () => {
  const db = createFakeDb({ users: { pending: { role: "student", active: false, provisioningStatus: "pending_activation", academyId: "SA-2026-004" } } });
  const result = await call(db, ADMIN, "PATCH", "/admin/students/pending", { active: true });
  assert.equal(result.status, 409);
  assert.equal(db.store.get("users/pending").active, false);
});

test("deactivation disables Firebase Auth as defense in depth", async () => {
  const db = createFakeDb(SEED);
  const updates = [];
  const result = await call(db, ADMIN, "POST", "/admin/students/student-1/deactivate", undefined, {
    auth: { async updateUser(uid, patch) { updates.push({ uid, ...patch }); } }
  });
  assert.equal(result.status, 200);
  assert.deepEqual(updates, [{ uid: "student-1", disabled: true }]);
  assert.equal(db.store.get("users/student-1").active, false);
});

test("teaching assignment IDs prevent duplicate records for the same tuple", async () => {
  const db = createFakeDb(SEED);
  const payload = { teacherUid: "teacher-1", classId: "grade-9-a", subjectId: "physics-9" };
  const first = await call(db, ADMIN, "POST", "/admin/teaching-assignments", payload);
  const second = await call(db, ADMIN, "POST", "/admin/teaching-assignments", payload);
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(first.json.data.id, second.json.data.id);
  assert.equal([...db.store.keys()].filter((key) => key.startsWith("teachingAssignments/")).length, 1);
});

test("administrator user listings expose an explicit allowlist, not private profile fields", async () => {
  const db = createFakeDb({ users: { "student-1": { role: "student", active: true, displayName: "Student One", academyId: "SA-2026-001", privateNote: "should-not-leak", passwordHash: "never" } } });
  const result = await call(db, ADMIN, "GET", "/admin/students");
  assert.equal(result.status, 200);
  assert.equal("privateNote" in result.json.data.records[0], false);
  assert.equal("passwordHash" in result.json.data.records[0], false);
});

test("subject management enforces AJK and immutable grade metadata", async () => {
  const db = createFakeDb(SEED);
  assert.equal((await call(db, ADMIN, "POST", "/admin/subjects", { name: "Biology", grade: 9, board: "Other" })).status, 400);
  const created = await call(db, ADMIN, "POST", "/admin/subjects", { name: "Biology", grade: 9, board: "AJK" });
  assert.equal(created.status, 201);
  assert.equal((await call(db, ADMIN, "PATCH", `/admin/subjects/${created.json.data.id}`, { grade: 10 })).status, 400);
  assert.equal((await call(db, ADMIN, "POST", `/admin/subjects/${created.json.data.id}/deactivate`)).status, 200);
});

test("teacher provisioning allocates a permanent staff ID without enabling the Auth account", async () => {
  const db = createFakeDb(SEED);
  let authInput;
  const result = await call(db, ADMIN, "POST", "/admin/accounts", { role: "teacher", displayName: "New Teacher" }, {
    auth: { async createUser(input) { authInput = input; return { uid: "new-teacher-uid" }; }, async deleteUser() {} },
    allocateStaffId: async (database, role) => { assert.equal(role, "teacher"); return "SA-TCH-002"; }
  });
  assert.equal(result.status, 201);
  assert.equal(result.json.data.academyId, "SA-TCH-002");
  assert.equal(authInput.disabled, true);
  assert.equal(db.store.get("users/new-teacher-uid").active, false);
});

test("teaching assignment tuple cannot be mutated under its old deterministic document ID", async () => {
  const db = createFakeDb(SEED);
  const created = await call(db, ADMIN, "POST", "/admin/teaching-assignments", { teacherUid: "teacher-1", classId: "grade-9-a", subjectId: "physics-9" });
  assert.equal((await call(db, ADMIN, "PATCH", `/admin/teaching-assignments/${created.json.data.id}`, { subjectId: "chem-9" })).status, 400);
});

test("rejected pending activation never enables the corresponding Auth account", async () => {
  const db = createFakeDb({ users: { pending: { role: "student", active: false, provisioningStatus: "pending_activation" } } });
  const updates = [];
  const result = await call(db, ADMIN, "PATCH", "/admin/students/pending", { active: true }, {
    auth: { async updateUser(uid, patch) { updates.push({ uid, ...patch }); } }
  });
  assert.equal(result.status, 409);
  assert.deepEqual(updates, []);
});

test("deactivating a missing student profile does not disable an unrelated Auth UID", async () => {
  const db = createFakeDb(SEED);
  const updates = [];
  const result = await call(db, ADMIN, "POST", "/admin/students/unrelated-uid/deactivate", undefined, {
    auth: { async updateUser(uid, patch) { updates.push({ uid, ...patch }); } }
  });
  assert.equal(result.status, 404);
  assert.deepEqual(updates, []);
});

test("student and teacher profiles cannot be created without the Firebase Auth provisioning workflow", async () => {
  const db = createFakeDb(SEED);
  assert.equal((await call(db, ADMIN, "POST", "/admin/students", { displayName: "No Auth" })).status, 405);
  assert.equal((await call(db, ADMIN, "POST", "/admin/staff", { displayName: "No Auth" })).status, 405);
  assert.equal([...db.store.keys()].filter((key) => key.startsWith("users/")).length, 3);
});

test("student detail joins enrollment, effective subject access and preserved membership history", async () => {
  const db = createFakeDb({
    users: { "student-1": { role: "student", active: true, displayName: "Student One", academyId: "SA-2026-001", privateNote: "not returned" } },
    classes: { "grade-9-a": { name: "Grade 9 A", grade: 9, active: true } },
    subjects: {
      "physics-9": { name: "Physics", grade: 9, board: "AJK", active: true },
      "chem-9": { name: "Chemistry", grade: 9, board: "AJK", active: true },
      "physics-10": { name: "Physics 10", grade: 10, board: "AJK", active: true }
    },
    classAccess: { membership: { userUid: "student-1", classId: "grade-9-a", accessType: "student", active: true } },
    membershipHistory: { history: { userUid: "student-1", classId: "grade-9-a", action: "membership.enrolled", actorUid: "admin-1" } }
  });
  const result = await call(db, ADMIN, "GET", "/admin/students/student-1");
  assert.equal(result.status, 200);
  assert.equal(result.json.data.memberships.length, 1);
  assert.deepEqual(result.json.data.subjectAccess.map((s) => s.name).sort(), ["Chemistry", "Physics"]);
  assert.equal(result.json.data.membershipHistory.length, 1);
  assert.equal("privateNote" in result.json.data.student, false);
});

test("teaching assignment can be deactivated after its class or subject is deactivated", async () => {
  const db = createFakeDb({
    ...SEED,
    teachingAssignments: {
      assignment: { teacherUid: "teacher-1", classId: "grade-9-a", subjectId: "physics-9", active: true }
    }
  });
  db.updateDocument("classes", "grade-9-a", { active: false });
  const result = await call(db, ADMIN, "POST", "/admin/teaching-assignments/assignment/deactivate");
  assert.equal(result.status, 200);
  assert.equal(db.store.get("teachingAssignments/assignment").active, false);
});
