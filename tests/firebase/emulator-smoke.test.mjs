import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const emulatorConfigured =
  Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) &&
  Boolean(process.env.FIRESTORE_EMULATOR_HOST) &&
  Boolean(
    (process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.GCLOUD_PROJECT || "")
      .startsWith("demo-")
  );

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
