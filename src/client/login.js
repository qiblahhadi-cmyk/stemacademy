import { createSession } from "./session.js";
import { createFirebaseAuthAdapter } from "./firebase-adapter.js";
import { academyIdToAuthEmail } from "../../public/assets/js/login-alias.mjs";
import { safeNextPath } from "./redirect.js";

const form = document.getElementById("loginForm");
const message = document.getElementById("loginMessage");
const submit = document.getElementById("loginSubmit");
const notice = document.getElementById("sessionNotice");

const params = new URLSearchParams(window.location.search);


const destination = () => safeNextPath(params.get("next"));

if (params.get("reason") === "expired" && notice) {
  notice.textContent = "Your session has ended. Please sign in again.";
}

const adapter = createFirebaseAuthAdapter();
const session = createSession({ auth: adapter });

function setBusy(busy) {
  submit.disabled = busy;
  submit.textContent = busy ? "Signing in…" : "Sign in";
}

// Already signed in: go straight to the dashboard.
adapter.onChange((user) => {
  if (user) window.location.replace(destination());
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  setBusy(true);

  const academyId = form.academyId.value;
  const password = form.password.value;

  try {
    const email = academyIdToAuthEmail(academyId);
    await session.signIn(email, password);
    window.location.replace(destination());
  } catch (error) {
    message.textContent = error instanceof TypeError
      ? "Enter a valid academy ID, such as SA-2026-001."
      : error.message;
  } finally {
    form.password.value = "";
    setBusy(false);
  }
});
