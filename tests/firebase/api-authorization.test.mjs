import test from "node:test";
import assert from "node:assert/strict";
import {
  requireRole,
  requireStudentOwner
} from "../../netlify/functions/lib/authorization.mjs";

test("requireRole allows only explicitly listed roles", () => {
  const teacher = { uid: "teacher-1", role: "teacher" };
  assert.equal(requireRole(teacher, ["admin", "teacher"]), teacher);
  assert.throws(() => requireRole({ uid: "student-1", role: "student" }, ["admin", "teacher"]), /FORBIDDEN/);
  assert.throws(() => requireRole(null, ["admin"]), /FORBIDDEN/);
});

test("students can only act on their own student records", () => {
  const student = { uid: "student-1", role: "student" };
  assert.equal(requireStudentOwner(student, "student-1"), student);
  assert.throws(() => requireStudentOwner(student, "student-2"), /FORBIDDEN/);
  assert.throws(() => requireStudentOwner({ uid: "admin-1", role: "admin" }, "student-1"), /FORBIDDEN/);
});
