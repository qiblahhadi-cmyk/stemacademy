/*
 * Browser session core. Pure logic with an injected Firebase Auth adapter, so it
 * can be unit-tested without the Firebase SDK. The server remains authoritative:
 * this module never decides a role or grants access. It only attaches the current
 * Firebase ID token and reacts to the server's answers.
 */

export const SESSION_MESSAGES = Object.freeze({
  invalidCredentials: "Academy ID or password is incorrect.",
  tooManyAttempts: "Too many sign-in attempts. Please wait a few minutes and try again.",
  network: "Network problem. Check your connection and try again.",
  sessionEnded: "Your session has ended. Please sign in again.",
  forbidden: "You do not have access to this item.",
  notFound: "This item could not be found.",
  generic: "Something went wrong. Please try again."
});

// Every credential failure maps to the same message, so a caller cannot tell
// whether an academy ID exists.
const CREDENTIAL_CODES = new Set([
  "auth/invalid-credential",
  "auth/invalid-login-credentials",
  "auth/user-not-found",
  "auth/wrong-password",
  "auth/invalid-email",
  "auth/user-disabled"
]);

export function describeAuthError(code) {
  if (CREDENTIAL_CODES.has(code)) return SESSION_MESSAGES.invalidCredentials;
  if (code === "auth/too-many-requests") return SESSION_MESSAGES.tooManyAttempts;
  if (code === "auth/network-request-failed") return SESSION_MESSAGES.network;
  return SESSION_MESSAGES.generic;
}

export class SessionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SessionError";
    this.code = code;
  }
}

function mapApiStatus(status, serverMessage) {
  if (status === 401) return SESSION_MESSAGES.sessionEnded;
  if (status === 403) return SESSION_MESSAGES.forbidden;
  if (status === 404) return SESSION_MESSAGES.notFound;
  // Server messages are fixed, safe strings defined in errors.mjs.
  if (typeof serverMessage === "string" && serverMessage.length > 0 && status < 500) {
    return serverMessage;
  }
  return SESSION_MESSAGES.generic;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * @param {object} options
 * @param {{currentUser: () => any, signIn: (email: string, password: string) => Promise<any>,
 *          signOut: () => Promise<void>}} options.auth  Firebase Auth adapter.
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string} [options.apiBase]
 * @param {() => void} [options.onSessionEnded]  Called once when the session is invalid.
 */
export function createSession({ auth, fetchImpl = globalThis.fetch, apiBase = "/api", onSessionEnded }) {
  if (!auth || typeof auth.currentUser !== "function") {
    throw new TypeError("An auth adapter is required.");
  }

  async function getToken(forceRefresh) {
    const user = auth.currentUser();
    if (!user) return null;
    return user.getIdToken(forceRefresh);
  }

  async function signIn(email, password) {
    try {
      return await auth.signIn(email, password);
    } catch (error) {
      throw new SessionError(error?.code ?? "unknown", describeAuthError(error?.code));
    }
  }

  async function signOut() {
    await auth.signOut();
  }

  async function endSession() {
    await signOut();
    if (typeof onSessionEnded === "function") onSessionEnded();
  }

  async function send(path, options, forceRefresh) {
    let token;
    try {
      token = await getToken(forceRefresh);
    } catch {
      throw new SessionError("token-unavailable", SESSION_MESSAGES.network);
    }
    if (!token) {
      throw new SessionError("unauthenticated", SESSION_MESSAGES.sessionEnded);
    }

    const headers = { Authorization: `Bearer ${token}` };
    const init = { method: options.method ?? "GET", headers };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }

    try {
      return await fetchImpl(`${apiBase}${path}`, init);
    } catch {
      throw new SessionError("network", SESSION_MESSAGES.network);
    }
  }

  /**
   * Call the protected API. On 401 the token is refreshed once and the request
   * retried. If it still fails, the session is ended. A 403 never ends the session.
   */
  async function apiFetch(path, options = {}) {
    let response = await send(path, options, false);

    if (response.status === 401) {
      response = await send(path, options, true);
      if (response.status === 401) {
        await endSession();
        throw new SessionError("session-expired", SESSION_MESSAGES.sessionEnded);
      }
    }

    const data = await readJson(response);
    if (!response.ok) {
      const serverCode = data?.error?.code ?? `HTTP_${response.status}`;
      throw new SessionError(serverCode, mapApiStatus(response.status, data?.error?.message));
    }
    return data;
  }

  async function fetchMe() {
    const body = await apiFetch("/me");
    return body.data;
  }

  return { signIn, signOut, apiFetch, fetchMe, getToken };
}
