import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { classAccessDocumentId } from "../../netlify/functions/lib/authorization.mjs";
import { attendanceRecordId, handleAttendance } from "../../netlify/functions/lib/routes/attendance.mjs";
import { handleAssignments } from "../../netlify/functions/lib/routes/assignments.mjs";
import { handleAssessments } from "../../netlify/functions/lib/routes/assessments.mjs";

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.GCLOUD_PROJECT || "";
const emulatorConfigured = process.env.FIREBASE_AUTH_EMULATOR_HOST === "127.0.0.1:9099" &&
  process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8080" && projectId.startsWith("demo-");

function pauseFirstWrite(db) {
  let signalEntered;
  let release;
  let paused = false;
  const entered = new Promise((resolve) => { signalEntered = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const racingDb = new Proxy(db, {
    get(target, property) {
      if (property === "runTransaction") {
        return (callback, options) => target.runTransaction(async (transaction) => {
          let wrote = false;
          const wrappedTransaction = new Proxy(transaction, {
            get(tx, method) {
              const value = Reflect.get(tx, method, tx);
              if (method === "set" || method === "update") {
                return (...args) => {
                  wrote = true;
                  return value.apply(tx, args);
                };
              }
              return typeof value === "function" ? value.bind(tx) : value;
            }
          });
          const result = await callback(wrappedTransaction);
          if (wrote && !paused) {
            paused = true;
            signalEntered();
            await gate;
          }
          return result;
        }, options);
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  return { db: racingDb, entered, release };
}

async function setupRun() {
  const { getDb } = await import("../../netlify/functions/lib/firebase-admin.mjs");
  const db = getDb();
  const suffix = randomUUID().replaceAll("-", "");
  const classId = `p7class${suffix}`;
  const subjectId = `p7subject${suffix}`;
  const teacherUid = `p7teacher${suffix}`;
  const studentUid = `p7student${suffix}`;
  const assessmentId = `p7assessment${suffix}`;
  const assignmentId = `p7assignment${suffix}`;
  const teacherMembership = db.collection("classAccess").doc(classAccessDocumentId(classId, teacherUid, "teacher"));
  const studentMembership = db.collection("classAccess").doc(classAccessDocumentId(classId, studentUid, "student"));
  const teachingAssignment = db.collection("teachingAssignments").doc(`p7ta${suffix}`);
  const classRef = db.collection("classes").doc(classId);
  const subjectRef = db.collection("subjects").doc(subjectId);
  const studentAttendanceRef = db.collection("attendanceRecords").doc(attendanceRecordId(classId, "2026-11-09", studentUid));
  const assignmentRef = db.collection("assignments").doc(assignmentId);
  const assessmentRef = db.collection("assessments").doc(assessmentId);

  await Promise.all([
    classRef.set({ grade: 9, active: true, synthetic: true }),
    subjectRef.set({ grade: 9, active: true, synthetic: true }),
    teacherMembership.set({ classId, userUid: teacherUid, accessType: "teacher", active: true, synthetic: true }),
    studentMembership.set({ classId, userUid: studentUid, accessType: "student", active: true, synthetic: true }),
    teachingAssignment.set({ teacherUid, classId, subjectId, active: true, synthetic: true }),
    db.collection("users").doc(studentUid).set({ role: "student", active: true, displayName: "Synthetic Student" }),
    studentAttendanceRef.set({ classId, attendanceDate: "2026-11-09", studentUid, status: "absent", correctionCount: 0, synthetic: true }),
    assignmentRef.set({ title: "Synthetic assignment", instructions: "", type: "physical", classId, subjectId, dueAt: null, publicationState: "draft", synthetic: true }),
    assessmentRef.set({ title: "Synthetic assessment", classId, subjectId, publicationState: "published", totalMarks: 2, questions: [{ id: "q1", text: "Question?", options: ["A", "B"], marks: 2 }], durationMinutes: null, opensAt: null, closesAt: null, synthetic: true })
  ]);

  return {
    db, suffix, classId, subjectId, teacherUid, studentUid, assessmentId, assignmentId,
    teacherMembership, studentMembership, teachingAssignment, classRef, subjectRef,
    studentAttendanceRef, assignmentRef, assessmentRef
  };
}

function context(db, path, user) {
  return {
    db, path, user,
    serverTimestamp: () => new Date().toISOString(),
    today: () => "2026-11-10",
    now: () => new Date("2026-11-10T10:00:00.000Z")
  };
}

async function responseOf(promise) {
  const response = await promise;
  return { status: response.status, body: await response.json() };
}

async function cleanup(run) {
  const collections = ["attendanceCorrections", "auditLogs", "assessmentAttempts", "assessmentResults"];
  const refs = [run.classRef, run.subjectRef, run.teacherMembership, run.studentMembership,
    run.teachingAssignment, run.studentAttendanceRef, run.assignmentRef, run.assessmentRef,
    run.db.collection("users").doc(run.studentUid)];
  for (const name of collections) {
    const snapshot = await run.db.collection(name).where("classId", "==", run.classId).get();
    refs.push(...snapshot.docs.map((doc) => run.db.collection(name).doc(doc.id)));
  }
  await Promise.all(refs.map((ref) => ref.delete().catch(() => {})));
}

async function raceAndAssert({ run, handler, request, path, user, revoke, assertState }) {
  const paused = pauseFirstWrite(run.db);
  let operation;

  try {
    operation = responseOf(handler(request, context(paused.db, path, user)));

    // Detect whether the route fails or returns before reaching its first write.
    const result = await Promise.race([
      paused.entered.then(() => ({ kind: "entered" })),
      operation.then(
        (response) => ({ kind: "completed", response }),
        (error) => ({ kind: "rejected", error })
      )
    ]);

    if (result.kind === "rejected") {
      throw result.error;
    }

    if (result.kind === "completed") {
      throw new Error(
        `Route completed before the first transaction write. ` +
        `HTTP ${result.response.status}; body: ${JSON.stringify(result.response.body)}`
      );
    }

    await revoke();
    paused.release();

    const response = await operation;
    await assertState(response);
  } finally {
    paused.release();
    await cleanup(run);
  }
}

test("production attendance mark route rejects teacher membership revoked before commit", { skip: !emulatorConfigured }, async () => {
  const run = await setupRun();
  await raceAndAssert({
    run, handler: handleAttendance, path: "/attendance/mark",
    request: new Request("https://local.test/api/attendance/mark", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ classId: run.classId, date: "2026-11-09", records: [{ studentUid: run.studentUid, status: "present" }] }) }),
    user: { uid: run.teacherUid, role: "teacher" },
    revoke: () => run.teacherMembership.update({ active: false }),
    assertState: async (response) => {
      assert.equal(response.status, 404);
      assert.equal((await run.studentAttendanceRef.get()).data().status, "absent");
    }
  });
});

test("production attendance correction route rejects teacher membership revoked before commit", { skip: !emulatorConfigured }, async () => {
  const run = await setupRun();
  await raceAndAssert({
    run, handler: handleAttendance, path: "/attendance/correct",
    request: new Request("https://local.test/api/attendance/correct", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ classId: run.classId, date: "2026-11-09", studentUid: run.studentUid, status: "present", reason: "Verified correction" }) }),
    user: { uid: run.teacherUid, role: "teacher" },
    revoke: () => run.teacherMembership.update({ active: false }),
    assertState: async (response) => {
      assert.equal(response.status, 404);
      assert.equal((await run.studentAttendanceRef.get()).data().status, "absent");
      const history = await run.db.collection("attendanceCorrections").where("classId", "==", run.classId).get();
      assert.equal(history.size, 0);
    }
  });
});

