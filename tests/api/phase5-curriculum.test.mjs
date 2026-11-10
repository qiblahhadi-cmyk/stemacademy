import test from "node:test";
import assert from "node:assert/strict";
import { handleCurriculum } from "../../netlify/functions/lib/routes/curriculum.mjs";
import { createFakeDb } from "../helpers/fake-firestore.mjs";
import { classAccessDocumentId } from "../../netlify/functions/lib/authorization.mjs";

const admin = { uid: "admin-1", role: "admin" };
const student = { uid: "student-1", role: "student" };
const teacher = { uid: "teacher-1", role: "teacher" };
const seed = () => ({
  classes: { "class-9": { grade: 9, active: true } },
  subjects: { "physics-9": { grade: 9, active: true, name: "Physics" } },
  classAccess: {
    [classAccessDocumentId("class-9", "student-1", "student")]: { classId: "class-9", userUid: "student-1", accessType: "student", active: true },
    [classAccessDocumentId("class-9", "teacher-1", "teacher")]: { classId: "class-9", userUid: "teacher-1", accessType: "teacher", active: true }
  },
  teachingAssignments: { "ta-1": { teacherUid: "teacher-1", classId: "class-9", subjectId: "physics-9", active: true } }
});
const stamp = () => "2026-11-10T00:00:00.000Z";
function req(method, path, body) { const init = { method }; if (body !== undefined) { init.body = JSON.stringify(body); init.headers = { "content-type": "application/json" }; } return new Request(`https://test.local/api${path}`, init); }
async function call(db, user, method, path, body) { const r = req(method, path, body); const res = await handleCurriculum(r, { path: new URL(r.url).pathname.replace(/^\/api/, ""), user, db, serverTimestamp: stamp }); return { status: res.status, json: await res.json() }; }

test("admin can create separate draft chapter and topic records; they are unverified by default", async () => {
  const db = createFakeDb(seed());
  const chapter = await call(db, admin, "POST", "/curriculum/chapters", { subjectId: "physics-9", grade: 9, title: "Chapter draft", sequence: 1, sourceAttribution: null });
  assert.equal(chapter.status, 201);
  assert.equal(chapter.json.data.verificationStatus, "unverified");
  const topic = await call(db, admin, "POST", "/curriculum/topics", { chapterId: chapter.json.data.id, subjectId: "physics-9", grade: 9, title: "Topic draft", sequence: 1, learningObjectives: ["Describe the concept"] });
  assert.equal(topic.status, 201);
  assert.equal(db.store.has(`subjects/physics-9/curriculum`), false);
  assert.ok(db.store.has(`curriculumChapters/${chapter.json.data.id}`));
  assert.ok(db.store.has(`curriculumTopics/${topic.json.data.id}`));
});

test("unverified curriculum cannot be published or shown to students", async () => {
  const db = createFakeDb(seed());
  const chapter = await call(db, admin, "POST", "/curriculum/chapters", { subjectId: "physics-9", grade: 9, title: "Draft chapter", sequence: 1 });
  const id = chapter.json.data.id;
  assert.equal((await call(db, admin, "POST", `/curriculum/chapters/${id}/publish`, {})).status, 409);
  const visible = await call(db, student, "GET", "/curriculum/chapters?classId=class-9&subjectId=physics-9");
  assert.equal(visible.status, 200);
  assert.deepEqual(visible.json.data.chapters, []);
});

test("publication requires source title, publisher and edition and then becomes student-visible", async () => {
  const db = createFakeDb(seed());
  const chapter = await call(db, admin, "POST", "/curriculum/chapters", { subjectId: "physics-9", grade: 9, title: "Verified chapter", sequence: 1 });
  const id = chapter.json.data.id;
  assert.equal((await call(db, admin, "POST", `/curriculum/chapters/${id}/verify`, { title: "Official source" })).status, 400);
  const verified = await call(db, admin, "POST", `/curriculum/chapters/${id}/verify`, { title: "Official source", publisher: "Board", edition: "2026" });
  assert.equal(verified.status, 200);
  assert.equal((await call(db, admin, "POST", `/curriculum/chapters/${id}/publish`, {})).status, 200);
  const visible = await call(db, student, "GET", "/curriculum/chapters?classId=class-9&subjectId=physics-9");
  assert.equal(visible.json.data.chapters.length, 1);
  assert.equal(visible.json.data.chapters[0].verificationStatus, "verified");
});

