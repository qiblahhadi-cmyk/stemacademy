import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const firebaseConfig = JSON.parse(
  await readFile(new URL("../../firebase.json", import.meta.url), "utf8")
);
const firestoreRules = await readFile(
  new URL("../../firestore.rules", import.meta.url),
  "utf8"
);

test("Firebase emulator config includes only Auth and Firestore plus the local UI", () => {
  assert.deepEqual(Object.keys(firebaseConfig.emulators).sort(), [
    "auth",
    "firestore",
    "singleProjectMode",
    "ui",
  ]);
  assert.equal(firebaseConfig.emulators.auth.port, 9099);
  assert.equal(firebaseConfig.emulators.firestore.port, 8080);
  assert.equal(firebaseConfig.emulators.ui.port, 4000);
  assert.equal(firebaseConfig.emulators.singleProjectMode, true);
});

test("Firestore emulator loads the repository deny-all browser rules", () => {
  assert.equal(firebaseConfig.firestore.rules, "firestore.rules");
  assert.match(
    firestoreRules,
    /allow\s+read,\s*write:\s*if\s+false\s*;/
  );
});
