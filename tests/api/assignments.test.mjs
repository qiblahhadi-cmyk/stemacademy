import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { handleAssignments, validateAssignmentInput } from "../../netlify/functions/lib/routes/assignments.mjs";
import { classAccessDocumentId } from "../../netlify/functions/lib/authorization.mjs";

import { createFakeDb } from "../helpers/fake-firestore.mjs";

const SERVER_TS = "SERVER_TS";
const serverTimestamp = () => SERVER_TS;

const BASE_SEED = {
  classes: {
    "class-9": { name: "Grade 9 A", grade: 9, active: true, academicSessionId: "2026" },
    "class-10": { name: "Grade 10 A", grade: 10, active: true, academicSessionId: "2026" }
  },
  subjects: {
    "physics-9": { name: "Physics", board: "AJK", grade: 9, active: true },
    "chem-9": { name: "Chemistry", board: "AJK", grade: 9, active: true },
    "physics-10": { name: "Physics", board: "AJK", grade: 10, active: true }
  },
  classAccess: {
    [classAccessDocumentId("class-9", "teacher-1", "teacher")]: { userUid: "teacher-1", classId: "class-9", accessType: "teacher", active: true },
    [classAccessDocumentId("class-10", "teacher-2", "teacher")]: { userUid: "teacher-2", classId: "class-10", accessType: "teacher", active: true },
    [classAccessDocumentId("class-9", "student-1", "student")]: { userUid: "student-1", classId: "class-9", accessType: "student", active: true }
  },
  teachingAssignments: {
    "ta-t1-phys9": { teacherUid: "teacher-1", classId: "class-9", subjectId: "physics-9", active: true },
    "ta-t2-phys10": { teacherUid: "teacher-2", classId: "class-10", subjectId: "physics-10", active: true }
  }
};

const teacher1 = { uid: "teacher-1", role: "teacher" };
const teacher2 = { uid: "teacher-2", role: "teacher" };
const student1 = { uid: "student-1", role: "student" };
const admin = { uid: "admin-1", role: "admin" };

function req(method, path, body) {
  const init = { method };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`https://example.test/api${path}`, init);
}

// Mirrors api.mjs: normalized pathname only (no query string), and thrown
// authorization/lookup errors are converted to API responses by the caller.
const THROWN_STATUS = { FORBIDDEN: [403, "Access denied."], NOT_FOUND: [404, "Resource not found."] };

async function call(db, user, method, path, body) {
  const request = req(method, path, body);
  const pathname = new URL(request.url).pathname.replace(/^\/api/, "");
  try {
    const response = await handleAssignments(request, { path: pathname, user, db, serverTimestamp });
    const json = await response.json();
    return { status: response.status, json };
  } catch (error) {
    const [status, message] = THROWN_STATUS[error.message] ?? [500, "An unexpected server error occurred."];
    return { status, json: { error: { code: error.message, message } } };
  }
}

const validCreate = (overrides = {}) => ({
  title: "Motion worksheet",
  instructions: "Complete questions 1 to 5.",
  type: "online",
  classId: "class-9",
  subjectId: "physics-9",
  dueAt: "2026-11-12T10:00:00+05:00",
  ...overrides
});

async function createAs(db, user, overrides) {
  const { status, json } = await call(db, user, "POST", "/assignments", validCreate(overrides));
  assert.equal(status, 201, JSON.stringify(json));
  return json.data.id;
}

test("validation rejects unsupported fields and bad values", () => {
  const cases = [
    [{ ...validCreate(), publicationState: "published" }, "unsupported"],
    [{ ...validCreate(), createdBy: "x" }, "unsupported"],
    [{ ...validCreate(), title: "a" }, "2 to 160"],
    [{ ...validCreate(), type: "file-upload" }, "physical or online"],
    [{ ...validCreate(), classId: "../etc" }, "classId"],
    [{ ...validCreate(), subjectId: "" }, "subjectId"],
    [{ ...validCreate(), dueAt: "2026-11-12" }, "timezone"],
    [{ ...validCreate(), dueAt: "2026-13-40T99:00Z" }, "timezone"],
    [{ ...validCreate(), instructions: "x".repeat(10001) }, "10000"],
    [[], "JSON object"],
    [null, "JSON object"]
  ];
  for (const [input, expected] of cases) {
    const { error } = validateAssignmentInput(input, "create");
    assert.ok(error, `expected error for ${JSON.stringify(input).slice(0, 60)}`);
    assert.match(error, new RegExp(expected));
  }
});

