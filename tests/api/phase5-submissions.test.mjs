import test from "node:test";
import assert from "node:assert/strict";
import { handleAssignmentSubmissions } from "../../netlify/functions/lib/routes/assignment-submissions.mjs";
import { createFakeDb } from "../helpers/fake-firestore.mjs";
import { classAccessDocumentId } from "../../netlify/functions/lib/authorization.mjs";

const TS = "2026-11-10T00:00:00.000Z";
const timestamp = () => TS;
const teacher = { uid: "teacher-1", role: "teacher" };
const student = { uid: "student-1", role: "student" };
const otherStudent = { uid: "student-2", role: "student" };
const admin = { uid: "admin-1", role: "admin" };
const seed = () => ({
  classes: { "class-9": { grade: 9, active: true } },
  subjects: { "physics-9": { grade: 9, active: true } },
  classAccess: {
    [classAccessDocumentId("class-9", "teacher-1", "teacher")]: { classId: "class-9", userUid: "teacher-1", accessType: "teacher", active: true },
    [classAccessDocumentId("class-9", "student-1", "student")]: { classId: "class-9", userUid: "student-1", accessType: "student", active: true },
    [classAccessDocumentId("class-9", "student-2", "student")]: { classId: "class-9", userUid: "student-2", accessType: "student", active: true }
  },
  teachingAssignments: { "ta-1": { teacherUid: "teacher-1", classId: "class-9", subjectId: "physics-9", active: true } },
  assignments: { "assignment-1": { classId: "class-9", subjectId: "physics-9", publicationState: "published", dueAt: null } }
});
function request(method, path, body) {
  const init = { method };
  if (body !== undefined) { init.body = JSON.stringify(body); init.headers = { "content-type": "application/json" }; }
  return new Request(`https://test.local/api${path}`, init);
}
async function call(db, user, method, path, body) {
  const req = request(method, path, body);
  const res = await handleAssignmentSubmissions(req, { path: new URL(req.url).pathname.replace(/^\/api/, ""), user, db, serverTimestamp: timestamp, now: () => new Date("2026-11-10T00:00:00.000Z") });
  return { status: res.status, json: await res.json() };
}

test("student can submit text to a published assignment and revision is audited", async () => {
  const db = createFakeDb(seed());
  const result = await call(db, student, "POST", "/assignment-submissions", { assignmentId: "assignment-1", text: "My solution" });
  assert.equal(result.status, 201);
  assert.equal(result.json.data.submission.text, "My solution");
  assert.equal(result.json.data.submission.revision, 1);
  assert.equal([...db.store.keys()].filter(k => k.startsWith("assignmentSubmissionRevisions/")).length, 1);
  assert.equal([...db.store.values()].filter(v => v.action === "assignment.submission.created").length, 1);
});

test("resubmission creates a revision and preserves latest submission state", async () => {
  const db = createFakeDb(seed());
  await call(db, student, "POST", "/assignment-submissions", { assignmentId: "assignment-1", text: "First" });
  const second = await call(db, student, "POST", "/assignment-submissions", { assignmentId: "assignment-1", text: "Second" });
  assert.equal(second.status, 200);
  assert.equal(second.json.data.submission.revision, 2);
  assert.equal(second.json.data.submission.text, "Second");
  assert.equal([...db.store.keys()].filter(k => k.startsWith("assignmentSubmissionRevisions/")).length, 2);
});

test("student cannot submit for another student or access another student's submission", async () => {
  const db = createFakeDb(seed());
  const own = await call(db, student, "POST", "/assignment-submissions", { assignmentId: "assignment-1", text: "Own" });
  const ownId = own.json.data.submission.id;
  const ownRead = await call(db, student, "GET", "/assignment-submissions?assignmentId=assignment-1");
  assert.equal(ownRead.json.data.submissions[0].id, ownId);
  const otherRead = await call(db, otherStudent, "GET", "/assignment-submissions?assignmentId=assignment-1");
  assert.equal(otherRead.json.data.submissions.length, 0);
});

test("draft and closed assignments reject student submissions", async () => {
  for (const state of ["draft", "closed"]) {
    const data = seed(); data.assignments["assignment-1"].publicationState = state;
    const result = await call(createFakeDb(data), student, "POST", "/assignment-submissions", { assignmentId: "assignment-1", text: "Answer" });
    assert.equal(result.status, 404);
  }
});

