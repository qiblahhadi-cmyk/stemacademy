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
  const email = `api-auth-${randomUUID()}@example.test`;
  const password = "Synthetic-Test-Password-123";
  const endpoint =
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true
    })
  });

  const payload = await response.json();

  if (!response.ok || !payload.localId || !payload.idToken) {
    throw new Error(
      `Could not create synthetic Auth emulator identity: ${JSON.stringify(payload.error || payload)}`
    );
  }

  return {
    uid: payload.localId,
    idToken: payload.idToken
  };
}

async function callMe(idToken) {
  const request = new Request("http://localhost/api/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${idToken}` }
  });

  const { default: handler } = await import("../../netlify/functions/api.mjs");
  return handler(request, {});
}

test("API authentication enforces trusted Firestore account records", {
  skip: !emulatorConfigured
}, async (t) => {
  const { getAdminAuth, getDb } = await import("../../netlify/functions/lib/firebase-admin.mjs");
  const auth = getAdminAuth();
  const db = getDb();

  await t.test("active account receives its trusted database role", async () => {
    const identity = await createSyntheticIdentity();
    const userRef = db.collection("users").doc(identity.uid);

    try {
      await userRef.set({
        role: "student",
        active: true,
        displayName: "Synthetic Student"
      });

      const response = await callMe(identity.idToken);
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.success, true);
      assert.equal(payload.data.uid, identity.uid);
      assert.equal(payload.data.role, "student");
      assert.equal(payload.data.displayName, "Synthetic Student");
      assert.equal(response.headers.get("Cache-Control"), "no-store");
    } finally {
      await userRef.delete().catch(() => {});
      await auth.deleteUser(identity.uid).catch(() => {});
    }
  });

  await t.test("authenticated account without a trusted user record is denied", async () => {
    const identity = await createSyntheticIdentity();

    try {
      const response = await callMe(identity.idToken);
      const payload = await response.json();

      assert.equal(response.status, 403);
      assert.equal(payload.error.code, "ACCOUNT_NOT_CONFIGURED");
    } finally {
      await auth.deleteUser(identity.uid).catch(() => {});
    }
  });

  await t.test("inactive account is denied", async () => {
    const identity = await createSyntheticIdentity();
    const userRef = db.collection("users").doc(identity.uid);

    try {
      await userRef.set({
        role: "teacher",
        active: false,
        displayName: "Synthetic Inactive Teacher"
      });

      const response = await callMe(identity.idToken);
      const payload = await response.json();

      assert.equal(response.status, 403);
      assert.equal(payload.error.code, "ACCOUNT_DISABLED");
    } finally {
      await userRef.delete().catch(() => {});
      await auth.deleteUser(identity.uid).catch(() => {});
    }
  });

  await t.test("unknown database role is denied", async () => {
    const identity = await createSyntheticIdentity();
    const userRef = db.collection("users").doc(identity.uid);

    try {
      await userRef.set({
        role: "superuser",
        active: true,
        displayName: "Synthetic Invalid Role"
      });

      const response = await callMe(identity.idToken);
      const payload = await response.json();

      assert.equal(response.status, 403);
      assert.equal(payload.error.code, "INVALID_ROLE");
    } finally {
      await userRef.delete().catch(() => {});
      await auth.deleteUser(identity.uid).catch(() => {});
    }
  });

  await t.test("invalid bearer token is denied", async () => {
    const response = await callMe("not-a-valid-firebase-token");
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error.code, "UNAUTHENTICATED");
  });
});