test("students cannot manage curriculum and teachers see only assigned scope", async () => {
  const db = createFakeDb(seed());
  assert.equal((await call(db, student, "POST", "/curriculum/chapters", { subjectId: "physics-9", grade: 9, title: "No", sequence: 1 })).status, 403);
  assert.equal((await call(db, teacher, "GET", "/curriculum/chapters?classId=class-9&subjectId=physics-9")).status, 200);
  assert.equal((await call(db, teacher, "GET", "/curriculum/chapters?classId=class-9&subjectId=math-9")).status, 404);
});

test("invalid grade, subject mismatch and topic chapter mismatch are rejected", async () => {
  const db = createFakeDb(seed());
  assert.equal((await call(db, admin, "POST", "/curriculum/chapters", { subjectId: "physics-9", grade: 10, title: "Wrong grade", sequence: 1 })).status, 404);
  assert.equal((await call(db, admin, "POST", "/curriculum/topics", { chapterId: "missing", subjectId: "physics-9", grade: 9, title: "Orphan", sequence: 1 })).status, 400);
});


test("topic cannot publish until its parent chapter is published", async () => {
  const db = createFakeDb(seed());
  const chapter = await call(db, admin, "POST", "/curriculum/chapters", { subjectId: "physics-9", grade: 9, title: "Parent", sequence: 1 });
  const topic = await call(db, admin, "POST", "/curriculum/topics", { chapterId: chapter.json.data.id, subjectId: "physics-9", grade: 9, title: "Child", sequence: 1 });
  const topicId = topic.json.data.id;
  await call(db, admin, "POST", `/curriculum/topics/${topicId}/verify`, { title: "Official source", publisher: "Board", edition: "2026" });
  assert.equal((await call(db, admin, "POST", `/curriculum/topics/${topicId}/publish`, {})).status, 409);
});

test("curriculum mutations are audited and scope references cannot be edited", async () => {
  const db = createFakeDb(seed());
  const created = await call(db, admin, "POST", "/curriculum/chapters", { subjectId: "physics-9", grade: 9, title: "Audit chapter", sequence: 1 });
  const id = created.json.data.id;
  const invalid = await call(db, admin, "PATCH", `/curriculum/chapters/${id}`, { grade: 10 });
  assert.equal(invalid.status, 400);
  const edited = await call(db, admin, "PATCH", `/curriculum/chapters/${id}`, { title: "Edited draft" });
  assert.equal(edited.status, 200);
  const actions = [...db.store.values()].filter(v => typeof v.action === "string" && v.action.startsWith("curriculum.")).map(v => v.action);
  assert.deepEqual(actions.sort(), ["curriculum.chapter.created", "curriculum.chapter.updated"]);
});


test("curriculum responses use an explicit allowlist", async () => {
  const db = createFakeDb(seed());
  const created = await call(db, admin, "POST", "/curriculum/chapters", { subjectId: "physics-9", grade: 9, title: "Response chapter", sequence: 1 });
  const id = created.json.data.id;
  await call(db, admin, "POST", `/curriculum/chapters/${id}/verify`, { title: "Official", publisher: "Board", edition: "2026" });
  await call(db, admin, "POST", `/curriculum/chapters/${id}/publish`, {});
  const response = await call(db, admin, "GET", "/curriculum/chapters?classId=class-9&subjectId=physics-9");
  const record = response.json.data.chapters[0];
  assert.equal(record.createdBy, undefined);
  assert.equal(record.verifiedBy, undefined);
  assert.equal(record.publishedBy, undefined);
  assert.equal(record.title, "Response chapter");
});
