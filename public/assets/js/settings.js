const tabs = [...document.querySelectorAll("[data-settings-tab]")];
const panels = [...document.querySelectorAll("[data-settings-panel]")];
function showPanel(name) {
  tabs.forEach(tab => {
    const selected = tab.dataset.settingsTab === name;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  panels.forEach(panel => {
    const selected = panel.dataset.settingsPanel === name;
    panel.hidden = !selected;
    panel.classList.toggle("active", selected);
  });
}
tabs.forEach(tab => tab.addEventListener("click", () => showPanel(tab.dataset.settingsTab)));
document.getElementById("academyForm").addEventListener("submit", event => {
  event.preventDefault();
  const name = document.getElementById("academyName").value.trim();
  document.getElementById("academyFeedback").textContent = name
    ? "Preview only: this academy name has not been saved."
    : "Please enter an academy name.";
});
document.getElementById("menuButton")?.addEventListener("click", () => document.getElementById("sidebar")?.classList.toggle("open"));
showPanel("academy");