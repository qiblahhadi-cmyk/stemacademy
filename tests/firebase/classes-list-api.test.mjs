import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const projectId =
  process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.GCLOUD_PROJECT || "";

const emulatorConfigured =
  Boolean(authHost) &&
  Boolean(firestoreHost) &&
  projectId.startsWith("demo-");

async function createSyntheticIdentity() {
  const email = `classes-list-${randomUUID()}@example.test`;
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password: "Synthetic-Test-Password-123",
        returnSecureToken: true
      })
    }
  );
  const payload = await response.json();

  if (!response.ok || !payload.localId || !payload.idToken) {
    throw new Error(`Could not create synthetic identity: ${JSON.stringify(payload.error || payload)}`);
  }

  return { uid: payload.localId, idToken: payload.idToken };
}

async function callClasses(idToken, method = "GET") {
  const request = new Request("http://localhost/api/classes", {
    method,
    headers: idToken ? { Authorization: `Bearer ${idToken}` } : {}
  });
  const { default: handler } = await import("../../netlify/functions/api.mjs");
  return handler(request, {});
}

test("classes list API returns only active classes within each role's scope", {
  skip: !emulatorConfigured
}, async (t) => {
  const { getAdminAuth, getDb } = await import("../../netlify/functions/lib/firebase-admin.mjs");
  const auth = getAdminAuth();
  const db = getDb();
  const suffix = randomUUID();
  const identities = [];
  const refs = [];

  const classIds = {
    assigned: `list-assigned-${suffix}`,
    other: `list-other-${suffix}`,
    inactive: `list-inactive-${suffix}`
  };

  try {
    const admin = await createSyntheticIdentity();
    const teacher = await createSyntheticIdentity();
    const student = await createSyntheticIdentity();
    identities.push(admin, teacher, student);

    for (const [identity, role] of [
      [admin, "admin"], [teacher, "teacher"], [student, "student"]
    ]) {
      const ref = db.collection("users").doc(identity.uid);
      refs.push(ref);
      await ref.set({ role, active: true, displayName: `Synthetic ${role}` });
    }

    for (const [key, id] of Object.entries(classIds)) {
      const ref = db.collection("classes").doc(id);
      refs.push(ref);
      await ref.set({
        name: `Synthetic ${key} class`,
        grade: 9,
        academicSessionId: "2099",
        active: key !== "inactive",
        internalNotes: "must-not-be-returned"
      });
    }

    const teacherAccess = db.collection("classAccess").doc(`list-teacher-${suffix}`);
    const studentAccess = db.collection("classAccess").doc(`list-student-${suffix}`);
    const teacherAssignment = db.collection("teachingAssignments").doc(`list-assignment-${suffix}`);
    refs.push(teacherAccess, studentAccess, teacherAssignment);

    await Promise.all([
      teacherAccess.set({
        userUid: teacher.uid,
        classId: classIds.assigned,
        accessType: "teacher",
        active: true
      }),
      studentAccess.set({
        userUid: student.uid,
        classId: classIds.assigned,
        accessType: "student",
        active: true
      }),
      teacherAssignment.set({
        teacherUid: teacher.uid,
        classId: classIds.assigned,
        subjectId: "synthetic-physics",
        active: true
      })
    ]);

    await t.test("administrator sees all active classes and no inactive classes", async () => {
      const response = await callClasses(admin.idToken);
      const payload = await response.json();
      const ids = payload.data.classes.map(item => item.id);

      assert.equal(response.status, 200);
      assert.ok(ids.includes(classIds.assigned));
      assert.ok(ids.includes(classIds.other));
      assert.ok(!ids.includes(classIds.inactive));
      assert.equal(JSON.stringify(payload).includes("must-not-be-returned"), false);
    });

    await t.test("teacher sees only classes with an active teaching assignment", async () => {
      const response = await callClasses(teacher.idToken);
      const payload = await response.json();
      const ids = payload.data.classes.map(item => item.id);

      assert.equal(response.status, 200);
      assert.deepEqual(ids, [classIds.assigned]);
    });

    await t.test("student sees only their active class", async () => {
      const response = await callClasses(student.idToken);
      const payload = await response.json();
      const ids = payload.data.classes.map(item => item.id);

      assert.equal(response.status, 200);
      assert.deepEqual(ids, [classIds.assigned]);
    });

    await t.test("classes list rejects missing authentication", async () => {
      const response = await callClasses(null);
      const payload = await response.json();

      assert.equal(response.status, 401);
      assert.equal(payload.error.code, "UNAUTHENTICATED");
    });

    await t.test("classes list rejects unsupported methods", async () => {
      const response = await callClasses(admin.idToken, "POST");
      const payload = await response.json();

      assert.equal(response.status, 405);
      assert.equal(payload.error.code, "METHOD_NOT_ALLOWED");
    });
  } finally {
    await Promise.all(refs.map(ref => ref.delete().catch(() => {})));
    await Promise.all(identities.map(identity =>
      auth.deleteUser(identity.uid).catch(() => {})
    ));
  }
});