test("validation normalizes dueAt to UTC and trims text", () => {
  const { value } = validateAssignmentInput(validCreate({ title: "  Waves  " }), "create");
  assert.equal(value.title, "Waves");
  assert.equal(value.dueAt, "2026-11-12T05:00:00.000Z");
});

test("update validation rejects empty patches and scope fields", () => {
  assert.match(validateAssignmentInput({}, "update").error, /No changes/);
  assert.match(validateAssignmentInput({ classId: "class-10" }, "update").error, /unsupported/);
  assert.match(validateAssignmentInput({ subjectId: "physics-10" }, "update").error, /unsupported/);
  assert.match(validateAssignmentInput({ publicationState: "published" }, "update").error, /unsupported/);
});

test("teacher creates a draft in an assigned class and subject with an audit entry", async () => {
  const db = createFakeDb(BASE_SEED);
  const id = await createAs(db, teacher1, {});

  const stored = db.store.get(`assignments/${id}`);
  assert.equal(stored.publicationState, "draft");
  assert.equal(stored.createdBy, "teacher-1");
  assert.equal(stored.createdAt, SERVER_TS);

  const audits = [...db.store.entries()].filter(([k]) => k.startsWith("auditLogs/")).map(([, v]) => v);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "assignment.created");
  assert.equal(audits[0].actorUid, "teacher-1");
  assert.equal(audits[0].targetId, id);
  // Audit metadata must not contain assignment content.
  assert.deepEqual(Object.keys(audits[0].metadata).sort(), ["classId", "subjectId"]);
});

test("teacher is denied an unassigned subject in an otherwise assigned class", async () => {
  const db = createFakeDb(BASE_SEED);
  const { status, json } = await call(db, teacher1, "POST", "/assignments",
    validCreate({ subjectId: "chem-9" }));
  assert.equal(status, 403);
  assert.equal(json.error.code, "FORBIDDEN");
  assert.equal([...db.store.keys()].filter((k) => k.startsWith("assignments/")).length, 0);
});

test("teacher is denied a class with no active assignment", async () => {
  const db = createFakeDb(BASE_SEED);
  const { status } = await call(db, teacher1, "POST", "/assignments",
    validCreate({ classId: "class-10", subjectId: "physics-10" }));
  assert.equal(status, 403);
});

test("students cannot create, update, publish or close assignments", async () => {
  const db = createFakeDb(BASE_SEED);
  const id = await createAs(db, teacher1, {});
  for (const [method, path, body] of [
    ["POST", "/assignments", validCreate()],
    ["PATCH", `/assignments/${id}`, { title: "Changed" }],
    ["POST", `/assignments/${id}/publish`, undefined],
    ["POST", `/assignments/${id}/close`, undefined]
  ]) {
    const { status } = await call(db, student1, method, path, body);
    assert.equal(status, 403, `${method} ${path} should be forbidden for students`);
  }
  assert.equal(db.store.get(`assignments/${id}`).publicationState, "draft");
});

test("students see published and closed assignments but never drafts; teachers see all", async () => {
  const db = createFakeDb(BASE_SEED);
  const draftId = await createAs(db, teacher1, { title: "Draft task" });
  const publishedId = await createAs(db, teacher1, { title: "Live task" });
  const closedId = await createAs(db, teacher1, { title: "Past task" });
  await call(db, teacher1, "POST", `/assignments/${publishedId}/publish`);
  await call(db, teacher1, "POST", `/assignments/${closedId}/publish`);
  await call(db, teacher1, "POST", `/assignments/${closedId}/close`);

  const studentView = await call(db, student1, "GET", "/assignments?classId=class-9&subjectId=physics-9");
  assert.equal(studentView.status, 200);
  const studentIds = studentView.json.data.assignments.map((a) => a.id).sort();
  assert.deepEqual(studentIds, [publishedId, closedId].sort());
  assert.ok(!studentIds.includes(draftId));
  const states = Object.fromEntries(studentView.json.data.assignments.map((a) => [a.id, a.publicationState]));
  assert.equal(states[closedId], "closed");

  const teacherView = await call(db, teacher1, "GET", "/assignments?classId=class-9&subjectId=physics-9");
  assert.equal(teacherView.json.data.assignments.length, 3);
});

