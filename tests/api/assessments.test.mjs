import test from "node:test";
import assert from "node:assert/strict";
import { handleAssessments } from "../../netlify/functions/lib/routes/assessments.mjs";
import { createFakeDb } from "../helpers/fake-firestore.mjs";

const OPENS = "2026-11-09T09:00:00Z";
const CLOSES = "2026-11-09T12:00:00Z";
const T_BEFORE = new Date("2026-11-09T08:00:00Z");
const T_OPEN = new Date("2026-11-09T10:00:00Z");
const T_LATE = new Date("2026-11-09T12:30:00Z");

const SEED = {
  classes: { "class-9": { name: "Grade 9 A", grade: 9, active: true, academicSessionId: "2026" } },
  subjects: {
    "physics-9": { name: "Physics", board: "AJK", grade: 9, active: true },
    "chem-9": { name: "Chemistry", board: "AJK", grade: 9, active: true }
  },
  users: {
    "teacher-1": { displayName: "Ms. Ali", role: "teacher", active: true },
    "teacher-2": { displayName: "Mr. Raza", role: "teacher", active: true },
    "stu-amina": { displayName: "Amina Khan", role: "student", active: true },
    "stu-bilal": { displayName: "Bilal Ahmed", role: "student", active: true },
    "stu-outside": { displayName: "Outsider", role: "student", active: true }
  },
  classAccess: {
    "ca_82c5dd0dfce93b6e2ad93814f25421c9a32e85d3ac4e2575348f4b10e953a090": { userUid: "teacher-1", classId: "class-9", accessType: "teacher", active: true },
    "ca_0f22e035af6e5dbb7140a7c03b72b14909b5ecc294e1d5abf96ad61a8ad35e89": { userUid: "teacher-2", classId: "class-9", accessType: "teacher", active: true },
    "ca_8cf8d5d5a5beae7b10cdaef7d6a682922467964bc58d3693f8e72f03640980f1": { userUid: "stu-amina", classId: "class-9", accessType: "student", active: true },
    "ca_eec8d033e423c94ad3acbdb2072349f3a551ef734aab4963e01d20990a16ebdb": { userUid: "stu-bilal", classId: "class-9", accessType: "student", active: true }
  },
  teachingAssignments: {
    "ta-t1": { teacherUid: "teacher-1", classId: "class-9", subjectId: "physics-9", active: true }
  }
};

const teacher1 = { uid: "teacher-1", role: "teacher" };
const teacher2 = { uid: "teacher-2", role: "teacher" };
const admin = { uid: "admin-1", role: "admin" };
const amina = { uid: "stu-amina", role: "student" };
const bilal = { uid: "stu-bilal", role: "student" };
const outsider = { uid: "stu-outside", role: "student" };

const QUESTIONS = [
  { text: "Unit of force?", options: ["Newton", "Joule", "Watt"], correctIndex: 0, marks: 2 },
  { text: "Speed equals?", options: ["distance / time", "time / distance"], correctIndex: 0, marks: 3 }
];
const TOTAL = 5;

// Each call gets an explicit clock so window and deadline checks are deterministic.
async function call(db, user, method, path, body, { now = T_OPEN, query = "" } = {}) {
  const url = `https://example.test/api${path}${query}`;
  const init = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  try {
    const response = await handleAssessments(new Request(url, init), {
      path,
      user,
      db,
      serverTimestamp: () => "SERVER_TS",
      now: () => new Date(now)
    });
    return { status: response.status, json: await response.json() };
  } catch (error) {
    return { status: 500, json: { error: { code: error.message } } };
  }
}

const draftBody = (overrides = {}) => ({
  classId: "class-9",
  subjectId: "physics-9",
  title: "Motion and force quiz",
  assessmentType: "quiz",
  instructions: "Answer every question.",
  durationMinutes: 30,
  opensAt: OPENS,
  closesAt: CLOSES,
  questions: QUESTIONS,
  ...overrides
});

