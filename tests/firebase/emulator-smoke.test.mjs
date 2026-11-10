import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const projectId =
  process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.GCLOUD_PROJECT || "";
const emulatorConfigured =
  Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) &&
  Boolean(process.env.FIRESTORE_EMULATOR_HOST) &&
  projectId.startsWith("demo-");

test("Firebase Admin connects to local Auth and Firestore emulators", {
  skip: !emulatorConfigured
}, async () => {
  const { getAdminAuth, getDb } = await import("../../netlify/functions/lib/firebase-admin.mjs");
  const auth = getAdminAuth();
  const db = getDb();
  const id = randomUUID();
  const email = `emulator-${id}@example.test`;
  const document = db.collection("_emulatorSmokeTests").doc(id);

  let createdUser;

  try {
    createdUser = await auth.createUser({
      email,
      password: "Synthetic-Test-Password-123",
      displayName: "Synthetic emulator test"
    });

    const payload = {
      uid: createdUser.uid,
      purpose: "local-emulator-smoke-test",
      createdAt: new Date().toISOString()
    };

    await document.set(payload);
    const snapshot = await document.get();

    assert.equal(snapshot.exists, true);
    assert.equal(snapshot.data().uid, createdUser.uid);
    assert.equal(snapshot.data().purpose, "local-emulator-smoke-test");
    assert.equal((await auth.getUser(createdUser.uid)).email, email);
  } finally {
    await document.delete().catch(() => {});
    if (createdUser) {
      await auth.deleteUser(createdUser.uid).catch(() => {});
    }
  }
});

test("Auth emulator supports synthetic password sign-in and Admin token verification", {
  skip: !emulatorConfigured
}, async () => {
  const email = `password-flow-${randomUUID()}@example.test`;
  const password = "Synthetic-Test-Password-123";
  const signUp = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }
  );
  const created = await signUp.json();
  assert.equal(signUp.ok, true, JSON.stringify(created.error || created));

  try {
    const signIn = await fetch(
      `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true })
      }
    );
    const signedIn = await signIn.json();
    assert.equal(signIn.ok, true, JSON.stringify(signedIn.error || signedIn));
    assert.equal(signedIn.localId, created.localId);

    const { getAdminAuth } = await import("../../netlify/functions/lib/firebase-admin.mjs");
    const decoded = await getAdminAuth().verifyIdToken(signedIn.idToken, true);
    assert.equal(decoded.uid, created.localId);
  } finally {
    const { getAdminAuth } = await import("../../netlify/functions/lib/firebase-admin.mjs");
    await getAdminAuth().deleteUser(created.localId).catch(() => {});
  }
});

test("Firestore emulator denies direct unauthenticated browser reads and writes", {
  skip: !emulatorConfigured
}, async () => {
  const { getDb } = await import("../../netlify/functions/lib/firebase-admin.mjs");
  const db = getDb();
  const id = randomUUID();
  const ref = db.collection("users").doc(`rules-${id}`);
  await ref.set({ role: "student", active: true, synthetic: true });

  const base = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/users/${ref.id}`;

  try {
    const readResponse = await fetch(base);
    assert.equal(readResponse.status, 403, "direct browser-style read must be denied by Firestore Rules");

    const writeResponse = await fetch(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { role: { stringValue: "admin" } } })
    });
    assert.equal(writeResponse.status, 403, "direct browser-style write must be denied by Firestore Rules");
  } finally {
    await ref.delete().catch(() => {});
  }
});