test("students can open a published or closed assignment by ID, read-only", async () => {
  const db = createFakeDb(BASE_SEED);
  const id = await createAs(db, teacher1, {});
  await call(db, teacher1, "POST", `/assignments/${id}/publish`);
  await call(db, teacher1, "POST", `/assignments/${id}/close`);

  const { status, json } = await call(db, student1, "GET", `/assignments/${id}`);
  assert.equal(status, 200);
  assert.equal(json.data.assignment.publicationState, "closed");
  assert.doesNotMatch(JSON.stringify(json), /createdBy|teacher-1/);

  const edit = await call(db, student1, "PATCH", `/assignments/${id}`, { title: "Nope" });
  assert.equal(edit.status, 403);
});

test("students cannot open a draft by ID; response matches a missing ID exactly", async () => {
  const db = createFakeDb(BASE_SEED);
  const draftId = await createAs(db, teacher1, {});
  const draft = await call(db, student1, "GET", `/assignments/${draftId}`);
  const missing = await call(db, student1, "GET", "/assignments/never-existed");
  assert.equal(draft.status, 404);
  assert.deepEqual(draft, missing);
});

test("teacher can open an assignment in their scope by ID", async () => {
  const db = createFakeDb(BASE_SEED);
  const id = await createAs(db, teacher1, {});
  const { status, json } = await call(db, teacher1, "GET", `/assignments/${id}`);
  assert.equal(status, 200);
  assert.equal(json.data.assignment.id, id);
});

test("out-of-scope and missing IDs return identical responses for read and write (no enumeration)", async () => {
  const db = createFakeDb(BASE_SEED);
  const outsideId = await createAs(db, admin, { classId: "class-10", subjectId: "physics-10" });
  const probes = [
    ["GET", (id) => `/assignments/${id}`, undefined],
    ["PATCH", (id) => `/assignments/${id}`, { title: "Probe title" }],
    ["POST", (id) => `/assignments/${id}/publish`, undefined],
    ["POST", (id) => `/assignments/${id}/close`, undefined]
  ];
  for (const [method, pathFor, body] of probes) {
    const outside = await call(db, teacher1, method, pathFor(outsideId), body);
    const missing = await call(db, teacher1, method, pathFor("never-existed"), body);
    assert.equal(outside.status, 404, `${method} out-of-scope should be 404`);
    assert.deepEqual(outside, missing, `${method} responses must be identical`);
  }
  assert.equal(db.store.get(`assignments/${outsideId}`).publicationState, "draft");
  assert.equal(db.store.get(`assignments/${outsideId}`).title, "Motion worksheet");
});

test("list responses never expose the creator identity", async () => {
  const db = createFakeDb(BASE_SEED);
  await createAs(db, teacher1, {});
  const { json } = await call(db, teacher1, "GET", "/assignments?classId=class-9&subjectId=physics-9");
  const serialized = JSON.stringify(json);
  assert.doesNotMatch(serialized, /createdBy|teacher-1/);
});

test("list requires valid classId and subjectId", async () => {
  const db = createFakeDb(BASE_SEED);
  const { status } = await call(db, teacher1, "GET", "/assignments?classId=class-9");
  assert.equal(status, 400);
});

test("teacher can update an assignment they own and the change is audited with field names only", async () => {
  const db = createFakeDb(BASE_SEED);
  const id = await createAs(db, teacher1, {});
  const { status } = await call(db, teacher1, "PATCH", `/assignments/${id}`, { title: "Revised worksheet" });
  assert.equal(status, 200);
  assert.equal(db.store.get(`assignments/${id}`).title, "Revised worksheet");

  const updateAudit = [...db.store.values()].find((v) => v.action === "assignment.updated");
  assert.deepEqual(updateAudit.metadata.changedFields, ["title"]);
  assert.doesNotMatch(JSON.stringify(updateAudit), /Revised worksheet/);
});

test("teacher cannot edit another class's assignment by supplying their own classId in the body (scope-bypass regression)", async () => {
  const db = createFakeDb(BASE_SEED);
  // Admin creates an assignment in class-10, which teacher-1 does not teach.
  const outsideId = await createAs(db, admin, {
    classId: "class-10", subjectId: "physics-10", title: "Class 10 task"
  });

  const { status } = await call(db, teacher1, "PATCH", `/assignments/${outsideId}`, {
    title: "Hijacked"
  });
  assert.equal(status, 404);
  assert.equal(db.store.get(`assignments/${outsideId}`).title, "Class 10 task");
});

