/*
 * Profile: shows the signed-in account from /api/me and lets the user change
 * only their display name, through PATCH /api/me. The server enforces the
 * allowlist; this script sends only displayName.
 */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const ROLE_LABELS = { admin: "Administrator", teacher: "Teacher", student: "Student" };
  let saved = "";

  function initials(name) {
    const letters = name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("");
    return letters.slice(0, 2).toUpperCase() || "—";
  }

  function showName(name) {
    $("profileDisplayName").textContent = name || "Academy account";
    $("profileAvatar").textContent = initials(name || "");
    const avatar = document.querySelector(".avatar");
    if (avatar) avatar.textContent = initials(name || "");
  }

  function setFeedback(message) {
    $("profileFeedback").textContent = message;
  }

  function syncButtons() {
    const value = $("displayName").value.trim();
    const dirty = value !== saved;
    $("profileForm").querySelector('button[type="submit"]').disabled = !dirty || value.length < 2;
    $("resetProfile").disabled = !dirty;
  }

  async function save(event) {
    event.preventDefault();
    const value = $("displayName").value.trim();
    setFeedback("Saving…");
    try {
      const { data } = await window.StemSession.apiFetch("/me", { method: "PATCH", body: { displayName: value } });
      saved = data.displayName;
      $("displayName").value = saved;
      showName(saved);
      setFeedback("Display name saved.");
    } catch (error) {
      setFeedback(error.message || "Your display name could not be saved.");
    }
    syncButtons();
  }

  async function init() {
    let me;
    try {
      me = await window.StemSession.ready;
    } catch {
      return;
    }

    saved = me.displayName || "";
    showName(saved);
    $("displayName").value = saved;
    $("profileRole").value = ROLE_LABELS[me.role] ?? "Signed in";
    $("profileAcademy").value = "STEM Academy";
    $("profileSummary").textContent = `${ROLE_LABELS[me.role] ?? "Signed in"} · STEM Academy`;

    $("displayName").addEventListener("input", syncButtons);
    $("profileForm").addEventListener("submit", save);
    $("resetProfile").addEventListener("click", () => {
      $("displayName").value = saved;
      setFeedback("");
      syncButtons();
    });
    $("passwordInfo").addEventListener("click", () => $("securityDialog").showModal());
    $("closeSecurity").addEventListener("click", () => $("securityDialog").close());
    $("doneSecurity").addEventListener("click", () => $("securityDialog").close());
    syncButtons();
  }

  init();
})();