async function createDraft(db, user = teacher1, overrides = {}) {
  const { status, json } = await call(db, user, "POST", "/assessments", draftBody(overrides));
  assert.equal(status, 201, JSON.stringify(json));
  return json.data.id;
}

async function publish(db, id, user = teacher1, now = T_BEFORE) {
  const { status } = await call(db, user, "POST", `/assessments/${id}/publish`, undefined, { now });
  assert.equal(status, 200);
}

const stored = (db, id) => db.store.get(`assessments/${id}`);
const keyOf = (db, id) => db.store.get(`assessmentAnswerKeys/${id}`);

test("create stores questions without answers and keeps the answer key in its own record", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  const doc = stored(db, id);
  assert.equal(doc.publicationState, "draft");
  assert.equal(doc.totalMarks, TOTAL);
  assert.equal(doc.questions.length, 2);
  assert.ok(doc.questions.every((q) => !("correctIndex" in q)), "questions must not carry answers");
  assert.doesNotMatch(JSON.stringify(doc), /"answers"/);
  assert.deepEqual(keyOf(db, id).answers, { q1: 0, q2: 0 });
});

test("create validation refuses malformed questions, dates and unsupported fields", async () => {
  const db = createFakeDb(SEED);
  const cases = [
    draftBody({ questions: [{ ...QUESTIONS[0], correctIndex: 5 }] }),
    draftBody({ questions: [{ ...QUESTIONS[0], options: ["only one"] }] }),
    draftBody({ questions: [{ ...QUESTIONS[0], marks: 11 }] }),
    draftBody({ questions: [] }),
    draftBody({ questions: Array.from({ length: 51 }, () => QUESTIONS[0]) }),
    draftBody({ closesAt: OPENS }),
    draftBody({ closesAt: "2026-11-09T12:00:00" }),
    draftBody({ publicationState: "published" }),
    draftBody({ answers: { q1: 0 } }),
    draftBody({ durationMinutes: 0 })
  ];
  for (const body of cases) {
    const { status } = await call(db, teacher1, "POST", "/assessments", body);
    assert.equal(status, 400, `expected 400 for ${JSON.stringify(body).slice(0, 90)}`);
  }
});

test("teachers cannot create in a subject they are not assigned, and get the same 404 as a missing class", async () => {
  const db = createFakeDb(SEED);
  const unassigned = await call(db, teacher1, "POST", "/assessments", draftBody({ subjectId: "chem-9" }));
  const noAssignment = await call(db, teacher2, "POST", "/assessments", draftBody());
  const missing = await call(db, teacher1, "POST", "/assessments", draftBody({ classId: "nope" }));
  assert.equal(unassigned.status, 404);
  assert.equal(noAssignment.status, 404);
  assert.deepEqual(unassigned.json, missing.json);
});

test("students cannot create or edit assessments", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  assert.equal((await call(db, amina, "POST", "/assessments", draftBody())).status, 403);
  assert.equal((await call(db, amina, "PATCH", `/assessments/${id}`, { title: "Edited" })).status, 403);
  assert.equal((await call(db, amina, "POST", `/assessments/${id}/publish`)).status, 403);
});

test("publishing requires questions and moves draft to published once", async () => {
  const db = createFakeDb(SEED);
  const empty = await call(db, teacher1, "POST", "/assessments", draftBody({ questions: undefined }));
  assert.equal(empty.status, 201);
  const emptyId = empty.json.data.id;
  assert.equal((await call(db, teacher1, "POST", `/assessments/${emptyId}/publish`, undefined, { now: T_BEFORE })).status, 409);

  const id = await createDraft(db);
  await publish(db, id);
  assert.equal(stored(db, id).publicationState, "published");
  assert.equal((await call(db, teacher1, "POST", `/assessments/${id}/publish`, undefined, { now: T_BEFORE })).status, 409);
});

