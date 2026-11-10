import test from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "../../src/client/redirect.js";

test("same-origin absolute paths are kept", () => {
  assert.equal(safeNextPath("/assignments.html?x=1"), "/assignments.html?x=1");
  assert.equal(safeNextPath("/index.html"), "/index.html");
});

test("external and protocol-relative targets fall back to the dashboard", () => {
  for (const value of ["https://evil.example", "//evil.example", "javascript:alert(1)", "/\\evil.example", "relative.html"]) {
    assert.equal(safeNextPath(value), "/index.html", `accepted ${value}`);
  }
});

test("missing, non-string and control-character values fall back", () => {
  assert.equal(safeNextPath(null), "/index.html");
  assert.equal(safeNextPath(undefined), "/index.html");
  assert.equal(safeNextPath(["/a"]), "/index.html");
  assert.equal(safeNextPath("/a\nb"), "/index.html");
});
