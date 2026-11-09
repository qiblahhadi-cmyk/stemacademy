const form = document.getElementById("profileForm");
const nameInput = document.getElementById("displayName");
const displayName = document.getElementById("profileDisplayName");
const feedback = document.getElementById("profileFeedback");
const initialName = "Academy Admin";
form.addEventListener("submit", event => {
  event.preventDefault();
  const nextName = nameInput.value.trim();
  if (!nextName) {
    feedback.textContent = "Please enter a display name.";
    nameInput.focus();
    return;
  }
  displayName.textContent = nextName;
  feedback.textContent = "Preview updated in this page only. No account data was saved.";
});
document.getElementById("resetProfile").addEventListener("click", () => {
  nameInput.value = initialName;
  displayName.textContent = initialName;
  feedback.textContent = "Sample profile restored.";
});
const securityDialog = document.getElementById("securityDialog");
document.getElementById("passwordInfo").addEventListener("click", () => securityDialog.showModal());
document.getElementById("closeSecurity").addEventListener("click", () => securityDialog.close());
document.getElementById("doneSecurity").addEventListener("click", () => securityDialog.close());
document.getElementById("menuButton")?.addEventListener("click", () => document.getElementById("sidebar")?.classList.toggle("open"));