test("production assignment create route rejects a revoked teaching assignment before commit", { skip: !emulatorConfigured }, async () => {
  const run = await setupRun();
  await raceAndAssert({
    run, handler: handleAssignments, path: "/assignments",
    request: new Request("https://local.test/api/assignments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "New task", instructions: "", type: "physical", classId: run.classId, subjectId: run.subjectId, dueAt: null }) }),
    user: { uid: run.teacherUid, role: "teacher" },
    revoke: () => run.teachingAssignment.update({ active: false }),
    assertState: async (response) => {
      assert.equal(response.status, 403);
      const created = await run.db.collection("assignments").where("classId", "==", run.classId).get();
      assert.equal(created.size, 1, "only the pre-seeded assignment remains");
    }
  });
});

test("production assignment publish route rejects a revoked teaching assignment before commit", { skip: !emulatorConfigured }, async () => {
  const run = await setupRun();
  await raceAndAssert({
    run, handler: handleAssignments, path: `/assignments/${run.assignmentId}/publish`,
    request: new Request(`https://local.test/api/assignments/${run.assignmentId}/publish`, { method: "POST" }),
    user: { uid: run.teacherUid, role: "teacher" },
    revoke: () => run.teachingAssignment.update({ active: false }),
    assertState: async (response) => {
      assert.equal(response.status, 404);
      assert.equal((await run.assignmentRef.get()).data().publicationState, "draft");
    }
  });
});

test("production assessment start route rejects student membership revoked before commit", { skip: !emulatorConfigured }, async () => {
  const run = await setupRun();
  await raceAndAssert({
    run, handler: handleAssessments, path: `/assessments/${run.assessmentId}/start`,
    request: new Request(`https://local.test/api/assessments/${run.assessmentId}/start`, { method: "POST" }),
    user: { uid: run.studentUid, role: "student" },
    revoke: () => run.studentMembership.update({ active: false }),
    assertState: async (response) => {
      assert.equal(response.status, 404);
      const attempts = await run.db.collection("assessmentAttempts").where("assessmentId", "==", run.assessmentId).get();
      assert.equal(attempts.size, 0);
    }
  });
});
