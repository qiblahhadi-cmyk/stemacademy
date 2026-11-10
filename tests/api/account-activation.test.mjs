import test from "node:test";
import assert from "node:assert/strict";
import { authenticate } from "../../netlify/functions/lib/auth-middleware.mjs";
import { handleAccountActivation } from "../../netlify/functions/lib/routes/account-activation.mjs";
import { createFakeDb } from "../helpers/fake-firestore.mjs";

const tokenRequest = () => new Request("https://example.test/api/me", { headers: { Authorization: "Bearer synthetic-token" } });
function services(decoded, db) {
  return { adminAuth: { async verifyIdToken(token, checkRevoked) { assert.equal(token, "synthetic-token"); assert.equal(checkRevoked, true); return decoded; } }, db };
}

test("normal active account authenticates using trusted role and active profile", async () => {
  const db = createFakeDb({ users: { uid1: { role: "teacher", active: true, displayName: "Teacher" } } });
  const user = await authenticate(tokenRequest(), { ...services({ uid: "uid1" }, db) });
  assert.equal(user.role, "teacher");
  assert.equal(user.mustChangePassword, false);
});

test("owner-issued pending account is admitted only to the password-change bootstrap path", async () => {
  const db = createFakeDb({ users: { uid1: { role: "student", active: false, provisioningStatus: "credential_issued" } } });
  const injected = services({ uid: "uid1", mustChangePassword: true }, db);
  await assert.rejects(() => authenticate(tokenRequest(), injected), { message: "PASSWORD_CHANGE_REQUIRED" });
  const user = await authenticate(tokenRequest(), { ...injected, allowPendingActivation: true });
  assert.equal(user.active, false);
  assert.equal(user.mustChangePassword, true);
});

test("pending profile without the trusted must-change claim remains disabled", async () => {
  const db = createFakeDb({ users: { uid1: { role: "student", active: false, provisioningStatus: "credential_issued" } } });
  await assert.rejects(() => authenticate(tokenRequest(), { ...services({ uid: "uid1" }, db), allowPendingActivation: true }), { message: "ACCOUNT_DISABLED" });
});

test("first password change activates profile, clears claim and never returns the password", async () => {
  const db = createFakeDb({ users: { uid1: { role: "student", active: false, provisioningStatus: "credential_issued", academyId: "SA-2026-009" } } });
  const authCalls = [];
  const auth = {
    async updateUser(uid, input) { authCalls.push(["update", uid, input]); },
    async getUser() { return { customClaims: { mustChangePassword: true, unrelatedClaim: "preserved" } }; },
    async setCustomUserClaims(uid, claims) { authCalls.push(["claims", uid, claims]); }
  };
  const password = "Long-private-password-2026";
  const response = await handleAccountActivation(new Request("https://example.test/api/auth/complete-password-change", { method: "POST", body: JSON.stringify({ password }) }), {
    user: { uid: "uid1", role: "student", mustChangePassword: true }, db, auth, serverTimestamp: () => "SERVER_TS"
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(JSON.stringify(body).includes(password), false);
  assert.equal(db.store.get("users/uid1").active, true);
  assert.equal(db.store.get("users/uid1").provisioningStatus, "active");
  assert.equal(authCalls[0][2].password, password);
  assert.deepEqual(authCalls[1][2], { unrelatedClaim: "preserved" });
  const audit = [...db.store.entries()].find(([key]) => key.startsWith("auditLogs/"))[1];
  assert.equal(JSON.stringify(audit).includes(password), false);
});

test("password change rejects weak passwords and never calls Firebase Auth", async () => {
  const db = createFakeDb({ users: { uid1: { role: "teacher", active: false, provisioningStatus: "credential_issued" } } });
  let calls = 0;
  const response = await handleAccountActivation(new Request("https://example.test/api/auth/complete-password-change", { method: "POST", body: JSON.stringify({ password: "short" }) }), {
    user: { uid: "uid1", role: "teacher", mustChangePassword: true }, db,
    auth: { async updateUser() { calls += 1; } }, serverTimestamp: () => "SERVER_TS"
  });
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test("password change is unavailable to a caller without the owner-issued claim", async () => {
  const db = createFakeDb({ users: { uid1: { role: "student", active: true, provisioningStatus: "active" } } });
  const response = await handleAccountActivation(new Request("https://example.test/api/auth/complete-password-change", { method: "POST", body: JSON.stringify({ password: "Long-private-password-2026" }) }), {
    user: { uid: "uid1", role: "student", mustChangePassword: false }, db,
    auth: { async updateUser() { throw new Error("must not run"); } }, serverTimestamp: () => "SERVER_TS"
  });
  assert.equal(response.status, 403);
});

test("deactivated account cannot re-enter the initial-password bootstrap path", async () => {
  const db = createFakeDb({ users: { uid1: { role: "student", active: false, provisioningStatus: "active" } } });
  await assert.rejects(() => authenticate(tokenRequest(), {
    ...services({ uid: "uid1", mustChangePassword: true }, db), allowPendingActivation: true
  }), { message: "ACCOUNT_DISABLED" });
});

test("deactivated profile cannot be reactivated by retrying password completion", async () => {
  const db = createFakeDb({ users: { uid1: { role: "student", active: false, provisioningStatus: "active" } } });
  let authCalls = 0;
  const response = await handleAccountActivation(new Request("https://example.test/api/auth/complete-password-change", { method: "POST", body: JSON.stringify({ password: "Long-private-password-2026" }) }), {
    user: { uid: "uid1", role: "student", mustChangePassword: true }, db,
    auth: { async updateUser() { authCalls += 1; } }, serverTimestamp: () => "SERVER_TS"
  });
  assert.equal(response.status, 403);
  assert.equal(authCalls, 0);
});

test("an active profile with an uncleared must-change claim still cannot use normal API routes", async () => {
  const db = createFakeDb({ users: { uid1: { role: "teacher", active: true, provisioningStatus: "active" } } });
  await assert.rejects(() => authenticate(tokenRequest(), {
    ...services({ uid: "uid1", mustChangePassword: true }, db)
  }), { message: "PASSWORD_CHANGE_REQUIRED" });
  const bootstrap = await authenticate(tokenRequest(), {
    ...services({ uid: "uid1", mustChangePassword: true }, db), allowPendingActivation: true
  });
  assert.equal(bootstrap.mustChangePassword, true);
});

test("must-change claim with inconsistent profile state is denied even on bootstrap routes", async () => {
  const db = createFakeDb({ users: { uid1: { role: "student", active: true, provisioningStatus: "pending_activation" } } });
  await assert.rejects(() => authenticate(tokenRequest(), {
    ...services({ uid: "uid1", mustChangePassword: true }, db), allowPendingActivation: true
  }), { message: "ACCOUNT_DISABLED" });
});
