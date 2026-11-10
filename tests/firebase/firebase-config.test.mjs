import test from "node:test";
import assert from "node:assert/strict";
import { resolveFirebaseConfig } from "../../netlify/functions/lib/firebase-config.mjs";

const emulatorEnv = {
  FIREBASE_ADMIN_PROJECT_ID: "demo-stem-academy",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080"
};

test("resolves isolated Auth and Firestore emulator configuration", () => {
  assert.deepEqual(resolveFirebaseConfig(emulatorEnv), {
    mode: "emulator",
    projectId: "demo-stem-academy"
  });
});

test("rejects partial emulator configuration instead of falling back to live credentials", () => {
  assert.throws(
    () => resolveFirebaseConfig({
      ...emulatorEnv,
      FIRESTORE_EMULATOR_HOST: undefined,
      FIREBASE_ADMIN_CLIENT_EMAIL: "synthetic@example.test",
      FIREBASE_ADMIN_PRIVATE_KEY: "not-a-real-key"
    }),
    /Both Firebase Auth and Firestore emulator hosts must be configured/
  );
});

test("rejects emulator mode with a non-demo project ID", () => {
  assert.throws(
    () => resolveFirebaseConfig({
      ...emulatorEnv,
      FIREBASE_ADMIN_PROJECT_ID: "stem-academy-production"
    }),
    /requires a demo- project ID/
  );
});

test("requires complete service-account configuration outside emulator mode", () => {
  assert.throws(
    () => resolveFirebaseConfig({ FIREBASE_ADMIN_PROJECT_ID: "example-project" }),
    /Firebase server configuration missing/
  );
});

test("normalizes escaped private-key newlines for service-account mode", () => {
  const config = resolveFirebaseConfig({
    FIREBASE_ADMIN_PROJECT_ID: "example-project",
    FIREBASE_ADMIN_CLIENT_EMAIL: "synthetic@example.test",
    FIREBASE_ADMIN_PRIVATE_KEY: "line-one\\nline-two"
  });

  assert.equal(config.mode, "service-account");
  assert.equal(config.privateKey, "line-one\nline-two");
});

for (const [label, authHost, firestoreHost] of [
  ["remote hostnames", "auth.example.test:9099", "firestore.example.test:8080"],
  ["public IPv4 endpoints", "8.8.8.8:9099", "1.1.1.1:8080"],
  ["localhost aliases", "localhost:9099", "localhost:8080"],
  ["IPv6 endpoints", "[::1]:9099", "[::1]:8080"],
  ["malformed endpoint values", "https://127.0.0.1:9099", "127.0.0.1:8080/path"]
]) {
  test(`rejects ${label} in emulator configuration`, () => {
    assert.throws(() => resolveFirebaseConfig({
      ...emulatorEnv,
      FIREBASE_AUTH_EMULATOR_HOST: authHost,
      FIRESTORE_EMULATOR_HOST: firestoreHost
    }), /must be exactly/);
  });
}
