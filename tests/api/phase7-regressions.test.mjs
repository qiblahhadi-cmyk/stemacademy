import test from "node:test";
import assert from "node:assert/strict";
import { handleAssessments, resultRecordId } from "../../netlify/functions/lib/routes/assessments.mjs";
import { handleAdmin } from "../../netlify/functions/lib/routes/admin.mjs";
import { handleAssignmentSubmissions } from "../../netlify/functions/lib/routes/assignment-submissions.mjs";
import { classAccessDocumentId } from "../../netlify/functions/lib/authorization.mjs";
import { createFakeDb } from "../helpers/fake-firestore.mjs";

/* Phase 7 source-review regressions. Each test failed before its fix (see TEST_RESULTS.md). */

const teacher = { uid: "teacher-1", role: "teacher" };
const student = { uid: "stu-amina", role: "student" };
const admin = { uid: "admin-1", role: "admin" };
const OPENS = "2026-11-09T09:00:00Z";
const CLOSES = "2026-11-09T12:00:00Z";
const T_BEFORE = new Date("2026-11-09T08:00:00Z");
const T_OPEN = new Date("2026-11-09T10:00:00Z");
const T_AFTER_LIMIT = new Date("2026-11-09T10:30:00Z");

const classSeed = () => ({
  classes: { "class-9": { name: "Grade 9 A", grade: 9, active: true, academicSessionId: "2026" } },
  subjects: { "physics-9": { name: "Physics", board: "AJK", grade: 9, active: true } },
  users: {
    "teacher-1": { displayName: "Ms. Ali", role: "teacher", active: true },
    "stu-amina": { displayName: "Amina Khan", role: "student", active: true }
  },
  classAccess: {
    [classAccessDocumentId("class-9", "teacher-1", "teacher")]: { userUid: "teacher-1", classId: "class-9", accessType: "teacher", active: true },
    [classAccessDocumentId("class-9", "stu-amina", "student")]: { userUid: "stu-amina", classId: "class-9", accessType: "student", active: true }
  },
  teachingAssignments: { "ta-t1": { teacherUid: "teacher-1", classId: "class-9", subjectId: "physics-9", active: true } }
});

async function assess(db, user, method, path, body, now = T_OPEN) {
  const init = { method };
  if (body !== undefined) { init.body = JSON.stringify(body); init.headers = { "Content-Type": "application/json" }; }
  const response = await handleAssessments(new Request(`https://example.test/api${path}`, init), {
    path, user, db, serverTimestamp: () => "SERVER_TS", now: () => new Date(now)
  });
  return { status: response.status, json: await response.json() };
}

