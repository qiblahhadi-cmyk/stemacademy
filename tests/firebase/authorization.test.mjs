import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rules = await readFile(
  new URL("../../firestore.rules", import.meta.url),
  "utf8"
);

test("browser Firestore access is denied by default", () => {
  assert.match(rules, /allow\s+read,\s*write:\s*if\s+false\s*;/);
});

test("Firestore rules do not grant client writes to academy collections", () => {
  // The current architecture intentionally routes all writes through the
  // authenticated Netlify API. A permissive client rule is a release blocker.
  assert.doesNotMatch(rules, /allow\s+(?:create|update|delete|write)\s*:/);
});
