import test from "node:test";
import assert from "node:assert/strict";
import { academyIdToAuthEmail } from "../../public/assets/js/login-alias.mjs";

test("converts student academy IDs", () => {
  assert.equal(
    academyIdToAuthEmail("SA-2026-001"),
    "sa-2026-001@stemacademy.edu.pk"
  );
});

test("converts teacher academy IDs", () => {
  assert.equal(
    academyIdToAuthEmail("SA-TCH-001"),
    "sa-tch-001@stemacademy.edu.pk"
  );
});

test("converts administrator academy IDs", () => {
  assert.equal(
    academyIdToAuthEmail("SA-ADM-001"),
    "sa-adm-001@stemacademy.edu.pk"
  );
});

test("normalizes lowercase input and surrounding whitespace", () => {
  assert.equal(
    academyIdToAuthEmail("  sa-tch-001  "),
    "sa-tch-001@stemacademy.edu.pk"
  );
});

test("rejects invalid academy IDs", () => {
  const invalidIds = [
    "",
    " ",
    "SA-2026",
    "SA-26-001",
    "SA-STU-001",
    "SA-XYZ-001",
    "SA-TCH",
    "SA-ADM",
    "SA-2026-001-extra",
    "SA-2026-001@stemacademy.edu.pk",
    null,
    undefined,
    123
  ];

  for (const id of invalidIds) {
    assert.throws(() => academyIdToAuthEmail(id), TypeError);
  }
});