test("scope fields cannot be changed to move an assignment between classes", async () => {
  const db = createFakeDb(BASE_SEED);
  const id = await createAs(db, teacher1, {});
  const { status, json } = await call(db, teacher1, "PATCH", `/assignments/${id}`, {
    classId: "class-10", subjectId: "physics-10"
  });
  assert.equal(status, 400);
  assert.equal(json.error.code, "INVALID_INPUT");
  assert.equal(db.store.get(`assignments/${id}`).classId, "class-9");
});

test("publication state cannot be set through update", async () => {
  const db = createFakeDb(BASE_SEED);
  const id = await createAs(db, teacher1, {});
  const { status } = await call(db, teacher1, "PATCH", `/assignments/${id}`, { publicationState: "published" });
  assert.equal(status, 400);
  assert.equal(db.store.get(`assignments/${id}`).publicationState, "draft");
});

test("publish moves draft to published once, records actor, and is audited", async () => {
  const db = createFakeDb(BASE_SEED);
  const id = await createAs(db, teacher1, {});

  const first = await call(db, teacher1, "POST", `/assignments/${id}/publish`);
  assert.equal(first.status, 200);
  const stored = db.store.get(`assignments/${id}`);
  assert.equal(stored.publicationState, "published");
  assert.equal(stored.publishedBy, "teacher-1");

  const second = await call(db, teacher1, "POST", `/assignments/${id}/publish`);
  assert.equal(second.status, 409);
  assert.equal(second.json.error.code, "CONFLICT");

  const actions = [...db.store.values()].map((v) => v.action).filter(Boolean);
  assert.ok(actions.includes("assignment.published"));
});

test("closed assignments cannot be edited or re-published", async () => {
  const db = createFakeDb(BASE_SEED);
  const id = await createAs(db, teacher1, {});
  await call(db, teacher1, "POST", `/assignments/${id}/publish`);
  const closed = await call(db, teacher1, "POST", `/assignments/${id}/close`);
  assert.equal(closed.status, 200);
  assert.equal(db.store.get(`assignments/${id}`).publicationState, "closed");

  const edit = await call(db, teacher1, "PATCH", `/assignments/${id}`, { title: "Too late" });
  assert.equal(edit.status, 409);

  const republish = await call(db, teacher1, "POST", `/assignments/${id}/publish`);
  assert.equal(republish.status, 409);
});

test("a draft cannot be closed directly", async () => {
  const db = createFakeDb(BASE_SEED);
  const id = await createAs(db, teacher1, {});
  const { status } = await call(db, teacher1, "POST", `/assignments/${id}/close`);
  assert.equal(status, 409);
});

test("teacher cannot publish another teacher's out-of-scope assignment", async () => {
  const db = createFakeDb(BASE_SEED);
  const outsideId = await createAs(db, teacher2, { classId: "class-10", subjectId: "physics-10" });
  const { status } = await call(db, teacher1, "POST", `/assignments/${outsideId}/publish`);
  assert.equal(status, 404);
  assert.equal(db.store.get(`assignments/${outsideId}`).publicationState, "draft");
});

test("admin can create in any active class and subject", async () => {
  const db = createFakeDb(BASE_SEED);
  const { status } = await call(db, admin, "POST", "/assignments",
    validCreate({ classId: "class-10", subjectId: "physics-10" }));
  assert.equal(status, 201);
});

test("assignments in inactive classes or mismatched grades are rejected", async () => {
  const seed = structuredClone(BASE_SEED);
  seed.classes["class-9"].active = false;
  const db = createFakeDb(seed);
  const { status } = await call(db, admin, "POST", "/assignments", validCreate());
  assert.equal(status, 404);

  const mismatch = createFakeDb(BASE_SEED);
  const { status: mismatchStatus } = await call(mismatch, admin, "POST", "/assignments",
    validCreate({ classId: "class-9", subjectId: "physics-10" }));
  assert.equal(mismatchStatus, 404);
});

test("invalid JSON returns 400 without touching the database", async () => {
  const db = createFakeDb(BASE_SEED);
  const request = new Request("https://example.test/api/assignments", {
    method: "POST",
    body: "{not json",
    headers: { "Content-Type": "application/json" }
  });
  const response = await handleAssignments(request, {
    path: "/assignments", user: teacher1, db, serverTimestamp
  });
  assert.equal(response.status, 400);
  assert.equal([...db.store.keys()].filter((k) => k.startsWith("assignments/")).length, 0);
});

