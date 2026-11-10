import test from "node:test";
import assert from "node:assert/strict";
import { quoteWindowsArg } from "../../scripts/shell-quote.mjs";

test("plain arguments are left unchanged", () => {
  for (const value of ["emulators:exec", "--project", "demo-stem-academy", "firebase-tools@15.35.0", "--yes"]) {
    assert.equal(quoteWindowsArg(value), value);
  }
});

test("arguments with whitespace stay a single argument", () => {
  assert.equal(quoteWindowsArg("npm test"), '"npm test"');
  assert.equal(quoteWindowsArg("node --test tests/firebase/production-route-races-emulator.test.mjs"),
    '"node --test tests/firebase/production-route-races-emulator.test.mjs"');
});

test("batch/cmd metacharacters are quoted and inner quotes and trailing backslashes are escaped", () => {
  assert.equal(quoteWindowsArg("auth,firestore"), '"auth,firestore"');
  assert.equal(quoteWindowsArg('say "hi"'), '"say \\"hi\\""');
  assert.equal(quoteWindowsArg("C:\\path with space\\"), '"C:\\path with space\\\\"');
  assert.equal(quoteWindowsArg(""), '""');
});