test("questions, dates and time limit are locked after publication; title and instructions stay editable", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  await publish(db, id);
  assert.equal((await call(db, teacher1, "PATCH", `/assessments/${id}`, { questions: QUESTIONS }, { now: T_BEFORE })).status, 409);
  assert.equal((await call(db, teacher1, "PATCH", `/assessments/${id}`, { durationMinutes: 60 }, { now: T_BEFORE })).status, 409);
  assert.equal((await call(db, teacher1, "PATCH", `/assessments/${id}`, { title: "Renamed quiz" }, { now: T_BEFORE })).status, 200);
  assert.equal(stored(db, id).title, "Renamed quiz");
});

test("closing: only published assessments close, and closed ones cannot be edited", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  assert.equal((await call(db, teacher1, "POST", `/assessments/${id}/close`, undefined, { now: T_BEFORE })).status, 409);
  await publish(db, id);
  assert.equal((await call(db, teacher1, "POST", `/assessments/${id}/close`, undefined, { now: T_BEFORE })).status, 200);
  assert.equal((await call(db, teacher1, "PATCH", `/assessments/${id}`, { title: "Late edit" }, { now: T_BEFORE })).status, 409);
});

test("listing: students see published and closed assessments only; staff see drafts too", async () => {
  const db = createFakeDb(SEED);
  const draft = await createDraft(db, teacher1, { title: "Draft one" });
  const live = await createDraft(db, teacher1, { title: "Live one" });
  const past = await createDraft(db, teacher1, { title: "Past one" });
  await publish(db, live);
  await publish(db, past);
  await call(db, teacher1, "POST", `/assessments/${past}/close`, undefined, { now: T_BEFORE });

  const query = "?classId=class-9&subjectId=physics-9";
  const studentView = await call(db, amina, "GET", "/assessments", undefined, { query });
  const ids = studentView.json.data.assessments.map((a) => a.id).sort();
  assert.deepEqual(ids, [live, past].sort());
  assert.ok(!ids.includes(draft));
  assert.ok(studentView.json.data.assessments.every((a) => !("questions" in a) && !("answers" in a)));

  const staffView = await call(db, teacher1, "GET", "/assessments", undefined, { query });
  assert.equal(staffView.json.data.assessments.length, 3);
});

test("student detail never includes questions or answers; staff detail includes the answer key", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  await publish(db, id);

  const student = await call(db, amina, "GET", `/assessments/${id}`, undefined, { now: T_OPEN });
  const serialized = JSON.stringify(student.json);
  assert.doesNotMatch(serialized, /correctIndex|questions|"answers"/);

  const staff = await call(db, teacher1, "GET", `/assessments/${id}`);
  assert.equal(staff.json.data.assessment.questions[0].correctIndex, 0);
});

test("drafts are invisible to students, and the response matches a missing assessment", async () => {
  const db = createFakeDb(SEED);
  const draft = await createDraft(db);
  const hidden = await call(db, amina, "GET", `/assessments/${draft}`);
  const missing = await call(db, amina, "GET", "/assessments/never-existed");
  assert.equal(hidden.status, 404);
  assert.deepEqual(hidden.json, missing.json);
});

test("start is refused before opening and after closing", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  await publish(db, id);
  const early = await call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: T_BEFORE });
  const late = await call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: T_LATE });
  assert.equal(early.status, 409);
  assert.equal(late.status, 409);
});

test("start returns questions without answers and a deadline no later than closing", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  await publish(db, id);
  const { status, json } = await call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: T_OPEN });
  assert.equal(status, 201);
  assert.match(json.data.attemptId, /^[0-9a-f]{64}$/);
  assert.ok(Date.parse(json.data.deadline) <= Date.parse(CLOSES));
  assert.ok(json.data.questions.every((q) => !("correctIndex" in q)));
  assert.doesNotMatch(JSON.stringify(json), /correctIndex/);
});

