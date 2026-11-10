(() => {
  "use strict";
  const form = document.getElementById("passwordForm");
  const feedback = document.getElementById("passwordFeedback");
  const password = document.getElementById("newPassword");
  const confirm = document.getElementById("confirmPassword");
  async function init() {
    try {
      const me = await window.StemSession.ready;
      if (!me.mustChangePassword) window.location.replace("/");
    } catch { return; }
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); feedback.textContent = "";
      if (password.value.length < 12 || password.value.length > 128) { feedback.textContent = "Use a password containing 12 to 128 characters."; return; }
      if (password.value !== confirm.value) { feedback.textContent = "The passwords do not match."; return; }
      const newPassword = password.value;
      password.value = ""; confirm.value = "";
      try {
        await window.StemSession.apiFetch("/auth/complete-password-change", { method: "POST", body: { password: newPassword } });
        await window.StemSession.refreshToken();
        window.location.replace("/");
      } catch (error) {
        feedback.textContent = error.message;
        password.focus();
      }
    });
  }
  init();
})();
