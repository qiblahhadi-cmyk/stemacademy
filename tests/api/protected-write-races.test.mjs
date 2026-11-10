import test from "node:test";
import assert from "node:assert/strict";
import { handleAssignments } from "../../netlify/functions/lib/routes/assignments.mjs";
import { handleAttendance } from "../../netlify/functions/lib/routes/attendance.mjs";
import { classAccessDocumentId } from "../../netlify/functions/lib/authorization.mjs";
import { createFakeDb } from "../helpers/fake-firestore.mjs";

const teacher = { uid: "teacher-1", role: "teacher" };
const SERVER_TS = "SERVER_TS";
const membershipId = classAccessDocumentId("class-9", "teacher-1", "teacher");
const seed = () => ({
  classes: { "class-9": { name: "Grade 9", grade: 9, active: true } },
  subjects: { "physics-9": { name: "Physics", grade: 9, active: true } },
  classAccess: { [membershipId]: { classId: "class-9", userUid: "teacher-1", accessType: "teacher", active: true } },
  teachingAssignments: { "ta-1": { teacherUid: "teacher-1", classId: "class-9", subjectId: "physics-9", active: true } },
  users: { "student-1": { role: "student", active: true } },
  attendanceRecords: {}
});
const assignmentBody = { title: "Worksheet", instructions: "Complete it", type: "online", classId: "class-9", subjectId: "physics-9", dueAt: null };

async function assignmentCall(db) {
  const request = new Request("https://example.test/api/assignments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(assignmentBody) });
  const response = await handleAssignments(request, { path: "/assignments", user: teacher, db, serverTimestamp: () => SERVER_TS });
  return { status: response.status, body: await response.json() };
}

test("assignment creation aborts when teaching assignment is revoked before commit", async () => {
  const db = createFakeDb(seed());
  db.beforeNextCommit = () => db.updateDocument("teachingAssignments", "ta-1", { active: false });
  const result = await assignmentCall(db);
  assert.equal(result.status, 403);
  assert.equal([...db.store.keys()].filter((key) => key.startsWith("assignments/")).length, 0);
});

test("assignment creation aborts when teacher membership is revoked before commit", async () => {
  const db = createFakeDb(seed());
  db.beforeNextCommit = () => db.updateDocument("classAccess", membershipId, { active: false });
  const result = await assignmentCall(db);
  assert.equal(result.status, 403);
  assert.equal([...db.store.keys()].filter((key) => key.startsWith("assignments/")).length, 0);
});

test("assignment creation aborts when class or subject is deactivated before commit", async (t) => {
  for (const [collection, id] of [["classes", "class-9"], ["subjects", "physics-9"]]) {
    await t.test(`${collection} deactivation`, async () => {
      const db = createFakeDb(seed());
      db.beforeNextCommit = () => db.updateDocument(collection, id, { active: false });
      const result = await assignmentCall(db);
      assert.equal(result.status, 404);
      assert.equal([...db.store.keys()].filter((key) => key.startsWith("assignments/")).length, 0);
    });
  }
});

test("attendance mark aborts when teacher assignment is revoked before commit", async () => {
  const db = createFakeDb(seed());
  db.beforeNextCommit = () => db.updateDocument("teachingAssignments", "ta-1", { active: false });
  const request = new Request("https://example.test/api/attendance/mark", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ classId: "class-9", date: "2026-11-09", records: [{ studentUid: "student-1", status: "present" }] })
  });
  const response = await handleAttendance(request, { path: "/attendance/mark", user: teacher, db, serverTimestamp: () => SERVER_TS, today: () => "2026-11-09" });
  assert.equal(response.status, 404);
  assert.equal([...db.store.keys()].filter((key) => key.startsWith("attendanceRecords/")).length, 0);
});