test("membership deactivation racing with assessment start prevents attempt creation", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  await publish(db, id);
  db.beforeNextCommit = () => db.updateDocument("classAccess", "ca_8cf8d5d5a5beae7b10cdaef7d6a682922467964bc58d3693f8e72f03640980f1", { active: false });
  const result = await call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: T_OPEN });
  assert.equal(result.status, 404);
  assert.equal([...db.store.keys()].filter((key) => key.startsWith("assessmentAttempts/")).length, 0);
  assert.equal([...db.store.keys()].filter((key) => key.startsWith("assessmentResults/")).length, 0);
});

test("concurrent starts create exactly one attempt", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  await publish(db, id);
  const [a, b] = await Promise.all([
    call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: T_OPEN }),
    call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: T_OPEN })
  ]);
  assert.equal(a.json.data.attemptId, b.json.data.attemptId, "both requests must resume the same attempt");
  const attempts = [...db.store.keys()].filter((k) => k.startsWith("assessmentAttempts/"));
  assert.equal(attempts.length, 1);
  const result = [...db.store.entries()].find(([k]) => k.startsWith("assessmentResults/"))[1];
  assert.equal(result.attemptsUsed, 1);
});

test("submitting scores server-side against the key and hides the score from students", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  await publish(db, id);
  const { json: started } = await call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: T_OPEN });

  const submit = await call(db, amina, "POST", `/assessments/${id}/submit`,
    { attemptId: started.data.attemptId, answers: { q1: 0, q2: 1 } }, { now: T_OPEN });
  assert.equal(submit.status, 200);
  assert.doesNotMatch(JSON.stringify(submit.json), /score|correct/i);

  const attempt = db.store.get(`assessmentAttempts/${started.data.attemptId}`);
  assert.equal(attempt.score, 2, "q1 correct (2 marks), q2 wrong (0 marks)");
  assert.equal(attempt.maxScore, TOTAL);

  const student = await call(db, amina, "GET", `/assessments/${id}`, undefined, { now: T_OPEN });
  assert.equal(student.json.data.assessment.attempt.status, "submitted");
  assert.equal(student.json.data.assessment.attempt.score, null, "marks stay hidden until released");
});

test("submission validation rejects unknown questions, bad options and other students' attempts", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  await publish(db, id);
  const { json: started } = await call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: T_OPEN });
  const attemptId = started.data.attemptId;

  assert.equal((await call(db, amina, "POST", `/assessments/${id}/submit`, { attemptId, answers: { q9: 0 } }, { now: T_OPEN })).status, 400);
  assert.equal((await call(db, amina, "POST", `/assessments/${id}/submit`, { attemptId, answers: { q1: 7 } }, { now: T_OPEN })).status, 400);
  assert.equal((await call(db, amina, "POST", `/assessments/${id}/submit`, { attemptId, answers: { q1: "0" } }, { now: T_OPEN })).status, 400);
  assert.equal((await call(db, bilal, "POST", `/assessments/${id}/submit`, { attemptId, answers: {} }, { now: T_OPEN })).status, 404);
});

test("a submitted attempt cannot be submitted again", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  await publish(db, id);
  const { json: started } = await call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: T_OPEN });
  const body = { attemptId: started.data.attemptId, answers: { q1: 0 } };
  assert.equal((await call(db, amina, "POST", `/assessments/${id}/submit`, body, { now: T_OPEN })).status, 200);
  assert.equal((await call(db, amina, "POST", `/assessments/${id}/submit`, body, { now: T_OPEN })).status, 409);
});

test("an attempt submitted after its time limit expires and cannot be scored", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db, teacher1, { durationMinutes: 30 });
  await publish(db, id);
  const { json: started } = await call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: T_OPEN });

  const late = new Date("2026-11-09T10:31:00Z");
  const submit = await call(db, amina, "POST", `/assessments/${id}/submit`,
    { attemptId: started.data.attemptId, answers: { q1: 0, q2: 0 } }, { now: late });
  assert.equal(submit.status, 409);
  assert.equal(db.store.get(`assessmentAttempts/${started.data.attemptId}`).status, "expired");
  assert.equal(db.store.get(`assessmentAttempts/${started.data.attemptId}`).score, null);

  const restart = await call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: late });
  assert.equal(restart.status, 409, "the single attempt has been used");
});