async function publishedAssessment(db) {
  const created = await assess(db, teacher, "POST", "/assessments", {
    classId: "class-9", subjectId: "physics-9", title: "Motion quiz", assessmentType: "quiz",
    durationMinutes: 10, opensAt: OPENS, closesAt: CLOSES,
    questions: [{ text: "Unit of force?", options: ["Newton", "Joule"], correctIndex: 0, marks: 2 }]
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const id = created.json.data.id;
  assert.equal((await assess(db, teacher, "POST", `/assessments/${id}/publish`, undefined, T_BEFORE)).status, 200);
  return id;
}

test("starting after an unsubmitted attempt has timed out clears the stale in-progress marker so a retake can be approved", async () => {
  const db = createFakeDb(classSeed());
  const id = await publishedAssessment(db);
  assert.equal((await assess(db, student, "POST", `/assessments/${id}/start`, undefined, T_OPEN)).status, 201);

  const restart = await assess(db, student, "POST", `/assessments/${id}/start`, undefined, T_AFTER_LIMIT);
  assert.equal(restart.status, 409, "the single attempt is used up");

  const result = db.store.get(`assessmentResults/${resultRecordId(id, "stu-amina")}`);
  assert.equal(result.openAttemptId, null, "an expired attempt must not stay marked as open");

  const mine = await assess(db, student, "GET", "/assessments/mine", undefined, T_AFTER_LIMIT);
  assert.equal(mine.json.data.assessments[0].attempt.status, "not_submitted");

  const retake = await assess(db, teacher, "POST", `/assessments/${id}/retakes`, { studentUid: "stu-amina" }, T_AFTER_LIMIT);
  assert.equal(retake.status, 200, JSON.stringify(retake.json));
});

test("reopening with a dangling attempt reference returns a controlled conflict instead of a server error", async () => {
  const db = createFakeDb(classSeed());
  const id = await publishedAssessment(db);
  const started = await assess(db, student, "POST", `/assessments/${id}/start`, undefined, T_OPEN);
  db.store.delete(`assessmentAttempts/${started.json.data.attemptId}`);
  const reopen = await assess(db, teacher, "POST", `/assessments/${id}/reopen`,
    { studentUid: "stu-amina", reason: "Power cut" }, T_AFTER_LIMIT);
  assert.equal(reopen.status, 409, JSON.stringify(reopen.json));
});

async function admin_(db, method, path, body) {
  const init = { method };
  if (body !== undefined) init.body = JSON.stringify(body);
  const disabledCalls = [];
  const response = await handleAdmin(new Request(`https://example.test/api${path}`, init), {
    path, user: admin, db, serverTimestamp: () => "SERVER_TS",
    auth: { updateUser: async (uid, patch) => { disabledCalls.push([uid, patch]); } }
  });
  return { status: response.status, json: await response.json(), disabledCalls };
}

test("an administrator cannot activate an account whose first-password handoff is not complete", async () => {
  for (const provisioningStatus of ["pending_activation", "credential_issued"]) {
    const db = createFakeDb({ users: { "student-9": { role: "student", active: false, provisioningStatus, displayName: "New Student", academyId: "SA-2026-009" } } });
    const result = await admin_(db, "PATCH", "/admin/students/student-9", { active: true });
    assert.equal(result.status, 409, provisioningStatus);
    assert.equal(db.store.get("users/student-9").active, false, "account stays inactive");
    assert.equal(result.disabledCalls.length, 0, "Firebase Auth must not be re-enabled");
  }
});

test("an administrator can still re-enable a previously activated student account", async () => {
  const db = createFakeDb({ users: { "student-1": { role: "student", active: false, provisioningStatus: "active", displayName: "Student One", academyId: "SA-2026-001" } } });
  const result = await admin_(db, "PATCH", "/admin/students/student-1", { active: true });
  assert.equal(result.status, 200, JSON.stringify(result.json));
  assert.equal(db.store.get("users/student-1").active, true);
});

async function submissions(db, user, path) {
  const response = await handleAssignmentSubmissions(new Request(`https://example.test/api${path}`, { method: "GET" }), {
    path: path.split("?")[0], user, db, serverTimestamp: () => "SERVER_TS", now: () => new Date("2026-11-10T00:00:00Z")
  });
  return { status: response.status, json: await response.json() };
}

test("students receive the same 404 for a draft assignment as for a missing one when listing submissions", async () => {
  const seed = classSeed();
  seed.assignments = {
    "draft-1": { classId: "class-9", subjectId: "physics-9", publicationState: "draft" },
    "pub-1": { classId: "class-9", subjectId: "physics-9", publicationState: "published" },
    "closed-1": { classId: "class-9", subjectId: "physics-9", publicationState: "closed" }
  };
  const db = createFakeDb(seed);
  const missing = await submissions(db, student, "/assignment-submissions?assignmentId=nope-1");
  const draft = await submissions(db, student, "/assignment-submissions?assignmentId=draft-1");
  assert.equal(missing.status, 404);
  assert.equal(draft.status, 404);
  assert.deepEqual(draft.json, missing.json, "draft and missing responses must be indistinguishable");
  assert.equal((await submissions(db, student, "/assignment-submissions?assignmentId=pub-1")).status, 200);
  assert.equal((await submissions(db, student, "/assignment-submissions?assignmentId=closed-1")).status, 200);
  assert.equal((await submissions(db, teacher, "/assignment-submissions?assignmentId=draft-1")).status, 200, "staff may still review drafts in scope");
});
