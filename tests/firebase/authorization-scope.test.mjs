import test from "node:test";
import assert from "node:assert/strict";
import {
  requireClassAccess,
  requireTeachingAssignment,
  requireClassTeachingAssignment
} from "../../netlify/functions/lib/authorization.mjs";

function fakeDb(records) {
  return {
    collection(name) {
      const buildQuery = filters => ({
        where(field, operator, value) {
          return buildQuery([...filters, [field, operator, value]]);
        },
        limit() { return this; },
        async get() {
          const rows = records[name] || [];
          const matches = rows.filter(row => filters.every(([key, op, expected]) =>
            op === "==" && row[key] === expected
          ));
          return {
            empty: matches.length === 0,
            docs: matches.map(data => ({ data: () => data }))
          };
        }
      });
      return { where(field, operator, value) {
        return buildQuery([[field, operator, value]]);
      } };
    }
  };
}

const teacher = { uid: "teacher-a", role: "teacher" };
const student = { uid: "student-a", role: "student" };
const classId = "grade-9-a";
const physics = "physics";
const chemistry = "chemistry";
const records = {
  classAccess: [
    { userUid: teacher.uid, classId, accessType: "teacher", active: true },
    { userUid: student.uid, classId, accessType: "student", active: true }
  ],
  teachingAssignments: [
    { teacherUid: teacher.uid, classId, subjectId: physics, active: true }
  ]
};

test("class access is bound to the authenticated user, class, role and active flag", async () => {
  const db = fakeDb(records);
  assert.equal(await requireClassAccess(db, teacher, classId, "teacher"), teacher);
  assert.equal(await requireClassAccess(db, student, classId, "student"), student);
  await assert.rejects(requireClassAccess(db, teacher, "grade-10-b", "teacher"), /FORBIDDEN/);
  await assert.rejects(requireClassAccess(db, student, classId, "teacher"), /FORBIDDEN/);
});

test("teacher subject access requires an exact active class and subject assignment", async () => {
  const db = fakeDb(records);
  assert.equal(await requireTeachingAssignment(db, teacher, classId, physics), teacher);
  await assert.rejects(requireTeachingAssignment(db, teacher, classId, chemistry), /FORBIDDEN/);
  await assert.rejects(requireTeachingAssignment(db, teacher, "another-class", physics), /FORBIDDEN/);
});

test("teacher class listing requires at least one active teaching subject", async () => {
  const db = fakeDb(records);
  assert.equal(await requireClassTeachingAssignment(db, teacher, classId), teacher);
  await assert.rejects(requireClassTeachingAssignment(db, teacher, "another-class"), /FORBIDDEN/);
});

test("administrator class access bypasses teacher/student assignment lookup", async () => {
  const admin = { uid: "admin-a", role: "admin" };
  const db = { collection() { throw new Error("admin should not need a class-access lookup"); } };
  assert.equal(await requireClassAccess(db, admin, classId, "teacher"), admin);
});
