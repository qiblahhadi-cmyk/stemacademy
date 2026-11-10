import test from "node:test";
import assert from "node:assert/strict";
import { assertEmulatorEnv } from "../../scripts/emulator-guard.mjs";

const GOOD = {
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_ADMIN_PROJECT_ID: "demo-stem-academy"
};

test("accepts a complete local emulator setup and returns the demo project", () => {
  assert.equal(assertEmulatorEnv(GOOD), "demo-stem-academy");
});

test("refuses without both emulator hosts", () => {
  assert.throws(() => assertEmulatorEnv({ ...GOOD, FIRESTORE_EMULATOR_HOST: "" }), /Set FIREBASE_AUTH_EMULATOR_HOST/);
  assert.throws(() => assertEmulatorEnv({ ...GOOD, FIREBASE_AUTH_EMULATOR_HOST: undefined }), /Set FIREBASE_AUTH_EMULATOR_HOST/);
});

test("refuses any project that is not a demo- project", () => {
  assert.throws(() => assertEmulatorEnv({ ...GOOD, FIREBASE_ADMIN_PROJECT_ID: "stem-academy-live" }), /demo-/);
  assert.throws(() => assertEmulatorEnv({ ...GOOD, FIREBASE_ADMIN_PROJECT_ID: undefined }), /demo-/);
});

test("refuses inside a Netlify build even with a valid emulator setup", () => {
  assert.throws(() => assertEmulatorEnv({ ...GOOD, NETLIFY: "true" }), /Netlify/);
});

for (const [label, authHost, firestoreHost] of [
  ["remote hostnames", "firebase.example.com:9099", "firestore.example.com:8080"],
  ["public IPv4 addresses", "8.8.8.8:9099", "1.1.1.1:8080"],
  ["localhost aliases", "localhost:9099", "localhost:8080"],
  ["IPv6 loopback aliases", "[::1]:9099", "[::1]:8080"],
  ["non-loopback IPv6 addresses", "[2001:4860:4860::8888]:9099", "[2001:4860:4860::8844]:8080"],
  ["malformed host values", "http://127.0.0.1:9099", "127.0.0.1:8080/path"]
]) {
  test(`refuses ${label}`, () => {
    assert.throws(() => assertEmulatorEnv({
      ...GOOD,
      FIREBASE_AUTH_EMULATOR_HOST: authHost,
      FIRESTORE_EMULATOR_HOST: firestoreHost
    }), /must be exactly/);
  });
}
