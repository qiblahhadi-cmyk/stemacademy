import test from "node:test";
import assert from "node:assert/strict";
import { classAccessDocumentId, txAuthorizeScope } from "../../netlify/functions/lib/authorization.mjs";
import { createFakeDb } from "../helpers/fake-firestore.mjs";

const teacher = { uid: "teacher-1", role: "teacher" };
const student = { uid: "student-1", role: "student" };
const membershipId = classAccessDocumentId("class-9", "teacher-1", "teacher");
const studentMembershipId = classAccessDocumentId("class-9", "student-1", "student");
const seed = () => ({
  classes: { "class-9": { grade: 9, active: true } },
  subjects: { "physics-9": { grade: 9, active: true } },
  classAccess: {
    [membershipId]: { classId: "class-9", userUid: "teacher-1", accessType: "teacher", active: true },
    [studentMembershipId]: { classId: "class-9", userUid: "student-1", accessType: "student", active: true }
  },
  teachingAssignments: { "ta-1": { teacherUid: "teacher-1", classId: "class-9", subjectId: "physics-9", active: true } }
});

async function protectedRead(db, user, subjectId = "physics-9") {
  return db.runTransaction(async (tx) => {
    await txAuthorizeScope(tx, db, user, "class-9", subjectId);
    return "authorized";
  });
}

test("transaction-bound scope rejects teaching-assignment revocation before commit", async () => {
  const db = createFakeDb(seed());
  db.beforeNextCommit = () => db.updateDocument("teachingAssignments", "ta-1", { active: false });
  await assert.rejects(protectedRead(db, teacher), /FORBIDDEN/);
});

test("transaction-bound scope rejects teacher membership revocation before commit", async () => {
  const db = createFakeDb(seed());
  db.beforeNextCommit = () => db.updateDocument("classAccess", membershipId, { active: false });
  await assert.rejects(protectedRead(db, teacher), /FORBIDDEN/);
});

test("transaction-bound scope rejects class deactivation before commit", async () => {
  const db = createFakeDb(seed());
  db.beforeNextCommit = () => db.updateDocument("classes", "class-9", { active: false });
  await assert.rejects(protectedRead(db, teacher), /NOT_FOUND/);
});

test("transaction-bound scope rejects subject deactivation before commit", async () => {
  const db = createFakeDb(seed());
  db.beforeNextCommit = () => db.updateDocument("subjects", "physics-9", { active: false });
  await assert.rejects(protectedRead(db, teacher), /NOT_FOUND/);
});

test("transaction-bound scope rejects student membership revocation before commit", async () => {
  const db = createFakeDb(seed());
  db.beforeNextCommit = () => db.updateDocument("classAccess", studentMembershipId, { active: false });
  await assert.rejects(protectedRead(db, student, null), /FORBIDDEN/);
});
