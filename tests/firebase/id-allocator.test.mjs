import test from "node:test";
import assert from "node:assert/strict";

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const projectId =
  process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.GCLOUD_PROJECT || "";

const emulatorConfigured =
  Boolean(authHost) &&
  Boolean(firestoreHost) &&
  projectId.startsWith("demo-");

test("transaction-safe student and staff ID allocation", {
  skip: !emulatorConfigured
}, async (t) => {
  const { getDb } = await import("../../netlify/functions/lib/firebase-admin.mjs");
  const { allocateStudentId, allocateStaffId } =
    await import("../../netlify/functions/lib/id-allocator.mjs");
  const db = getDb();

  await t.test("student IDs use the Asia/Karachi issuance year", async () => {
    // 18:30 UTC on 31 December is already 00:30 on 1 January in Pakistan.
    const issuedAt = new Date("2026-12-31T19:30:00.000Z");
    const id = await allocateStudentId(db, issuedAt);

    assert.match(id, /^SA-2027-\d{3,}$/);
  });

  await t.test("concurrent student allocations are unique and sequential", async () => {
    const issuedAt = new Date("2098-06-15T12:00:00.000Z");
    const ids = await Promise.all(
      Array.from({ length: 12 }, () => allocateStudentId(db, issuedAt))
    );

    assert.equal(new Set(ids).size, 12);
    assert.ok(ids.every(id => /^SA-2098-\d{3,}$/.test(id)));

    const sequences = ids
      .map(id => Number(id.split("-").at(-1)))
      .sort((a, b) => a - b);

    assert.deepEqual(
      sequences,
      Array.from({ length: 12 }, (_, index) => sequences[0] + index)
    );
  });

  await t.test("administrator and teacher IDs use separate permanent sequences", async () => {
    const [adminOne, adminTwo, teacherOne, teacherTwo] = await Promise.all([
      allocateStaffId(db, "admin"),
      allocateStaffId(db, "admin"),
      allocateStaffId(db, "teacher"),
      allocateStaffId(db, "teacher")
    ]);

    assert.match(adminOne, /^SA-ADM-\d{3,}$/);
    assert.match(adminTwo, /^SA-ADM-\d{3,}$/);
    assert.match(teacherOne, /^SA-TCH-\d{3,}$/);
    assert.match(teacherTwo, /^SA-TCH-\d{3,}$/);
    assert.notEqual(adminOne, adminTwo);
    assert.notEqual(teacherOne, teacherTwo);
    assert.notEqual(adminOne, teacherOne);
  });

  await t.test("unsupported staff roles are rejected without allocating an ID", async () => {
    await assert.rejects(
      allocateStaffId(db, "student"),
      { name: "TypeError", message: "Staff role must be admin or teacher." }
    );
  });
});