test("submission text validation rejects empty, oversized and unknown fields", async () => {
  const db = createFakeDb(seed());
  for (const body of [{ assignmentId: "assignment-1", text: " " }, { assignmentId: "assignment-1", text: "x".repeat(20001) }, { assignmentId: "assignment-1", text: "x", studentUid: "student-2" }]) {
    assert.equal((await call(db, student, "POST", "/assignment-submissions", body)).status, 400);
  }
});

test("teacher reviews and grades submission; graded work cannot be resubmitted", async () => {
  const db = createFakeDb(seed());
  const created = await call(db, student, "POST", "/assignment-submissions", { assignmentId: "assignment-1", text: "Answer" });
  const id = created.json.data.submission.id;
  const reviewed = await call(db, teacher, "PATCH", `/assignment-submissions/${id}/review`, { feedback: "Good work", grade: 92 });
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.json.data.submission.status, "graded");
  assert.equal(reviewed.json.data.submission.grade, 92);
  assert.equal((await call(db, student, "POST", "/assignment-submissions", { assignmentId: "assignment-1", text: "Changed" })).status, 409);
  assert.equal([...db.store.values()].filter(v => v.action === "assignment.submission.reviewed").length, 1);
});

test("teacher cannot review submission outside assigned scope", async () => {
  const db = createFakeDb(seed());
  const created = await call(db, student, "POST", "/assignment-submissions", { assignmentId: "assignment-1", text: "Answer" });
  db.updateDocument("teachingAssignments", "ta-1", { active: false });
  const result = await call(db, teacher, "PATCH", `/assignment-submissions/${created.json.data.submission.id}/review`, { feedback: "No" });
  assert.equal(result.status, 404);
});

test("only students can submit and only staff can review", async () => {
  const db = createFakeDb(seed());
  assert.equal((await call(db, teacher, "POST", "/assignment-submissions", { assignmentId: "assignment-1", text: "x" })).status, 403);
  assert.equal((await call(db, student, "PATCH", "/assignment-submissions/as_fake/review", { grade: 50 })).status, 403);
  assert.equal((await call(db, admin, "POST", "/assignment-submissions", { assignmentId: "assignment-1", text: "x" })).status, 403);
});


test("deadline is enforced using the server clock", async () => {
  const data = seed(); data.assignments["assignment-1"].dueAt = "2026-11-09T23:59:59.000Z";
  const result = await call(createFakeDb(data), student, "POST", "/assignment-submissions", { assignmentId: "assignment-1", text: "Late" });
  assert.equal(result.status, 409);
});

test("concurrent first submissions produce one canonical record and ordered revisions", async () => {
  const db = createFakeDb(seed());
  const results = await Promise.all([
    call(db, student, "POST", "/assignment-submissions", { assignmentId: "assignment-1", text: "Attempt A" }),
    call(db, student, "POST", "/assignment-submissions", { assignmentId: "assignment-1", text: "Attempt B" })
  ]);
  assert.ok(results.every(r => [200, 201].includes(r.status)));
  assert.equal([...db.store.keys()].filter(k => k.startsWith("assignmentSubmissions/")).length, 1);
  assert.equal([...db.store.keys()].filter(k => k.startsWith("assignmentSubmissionRevisions/")).length, 2);
  const current = [...db.store.entries()].find(([k]) => k.startsWith("assignmentSubmissions/"))[1];
  assert.equal(current.revision, 2);
});


test("membership revoked before commit aborts a new submission", async () => {
  const db = createFakeDb(seed());
  const membershipId = classAccessDocumentId("class-9", "student-1", "student");
  db.beforeNextCommit = () => db.updateDocument("classAccess", membershipId, { active: false });
  const result = await call(db, student, "POST", "/assignment-submissions", { assignmentId: "assignment-1", text: "Must not persist" });
  assert.equal(result.status, 404);
  assert.equal([...db.store.keys()].filter(k => k.startsWith("assignmentSubmissions/")).length, 0);
});

test("class deactivation before commit aborts a new submission", async () => {
  const db = createFakeDb(seed());
  db.beforeNextCommit = () => db.updateDocument("classes", "class-9", { active: false });
  const result = await call(db, student, "POST", "/assignment-submissions", { assignmentId: "assignment-1", text: "Must not persist" });
  assert.equal(result.status, 404);
  assert.equal([...db.store.keys()].filter(k => k.startsWith("assignmentSubmissions/")).length, 0);
});
