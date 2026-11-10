import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { handleAdmin } from "../../netlify/functions/lib/routes/admin.mjs";
import { createFakeDb } from "../helpers/fake-firestore.mjs";

const ADMIN = { uid: "admin-1", role: "admin" };
const SEED = {
  users: {
    "admin-1": { role: "admin", active: true },
    "teacher-1": { role: "teacher", active: true, displayName: "Teacher One", academyId: "SA-TCH-001" },
    "student-1": { role: "student", active: true, displayName: "Student One", academyId: "SA-2026-001" }
  }
};
function fakeAuth() {
  const calls = [];
  return {
    calls,
    async createUser(input) { calls.push(["createUser", input]); return { uid: "new-uid" }; },
    async updateUser(uid, input) { calls.push(["updateUser", uid, input]); },
    async deleteUser(uid) { calls.push(["deleteUser", uid]); },
    async setCustomUserClaims(uid, claims) { calls.push(["setCustomUserClaims", uid, claims]); },
    async generatePasswordResetLink() { calls.push(["generatePasswordResetLink"]); return "https://reset.invalid/x"; }
  };
}
async function call(db, user, method, path, body, auth = fakeAuth()) {
  const init = { method };
  if (body !== undefined) init.body = JSON.stringify(body);
  const url = `https://example.test/api${path}`;
  const response = await handleAdmin(new Request(url, init), {
    path: new URL(url).pathname.replace(/^\/api/, ""), user, db, auth, serverTimestamp: () => "SERVER_TS",
    allocateStudentId: async () => "SA-2026-050", allocateStaffId: async () => "SA-TCH-050"
  });
  return { status: response.status, json: await response.json(), auth };
}

test("only administrators can provision accounts", async () => {
  const db = createFakeDb(SEED);
  for (const user of [{ uid: "teacher-1", role: "teacher" }, { uid: "student-1", role: "student" }]) {
    const result = await call(db, user, "POST", "/admin/accounts", { role: "student", displayName: "Someone" });
    assert.equal(result.status, 403);
    assert.equal(result.auth.calls.length, 0);
  }
});

test("provisioning rejects client-chosen credentials, identifiers and privileged roles", async () => {
  const db = createFakeDb(SEED);
  const attempts = [
    { role: "student", displayName: "Ok Name", password: "Passw0rd!Passw0rd!" },
    { role: "student", displayName: "Ok Name", uid: "chosen-uid" },
    { role: "student", displayName: "Ok Name", academyId: "SA-2026-001" },
    { role: "student", displayName: "Ok Name", mustChangePassword: false },
    { role: "admin", displayName: "Ok Name" }
  ];
  for (const body of attempts) {
    const result = await call(db, ADMIN, "POST", "/admin/accounts", body);
    assert.equal(result.status, 400, JSON.stringify(Object.keys(body)));
    assert.equal(result.auth.calls.length, 0);
  }
});

test("a provisioned account is disabled, passwordless and its response and audit entry hold no secret", async () => {
  const db = createFakeDb(SEED);
  const result = await call(db, ADMIN, "POST", "/admin/accounts", { role: "student", displayName: "New Student" });
  assert.equal(result.status, 201);
  assert.deepEqual(result.auth.calls.map((c) => c[0]), ["createUser"]);
  assert.equal(result.auth.calls[0][1].disabled, true);
  assert.equal("password" in result.auth.calls[0][1], false);
  assert.equal(db.store.get("users/new-uid").provisioningStatus, "pending_activation");
  assert.equal(db.store.get("users/new-uid").active, false);
  const serialized = JSON.stringify([result.json, [...db.store.entries()].filter(([key]) => key.startsWith("auditLogs/"))]);
  assert.doesNotMatch(serialized, /password|token|secret|resetLink|privateKey/i);
});

test("no administrator reset or recovery route exists", async () => {
  const db = createFakeDb(SEED);
  const paths = [
    "/admin/accounts/student-1/reset-password", "/admin/accounts/student-1/recover", "/admin/accounts/student-1",
    "/admin/students/student-1/reset-password", "/admin/students/student-1/recovery", "/admin/staff/teacher-1/reset-password",
    "/admin/password-reset", "/admin/accounts"
  ];
  for (const path of paths) {
    for (const method of ["GET", "POST", "PUT", "PATCH"]) {
      if (method === "POST" && path === "/admin/accounts") continue; // staging endpoint, tested above
      const result = await call(db, ADMIN, method, path, method === "GET" ? undefined : {});
      assert.ok([400, 404, 405].includes(result.status), `${method} ${path} -> ${result.status}`);
      assert.equal(result.auth.calls.filter((c) => c[0] !== "createUser").length, 0, `${method} ${path} touched Auth`);
    }
  }
});

test("account status changes are audited, preserve identifiers, and never issue credentials", async () => {
  const db = createFakeDb(SEED);
  const auth = fakeAuth();
  assert.equal((await call(db, ADMIN, "POST", "/admin/students/student-1/deactivate", undefined, auth)).status, 200);
  assert.equal((await call(db, ADMIN, "PATCH", "/admin/students/student-1", { active: true }, auth)).status, 200);
  assert.equal(db.store.get("users/student-1").academyId, "SA-2026-001");
  const actions = [...db.store.entries()].filter(([k]) => k.startsWith("auditLogs/")).map(([, v]) => v.action);
  assert.deepEqual(actions.sort(), ["students.deactivated", "students.updated"]);
  assert.deepEqual(auth.calls.map((c) => c[0]), ["updateUser", "updateUser"]);
  for (const [, , input] of auth.calls) assert.deepEqual(Object.keys(input), ["disabled"]);
});

test("route modules cannot generate reset links or issue forced-change credentials", () => {
  const dir = new URL("../../netlify/functions/lib/routes/", import.meta.url);
  for (const file of readdirSync(dir)) {
    const source = readFileSync(new URL(file, dir), "utf8");
    assert.doesNotMatch(source, /generatePasswordResetLink|generateEmailVerificationLink|createCustomToken/, file);
    if (file !== "account-activation.mjs") {
      assert.doesNotMatch(source, /password\s*:/i, `${file} must not set passwords`);
      assert.doesNotMatch(source, /mustChangePassword\s*:\s*true/, `${file} must not issue forced-change claims`);
    }
  }
});

test("the owner-controlled recovery procedure is documented and contains no secrets", () => {
  const doc = readFileSync(new URL("../../docs/ACCOUNT_RECOVERY_PROCEDURE.md", import.meta.url), "utf8");
  assert.match(doc, /in person/i);
  assert.match(doc, /no administrator password-reset or recovery endpoint/i);
  assert.doesNotMatch(doc, /(password|secret|token)\s*[:=]\s*["'`][^"'`\s]{6,}/i);
});