test("invalid assignment IDs, unknown actions and wrong methods are rejected safely", async () => {
  const db = createFakeDb(BASE_SEED);
  const id = await createAs(db, teacher1, {});

  assert.equal((await call(db, teacher1, "PATCH", "/assignments/bad%2Fid", { title: "Valid title" })).status, 400);
  assert.equal((await call(db, teacher1, "POST", `/assignments/${id}/delete`)).status, 404);
  assert.equal((await call(db, teacher1, "DELETE", `/assignments/${id}`)).status, 405);
  assert.equal((await call(db, teacher1, "PUT", "/assignments")).status, 405);
  assert.equal((await call(db, teacher1, "GET", `/assignments/${id}/publish`)).status, 405);
  assert.equal((await call(db, teacher1, "POST", `/assignments/${id}/publish/extra`)).status, 404);
});

test("missing assignment returns 404 without leaking details", async () => {
  const db = createFakeDb(BASE_SEED);
  const { status, json } = await call(db, teacher1, "PATCH", "/assignments/does-not-exist", { title: "Valid title" });
  assert.equal(status, 404);
  assert.equal(json.error.code, "NOT_FOUND");
});

test("concurrent publish of one draft: exactly one succeeds and one audit entry is written", async () => {
  const db = createFakeDb(BASE_SEED);
  const id = await createAs(db, teacher1, {});

  const [first, second] = await Promise.all([
    call(db, teacher1, "POST", `/assignments/${id}/publish`),
    call(db, teacher1, "POST", `/assignments/${id}/publish`)
  ]);

  assert.deepEqual([first.status, second.status].sort(), [200, 409]);
  assert.equal(db.store.get(`assignments/${id}`).publicationState, "published");
  const publishAudits = [...db.store.values()].filter((v) => v.action === "assignment.published");
  assert.equal(publishAudits.length, 1);
});

test("concurrent close and edit: an edit never lands on a record that is already closed", async () => {
  const db = createFakeDb(BASE_SEED);
  const id = await createAs(db, teacher1, {});
  await call(db, teacher1, "POST", `/assignments/${id}/publish`);

  const [close, edit] = await Promise.all([
    call(db, teacher1, "POST", `/assignments/${id}/close`),
    call(db, teacher1, "PATCH", `/assignments/${id}`, { title: "Edited during close" })
  ]);

  assert.equal(close.status, 200);
  const record = db.store.get(`assignments/${id}`);
  assert.equal(record.publicationState, "closed");
  if (edit.status === 409) {
    assert.equal(record.title, "Motion worksheet");
  } else {
    assert.equal(edit.status, 200);
    const editAudits = [...db.store.values()].filter((v) => v.action === "assignment.updated");
    assert.equal(editAudits.length, 1);
    assert.equal(record.title, "Edited during close");
  }
});

test("concurrent publish and close on a draft behaves like one of the two serial orders", async () => {
  const db = createFakeDb(BASE_SEED);
  const id = await createAs(db, teacher1, {});

  const [publish, close] = await Promise.all([
    call(db, teacher1, "POST", `/assignments/${id}/publish`),
    call(db, teacher1, "POST", `/assignments/${id}/close`)
  ]);

  const finalState = db.store.get(`assignments/${id}`).publicationState;
  // Serial order A: publish, then close  -> both succeed, final state closed.
  // Serial order B: close, then publish  -> close is refused (draft), final state published.
  const orderA = publish.status === 200 && close.status === 200 && finalState === "closed";
  const orderB = close.status === 409 && publish.status === 200 && finalState === "published";
  assert.ok(orderA || orderB,
    `non-serializable outcome: publish=${publish.status} close=${close.status} state=${finalState}`);
});

test("assignment index file is valid JSON and declares the required composite indexes", async () => {
  const raw = await readFile(new URL("../../firestore.indexes.json", import.meta.url), "utf8");
  const parsed = JSON.parse(raw);
  const assignmentIndexes = parsed.indexes.filter((i) => i.collectionGroup === "assignments");
  assert.equal(assignmentIndexes.length, 2);

  const fieldsOf = (index) => index.fields.map((f) => `${f.fieldPath}:${f.order}`).join(",");
  const signatures = assignmentIndexes.map(fieldsOf);
  assert.ok(signatures.includes("classId:ASCENDING,subjectId:ASCENDING,createdAt:DESCENDING"));
  assert.ok(signatures.includes(
    "classId:ASCENDING,subjectId:ASCENDING,publicationState:ASCENDING,createdAt:DESCENDING"
  ));
  for (const index of parsed.indexes) {
    assert.equal(index.queryScope, "COLLECTION");
    assert.ok(index.fields.length >= 2);
  }
});