test("approval and release are separate, ordered steps, and the batch is all-or-nothing", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  await publish(db, id);
  const { json: aStart } = await call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: T_OPEN });
  await call(db, amina, "POST", `/assessments/${id}/submit`, { attemptId: aStart.data.attemptId, answers: { q1: 0, q2: 0 } }, { now: T_OPEN });

  // Bilal has not submitted, so approving both must write nothing.
  const mixed = await call(db, teacher1, "POST", `/assessments/${id}/results/approve`,
    { studentUids: ["stu-amina", "stu-bilal"] });
  assert.equal(mixed.status, 409);
  assert.equal(db.store.get(`assessmentResults/${[...db.store.keys()].find((k) => k.startsWith("assessmentResults/")).split("/")[1]}`).state, "pending_review");

  // Release before approval is refused.
  assert.equal((await call(db, teacher1, "POST", `/assessments/${id}/results/release`, { studentUids: ["stu-amina"] })).status, 409);

  assert.equal((await call(db, teacher1, "POST", `/assessments/${id}/results/approve`, { studentUids: ["stu-amina"] })).status, 200);
  const approvedButUnreleased = await call(db, amina, "GET", `/assessments/${id}`);
  assert.equal(approvedButUnreleased.json.data.assessment.attempt.score, null);

  assert.equal((await call(db, teacher1, "POST", `/assessments/${id}/results/release`, { studentUids: ["stu-amina"] })).status, 200);
  const released = await call(db, amina, "GET", `/assessments/${id}`);
  assert.equal(released.json.data.assessment.attempt.status, "released");
  assert.equal(released.json.data.assessment.attempt.score, TOTAL, "both answers were correct");
  assert.equal(released.json.data.assessment.attempt.maxScore, TOTAL);
});

test("students cannot approve, release or view other students' marks", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  await publish(db, id);
  assert.equal((await call(db, amina, "POST", `/assessments/${id}/results/approve`, { studentUids: ["stu-amina"] })).status, 403);
  assert.equal((await call(db, amina, "GET", `/assessments/${id}/results`)).status, 403);
});

test("a retake needs teacher approval after the attempt is used; approval grants exactly one more attempt", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  await publish(db, id);
  const { json: first } = await call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: T_OPEN });
  await call(db, amina, "POST", `/assessments/${id}/submit`, { attemptId: first.data.attemptId, answers: {} }, { now: T_OPEN });

  const firstApproval = await call(db, teacher1, "POST", `/assessments/${id}/retakes`, { studentUid: "stu-amina" });
  assert.equal(firstApproval.status, 200, "approval is allowed once the attempt is used");

  const again = await call(db, teacher1, "POST", `/assessments/${id}/retakes`, { studentUid: "stu-amina" });
  assert.equal(again.status, 409, "one approval grants one attempt only");

  const { status } = await call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: T_OPEN });
  assert.equal(status, 201, "the approved retake can be started");
});

test("a retake cannot be approved for a student who still has an attempt or has never started", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  await publish(db, id);
  assert.equal((await call(db, teacher1, "POST", `/assessments/${id}/retakes`, { studentUid: "stu-bilal" })).status, 409);
  await call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: T_OPEN });
  assert.equal((await call(db, teacher1, "POST", `/assessments/${id}/retakes`, { studentUid: "stu-amina" })).status, 409);
});

