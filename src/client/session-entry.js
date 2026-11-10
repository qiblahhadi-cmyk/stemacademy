/*
 * Loaded by every protected page. It waits for Firebase to restore the session,
 * fetches the role from the server, applies role-based navigation, and blocks
 * pages the role may not open. This is a convenience layer: every protected API
 * call is still checked by the server.
 */
import { createSession } from "./session.js";
import { createFirebaseAuthAdapter } from "./firebase-adapter.js";
import { canViewPage, navTargetFor, pageKey, PAGE_POLICY } from "./nav-policy.js";

const ROLE_LABELS = { admin: "Administrator", teacher: "Teacher", student: "Student" };

function goTo(path) {
  window.location.replace(path);
}

function loginRedirect(reason) {
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  const suffix = reason ? `&reason=${encodeURIComponent(reason)}` : "";
  goTo(`/login.html?next=${next}${suffix}`);
}

function applyNavigation(me) {
  document.documentElement.dataset.role = me.role;

  for (const link of document.querySelectorAll('a[href$=".html"]')) {
    const original = pageKey(link.getAttribute("href"));
    const target = navTargetFor(me.role, original);
    if (target !== original) {
      link.setAttribute("href", `/${target}`);
    }
    if (PAGE_POLICY[target] && !canViewPage(me.role, target)) {
      link.hidden = true;
    }
  }

  const roleLabel = document.querySelector(".role-label");
  if (roleLabel) roleLabel.textContent = ROLE_LABELS[me.role] ?? "Signed in";

  const avatar = document.querySelector(".avatar");
  if (avatar && me.displayName) {
    avatar.textContent = me.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  }
}

const adapter = createFirebaseAuthAdapter();
const session = createSession({
  auth: adapter,
  onSessionEnded: () => loginRedirect("expired")
});

let resolveReady;
let rejectReady;
const ready = new Promise((resolve, reject) => {
  resolveReady = resolve;
  rejectReady = reject;
});
ready.catch(() => {}); // Pages that do not await `ready` must not log unhandled rejections.

async function signOut() {
  await session.signOut();
  goTo("/login.html");
}

window.StemSession = Object.freeze({
  ready,
  apiFetch: session.apiFetch,
  refreshToken: () => session.getToken(true),
  signOut
});

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-sign-out]")) {
    event.preventDefault();
    signOut();
  }
});

// The first callback reports the restored session state (signed in or not).
const stop = adapter.onChange(async (user) => {
  stop();

  if (!user) {
    rejectReady(new Error("signed-out"));
    loginRedirect();
    return;
  }

  try {
    const me = await session.fetchMe();
    const currentPage = pageKey(window.location.pathname);
    if (me.mustChangePassword && currentPage !== "activate-account.html") {
      goTo("/activate-account.html");
      return;
    }
    if (!me.mustChangePassword && currentPage === "activate-account.html") {
      goTo("/");
      return;
    }

    if (!canViewPage(me.role, currentPage)) {
      rejectReady(new Error("forbidden"));
      goTo("/forbidden.html");
      return;
    }

    applyNavigation(me);
    resolveReady(me);
  } catch (error) {
    // An expired session has already redirected through onSessionEnded.
    if (error.code !== "session-expired") {
      rejectReady(error);
      document.documentElement.dataset.authError = "true";
      const notice = document.querySelector("[data-auth-notice]");
      if (notice) notice.textContent = error.message;
    }
  }
});
