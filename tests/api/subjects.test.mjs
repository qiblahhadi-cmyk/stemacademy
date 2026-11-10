import test from "node:test";
import assert from "node:assert/strict";
import { handleSubjects } from "../../netlify/functions/lib/routes/subjects.mjs";
import { createFakeDb } from "../helpers/fake-firestore.mjs";

const SEED = {
  classes: {
    "class-9": { name: "Grade 9 A", grade: 9, active: true },
    "class-9-old": { name: "Old", grade: 9, active: false },
    "class-10": { name: "Grade 10 A", grade: 10, active: true }
  },
  subjects: {
    "physics-9": { name: "Physics", board: "AJK", grade: 9, active: true },
    "chem-9": { name: "Chemistry", board: "AJK", grade: 9, active: true },
    "retired-9": { name: "Retired", board: "AJK", grade: 9, active: false },
    "physics-10": { name: "Physics", board: "AJK", grade: 10, active: true }
  },
  classAccess: {
    "ca-t1": { userUid: "teacher-1", classId: "class-9", accessType: "teacher", active: true },
    "ca-s1": { userUid: "student-1", classId: "class-9", accessType: "student", active: true }
  },
  teachingAssignments: {
    "ta-t1-phys": { teacherUid: "teacher-1", classId: "class-9", subjectId: "physics-9", active: true },
    "ta-t1-old": { teacherUid: "teacher-1", classId: "class-9", subjectId: "chem-9", active: false }
  }
};

const admin = { uid: "admin-1", role: "admin" };
const teacher1 = { uid: "teacher-1", role: "teacher" };
const student1 = { uid: "student-1", role: "student" };

async function list(db, user, query = "?classId=class-9") {
  const request = new Request(`https://example.test/api/subjects${query}`, { method: "GET" });
  try {
    const response = await handleSubjects(request, { db, user });
    return { status: response.status, json: await response.json() };
  } catch (error) {
    return { status: 500, error: error.message };
  }
}

test("admin sees every active subject for the class grade", async () => {
  const { status, json } = await list(createFakeDb(SEED), admin);
  assert.equal(status, 200);
  assert.deepEqual(json.data.subjects.map((s) => s.id).sort(), ["chem-9", "physics-9"]);
});

test("teacher sees only subjects with an active teaching assignment in that class", async () => {
  const { json } = await list(createFakeDb(SEED), teacher1);
  assert.deepEqual(json.data.subjects.map((s) => s.id), ["physics-9"]);
});

test("student sees active subjects for their class grade", async () => {
  const { json } = await list(createFakeDb(SEED), student1);
  assert.deepEqual(json.data.subjects.map((s) => s.id).sort(), ["chem-9", "physics-9"]);
});

test("responses are allowlisted and contain no internal fields", async () => {
  const { json } = await list(createFakeDb(SEED), admin);
  for (const subject of json.data.subjects) {
    assert.deepEqual(Object.keys(subject).sort(), ["board", "grade", "id", "name"]);
  }
});

test("teacher with no class access gets the same 404 as a missing class", async () => {
  const db = createFakeDb(SEED);
  const outsider = { uid: "teacher-9", role: "teacher" };
  const denied = await list(db, outsider, "?classId=class-9");
  const missing = await list(db, admin, "?classId=does-not-exist");
  assert.equal(denied.status, 404);
  assert.equal(missing.status, 404);
  assert.deepEqual(denied.json, missing.json);
});

test("inactive class is not found for any role", async () => {
  const { status } = await list(createFakeDb(SEED), admin, "?classId=class-9-old");
  assert.equal(status, 404);
});

test("missing or malformed classId is rejected before any lookup", async () => {
  const db = createFakeDb(SEED);
  assert.equal((await list(db, admin, "")).status, 400);
  assert.equal((await list(db, admin, "?classId=a%2Fb")).status, 400);
});

test("student cannot read subjects for a class they do not belong to", async () => {
  const { status } = await list(createFakeDb(SEED), student1, "?classId=class-10");
  assert.equal(status, 404);
});

test("non-GET methods are refused", async () => {
  const response = await handleSubjects(
    new Request("https://example.test/api/subjects?classId=class-9", { method: "POST" }),
    { db: createFakeDb(SEED), user: admin }
  );
  assert.equal(response.status, 405);
});