test("results overview lists the class roster with states and scores for staff", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  await publish(db, id);
  const { json: started } = await call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: T_OPEN });
  await call(db, amina, "POST", `/assessments/${id}/submit`, { attemptId: started.data.attemptId, answers: { q1: 0 } }, { now: T_OPEN });

  const { status, json } = await call(db, teacher1, "GET", `/assessments/${id}/results`);
  assert.equal(status, 200);
  const byName = Object.fromEntries(json.data.students.map((s) => [s.name, s]));
  assert.equal(byName["Amina Khan"].state, "pending_review");
  assert.equal(byName["Amina Khan"].score, 2);
  assert.equal(byName["Bilal Ahmed"].state, "none");
  // Opaque UIDs appear only under studentUid, which staff need to act on individual students.
  const withoutUidKeys = JSON.stringify(json.data.students.map(({ studentUid, ...rest }) => rest));
  assert.doesNotMatch(withoutUidKeys, /stu-amina|stu-bilal/);
  assert.doesNotMatch(JSON.stringify(json), /answers|correctIndex/);
});

test("out-of-scope staff get the same 404 as a missing assessment on every record route", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  await publish(db, id);
  const probes = [
    ["GET", `/assessments/${id}`],
    ["PATCH", `/assessments/${id}`],
    ["GET", `/assessments/${id}/results`],
    ["POST", `/assessments/${id}/publish`]
  ];
  for (const [method, path] of probes) {
    const denied = await call(db, teacher2, method, path, method === "PATCH" ? { title: "Probe quiz" } : undefined, { now: T_BEFORE });
    const missing = await call(db, teacher2, method, path.replace(id, "never-existed"), method === "PATCH" ? { title: "Probe quiz" } : undefined, { now: T_BEFORE });
    assert.equal(denied.status, 404, `${method} ${path}`);
    assert.deepEqual(denied.json, missing.json, `${method} ${path} must not reveal existence`);
  }
});

test("audit entries exist for lifecycle actions and never contain answers, keys or scores", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  await publish(db, id);
  const { json: started } = await call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: T_OPEN });
  await call(db, amina, "POST", `/assessments/${id}/submit`, { attemptId: started.data.attemptId, answers: { q1: 0 } }, { now: T_OPEN });

  const actions = [...db.store.values()].map((v) => v.action).filter(Boolean);
  for (const expected of ["assessment.created", "assessment.published", "assessment.submitted"]) {
    assert.ok(actions.includes(expected), `missing ${expected}`);
  }
  const auditText = JSON.stringify([...db.store.entries()].filter(([k]) => k.startsWith("auditLogs/")).map(([, v]) => v));
  assert.doesNotMatch(auditText, /"answers"|correctIndex|"score"/);
});

test("administrators can create and publish in any active class and subject", async () => {
  const db = createFakeDb(SEED);
  const { status } = await call(db, admin, "POST", "/assessments", draftBody({ subjectId: "chem-9" }));
  assert.equal(status, 201);
});

test("routing refuses unknown paths and unsupported methods", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  assert.equal((await call(db, teacher1, "DELETE", `/assessments/${id}`)).status, 405);
  assert.equal((await call(db, teacher1, "GET", `/assessments/${id}/unknown`)).status, 404);
  assert.equal((await call(db, amina, "GET", `/assessments/${id}/start`)).status, 405);
});

test("results distinguish in-progress and expired-without-submission attempts", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db, teacher1, { durationMinutes: 10 });
  await publish(db, id);
  await call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: T_OPEN });
  const during = await call(db, teacher1, "GET", `/assessments/${id}/results`);
  assert.equal(during.json.data.students.find((s) => s.name === "Amina Khan").state, "in_progress");

  await call(db, amina, "POST", `/assessments/${id}/submit`, { attemptId: [...db.store.keys()].find((k) => k.startsWith("assessmentAttempts/")).split("/")[1], answers: {} },
    { now: new Date("2026-11-09T11:00:00Z") });
  const after = await call(db, teacher1, "GET", `/assessments/${id}/results`);
  assert.equal(after.json.data.students.find((s) => s.name === "Amina Khan").state, "not_submitted");
});

// ----- Student list, availability windows, answer review and reopening -----

