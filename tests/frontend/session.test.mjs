import test from "node:test";
import assert from "node:assert/strict";
import { createSession, describeAuthError, SESSION_MESSAGES, SessionError } from "../../src/client/session.js";

function fakeAuth({ user = { getIdToken: async (force) => (force ? "fresh-token" : "cached-token") } } = {}) {
  const calls = { signOut: 0, signIn: [] };
  return {
    calls,
    auth: {
      currentUser: () => user,
      signIn: async (email, password) => { calls.signIn.push([email, password]); return { user }; },
      signOut: async () => { calls.signOut += 1; }
    }
  };
}

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" }
});

test("credential failures map to one generic message, whatever the Firebase code", () => {
  for (const code of ["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password", "auth/invalid-email"]) {
    assert.equal(describeAuthError(code), SESSION_MESSAGES.invalidCredentials);
  }
  assert.equal(describeAuthError("auth/too-many-requests"), SESSION_MESSAGES.tooManyAttempts);
  assert.equal(describeAuthError("auth/something-new"), SESSION_MESSAGES.generic);
});

test("signIn failure never exposes the raw Firebase code or message", async () => {
  const { auth } = fakeAuth();
  auth.signIn = async () => { throw Object.assign(new Error("raw firebase text"), { code: "auth/wrong-password" }); };
  const session = createSession({ auth, fetchImpl: async () => json(200, {}) });
  await assert.rejects(session.signIn("sa-2026-001@stemacademy.edu.pk", "x"), (error) => {
    assert.ok(error instanceof SessionError);
    assert.equal(error.message, SESSION_MESSAGES.invalidCredentials);
    assert.doesNotMatch(error.message, /raw firebase|auth\//);
    return true;
  });
});

test("apiFetch sends the current ID token as a bearer header", async () => {
  const { auth } = fakeAuth();
  let seen;
  const session = createSession({ auth, fetchImpl: async (url, init) => { seen = { url, init }; return json(200, { success: true }); } });
  await session.apiFetch("/me");
  assert.equal(seen.url, "/api/me");
  assert.equal(seen.init.headers.Authorization, "Bearer cached-token");
  assert.equal(seen.init.body, undefined);
});

test("JSON bodies are serialized with a JSON content type", async () => {
  const { auth } = fakeAuth();
  let seen;
  const session = createSession({ auth, fetchImpl: async (url, init) => { seen = init; return json(201, { success: true }); } });
  await session.apiFetch("/assignments", { method: "POST", body: { title: "Waves" } });
  assert.equal(seen.method, "POST");
  assert.equal(seen.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(seen.body), { title: "Waves" });
});

test("a 401 triggers one forced token refresh and a successful retry", async () => {
  const tokens = [];
  const user = { getIdToken: async (force) => { tokens.push(force); return force ? "fresh" : "stale"; } };
  const { auth, calls } = fakeAuth({ user });
  const responses = [json(401, { error: { code: "UNAUTHENTICATED" } }), json(200, { success: true, data: { role: "teacher" } })];
  const session = createSession({ auth, fetchImpl: async () => responses.shift() });

  const body = await session.apiFetch("/me");
  assert.equal(body.data.role, "teacher");
  assert.deepEqual(tokens, [false, true]);
  assert.equal(calls.signOut, 0);
});

test("a 401 that survives a refresh ends the session once and reports it", async () => {
  const { auth, calls } = fakeAuth();
  let ended = 0;
  const session = createSession({
    auth,
    fetchImpl: async () => json(401, { error: { code: "UNAUTHENTICATED" } }),
    onSessionEnded: () => { ended += 1; }
  });
  await assert.rejects(session.apiFetch("/me"), (error) => {
    assert.equal(error.code, "session-expired");
    assert.equal(error.message, SESSION_MESSAGES.sessionEnded);
    return true;
  });
  assert.equal(calls.signOut, 1);
  assert.equal(ended, 1);
});

test("a 403 is reported without ending the session", async () => {
  const { auth, calls } = fakeAuth();
  const session = createSession({ auth, fetchImpl: async () => json(403, { error: { code: "FORBIDDEN", message: "Access denied." } }) });
  await assert.rejects(session.apiFetch("/assignments"), (error) => {
    assert.equal(error.message, SESSION_MESSAGES.forbidden);
    return true;
  });
  assert.equal(calls.signOut, 0);
});

test("server messages pass through for client errors; 5xx stays generic", async () => {
  const { auth } = fakeAuth();
  const invalid = createSession({ auth, fetchImpl: async () => json(400, { error: { code: "INVALID_INPUT", message: "Title must contain 2 to 160 characters." } }) });
  await assert.rejects(invalid.apiFetch("/assignments", { method: "POST", body: {} }), (e) => e.message === "Title must contain 2 to 160 characters.");

  const broken = createSession({ auth, fetchImpl: async () => new Response("<html>stack trace</html>", { status: 500 }) });
  await assert.rejects(broken.apiFetch("/me"), (e) => {
    assert.equal(e.message, SESSION_MESSAGES.generic);
    assert.doesNotMatch(e.message, /stack|html/i);
    return true;
  });
});

test("network failure is reported as a network problem and does not end the session", async () => {
  const { auth, calls } = fakeAuth();
  const session = createSession({ auth, fetchImpl: async () => { throw new TypeError("fetch failed"); } });
  await assert.rejects(session.apiFetch("/me"), (e) => {
    assert.equal(e.message, SESSION_MESSAGES.network);
    return true;
  });
  assert.equal(calls.signOut, 0);
});

test("no signed-in user means no request is made", async () => {
  const { auth } = fakeAuth({ user: null });
  let requests = 0;
  const session = createSession({ auth, fetchImpl: async () => { requests += 1; return json(200, {}); } });
  await assert.rejects(session.apiFetch("/me"), (e) => e.code === "unauthenticated");
  assert.equal(requests, 0);
});

test("fetchMe returns the server's role and never a client-supplied one", async () => {
  const { auth } = fakeAuth();
  const session = createSession({ auth, fetchImpl: async () => json(200, { success: true, data: { uid: "u1", role: "student", displayName: "A" } }) });
  const me = await session.fetchMe();
  assert.equal(me.role, "student");
});

test("the auth adapter is required", () => {
  assert.throws(() => createSession({}), TypeError);
});
