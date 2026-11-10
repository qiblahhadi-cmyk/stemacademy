import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { txAuthorizeScope, classAccessDocumentId } from "../../netlify/functions/lib/authorization.mjs";

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.GCLOUD_PROJECT || "";
const emulatorConfigured = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) &&
  Boolean(process.env.FIRESTORE_EMULATOR_HOST) && projectId.startsWith("demo-");

async function raceRevocation({ collection, refId, patch, userRole = "teacher", includeSubject = true }) {
  const { getDb } = await import("../../netlify/functions/lib/firebase-admin.mjs");
  const db = getDb();
  const suffix = randomUUID();
  const classId = `race-class-${suffix}`;
  const subjectId = `race-subject-${suffix}`;
  const uid = `race-user-${suffix}`;
  const teacher = { uid, role: userRole };
  const classRef = db.collection("classes").doc(classId);
  const subjectRef = db.collection("subjects").doc(subjectId);
  const membershipRef = db.collection("classAccess").doc(classAccessDocumentId(classId, uid, userRole));
  const assignmentRef = db.collection("teachingAssignments").doc(`race-assignment-${suffix}`);
  const protectedRef = db.collection("_authorizationRaceWrites").doc(suffix);
  const targetRefs = {
    classes: classRef,
    subjects: subjectRef,
    classAccess: membershipRef,
    teachingAssignments: assignmentRef
  };
  const target = targetRefs[collection];
  let release;
  let entered;
  const gate = new Promise((resolve) => { release = resolve; });
  const firstRead = new Promise((resolve) => { entered = resolve; });
  let firstAttempt = true;

  try {
    await classRef.set({ grade: 9, active: true, synthetic: true });
    if (includeSubject) await subjectRef.set({ grade: 9, active: true, synthetic: true });
    await membershipRef.set({ classId, userUid: uid, accessType: userRole, active: true, synthetic: true });
    if (userRole === "teacher") await assignmentRef.set({ teacherUid: uid, classId, subjectId, active: true, synthetic: true });

    const operation = db.runTransaction(async (tx) => {
      await txAuthorizeScope(tx, db, teacher, classId, includeSubject ? subjectId : null);
      if (firstAttempt) {
        firstAttempt = false;
        entered();
        await gate;
      }
      tx.set(protectedRef, { shouldNotExist: true, synthetic: true });
    });

    await firstRead;
    await target.update(patch);
    release();
    await assert.rejects(operation, /FORBIDDEN|NOT_FOUND|aborted/i);
    assert.equal((await protectedRef.get()).exists, false, "revoked authorization must prevent the protected write");
  } finally {
    release?.();
    await Promise.all([classRef, subjectRef, membershipRef, assignmentRef, protectedRef].map((ref) => ref.delete().catch(() => {})));
  }
}

test("real Firestore transaction retries after teaching-assignment revocation", { skip: !emulatorConfigured }, async () => {
  await raceRevocation({ collection: "teachingAssignments", patch: { active: false } });
});

test("real Firestore transaction retries after teacher membership revocation", { skip: !emulatorConfigured }, async () => {
  await raceRevocation({ collection: "classAccess", patch: { active: false } });
});

test("real Firestore transaction retries after class deactivation", { skip: !emulatorConfigured }, async () => {
  await raceRevocation({ collection: "classes", patch: { active: false } });
});

test("real Firestore transaction retries after subject deactivation", { skip: !emulatorConfigured }, async () => {
  await raceRevocation({ collection: "subjects", patch: { active: false } });
});

test("real Firestore transaction retries after student membership revocation", { skip: !emulatorConfigured }, async () => {
  await raceRevocation({ collection: "classAccess", patch: { active: false }, userRole: "student", includeSubject: false });
});