async function startAndSubmit(db, user, id, answers, now = T_OPEN) {
  const started = await call(db, user, "POST", `/assessments/${id}/start`, undefined, { now });
  assert.equal(started.status, 201, JSON.stringify(started.json));
  const submitted = await call(db, user, "POST", `/assessments/${id}/submit`,
    { attemptId: started.json.data.attemptId, answers }, { now });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.json));
  return started.json.data.attemptId;
}

test("student list shows only published and closed assessments in their own classes, with their status", async () => {
  const db = createFakeDb(SEED);
  const live = await createDraft(db, teacher1, { title: "Live quiz" });
  const draft = await createDraft(db, teacher1, { title: "Draft quiz" });
  await publish(db, live);

  const { status, json } = await call(db, amina, "GET", "/assessments/mine", undefined, { now: T_OPEN });
  assert.equal(status, 200);
  const ids = json.data.assessments.map((a) => a.id);
  assert.deepEqual(ids, [live]);
  assert.ok(!ids.includes(draft));

  const item = json.data.assessments[0];
  assert.equal(item.className, "Grade 9 A");
  assert.equal(item.subjectName, "Physics");
  assert.equal(item.window, "open");
  assert.equal(item.attempt.status, "not_started");
  assert.ok(!("questions" in item) && !("answers" in item), "list never carries questions or answers");
});

test("student list reports the score only after release", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  await publish(db, id);
  await startAndSubmit(db, amina, id, { q1: 0, q2: 0 });

  const before = await call(db, amina, "GET", "/assessments/mine", undefined, { now: T_OPEN });
  assert.equal(before.json.data.assessments[0].attempt.status, "submitted");
  assert.equal(before.json.data.assessments[0].attempt.score, null);

  await call(db, teacher1, "POST", `/assessments/${id}/results/approve`, { studentUids: ["stu-amina"] });
  await call(db, teacher1, "POST", `/assessments/${id}/results/release`, { studentUids: ["stu-amina"] });
  const after = await call(db, amina, "GET", "/assessments/mine", undefined, { now: T_OPEN });
  assert.equal(after.json.data.assessments[0].attempt.status, "released");
  assert.equal(after.json.data.assessments[0].attempt.score, TOTAL);
});

test("staff and students outside a class cannot use the student list", async () => {
  const db = createFakeDb(SEED);
  assert.equal((await call(db, teacher1, "GET", "/assessments/mine")).status, 403);
  const other = await call(db, outsider, "GET", "/assessments/mine", undefined, { now: T_OPEN });
  assert.equal(other.status, 200);
  assert.deepEqual(other.json.data.assessments, []);
});

test("assessment detail reports whether the window is upcoming, open or closed", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  await publish(db, id);
  const windowAt = async (now) => (await call(db, amina, "GET", `/assessments/${id}`, undefined, { now })).json.data.assessment.attempt.window;
  assert.equal(await windowAt(T_BEFORE), "upcoming");
  assert.equal(await windowAt(T_OPEN), "open");
  assert.equal(await windowAt(T_LATE), "closed");
});

test("staff can review a submitted attempt answer by answer; students cannot", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  await publish(db, id);
  await startAndSubmit(db, amina, id, { q1: 0, q2: 1 });

  const review = await call(db, teacher1, "GET", `/assessments/${id}/attempts`, undefined, { query: "?studentUid=stu-amina" });
  assert.equal(review.status, 200);
  const [first, second] = review.json.data.answers;
  assert.equal(first.correct, true);
  assert.equal(second.correct, false);
  assert.equal(second.chosenIndex, 1);
  assert.equal(second.correctIndex, 0);
  assert.equal(review.json.data.score, 2);

  assert.equal((await call(db, amina, "GET", `/assessments/${id}/attempts`, undefined, { query: "?studentUid=stu-amina" })).status, 403);
});

test("review is refused when no attempt was submitted", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  await publish(db, id);
  const review = await call(db, teacher1, "GET", `/assessments/${id}/attempts`, undefined, { query: "?studentUid=stu-bilal" });
  assert.equal(review.status, 404);
});

test("a technical problem lets the teacher reopen an expired attempt; history is kept and marks do not change", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db, teacher1, { durationMinutes: 10 });
  await publish(db, id);
  await call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: T_OPEN });
  // The power cut means the student never submitted; the attempt expires on the next request.
  await call(db, amina, "POST", `/assessments/${id}/submit`, { attemptId: [...db.store.keys()].find((k) => k.startsWith("assessmentAttempts/")).split("/")[1], answers: {} }, { now: new Date("2026-11-09T10:30:00Z") });

  const reopen = await call(db, teacher1, "POST", `/assessments/${id}/reopen`,
    { studentUid: "stu-amina", reason: "Power cut at school" }, { now: new Date("2026-11-09T10:31:00Z") });
  assert.equal(reopen.status, 200, JSON.stringify(reopen.json));

  const attemptKey = [...db.store.keys()].find((k) => k.startsWith("assessmentAttempts/"));
  const attempt = db.store.get(attemptKey);
  assert.equal(attempt.status, "in_progress");
  assert.equal(attempt.reopenings.length, 1);
  assert.equal(attempt.reopenings[0].reason, "Power cut at school");
  assert.equal(attempt.score, null, "reopening never changes marks");

  const resume = await call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: new Date("2026-11-09T10:32:00Z") });
  assert.equal(resume.status, 200, "resuming an open attempt is not a new attempt");
  assert.equal(resume.json.data.attemptId, attemptKey.split("/")[1], "the reopened attempt is resumed");
});

test("an in-progress attempt past its deadline can be reopened without waiting for expiry", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db, teacher1, { durationMinutes: 10 });
  await publish(db, id);
  await call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: T_OPEN });
  const reopen = await call(db, teacher1, "POST", `/assessments/${id}/reopen`,
    { studentUid: "stu-amina", reason: "Laptop failed" }, { now: new Date("2026-11-09T10:30:00Z") });
  assert.equal(reopen.status, 200);
});

test("reopening is refused for live attempts, submitted attempts, closed assessments and empty reasons", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db, teacher1, { durationMinutes: 30 });
  await publish(db, id);
  await call(db, amina, "POST", `/assessments/${id}/start`, undefined, { now: T_OPEN });

  const live = await call(db, teacher1, "POST", `/assessments/${id}/reopen`, { studentUid: "stu-amina", reason: "Testing" }, { now: T_OPEN });
  assert.equal(live.status, 409, "an attempt still within its time is not reopened");

  const blank = await call(db, teacher1, "POST", `/assessments/${id}/reopen`, { studentUid: "stu-amina", reason: " " }, { now: T_OPEN });
  assert.equal(blank.status, 400);

  const closedWindow = await call(db, teacher1, "POST", `/assessments/${id}/reopen`, { studentUid: "stu-amina", reason: "Late report" }, { now: T_LATE });
  assert.equal(closedWindow.status, 409, "nothing is reopened after the assessment closes");
});

test("reopening is refused for out-of-scope teachers with the same 404 as a missing assessment", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db, teacher1, { durationMinutes: 10 });
  await publish(db, id);
  const denied = await call(db, teacher2, "POST", `/assessments/${id}/reopen`, { studentUid: "stu-amina", reason: "Power cut" }, { now: T_OPEN });
  const missing = await call(db, teacher2, "POST", "/assessments/never-existed/reopen", { studentUid: "stu-amina", reason: "Power cut" }, { now: T_OPEN });
  assert.equal(denied.status, 404);
  assert.deepEqual(denied.json, missing.json);
});

test("routing: mine, attempts and reopen are reachable with the right methods only", async () => {
  const db = createFakeDb(SEED);
  const id = await createDraft(db);
  assert.equal((await call(db, amina, "POST", "/assessments/mine")).status, 405);
  assert.equal((await call(db, teacher1, "POST", `/assessments/${id}/attempts`)).status, 405);
  assert.equal((await call(db, teacher1, "GET", `/assessments/${id}/reopen`)).status, 405);
});
