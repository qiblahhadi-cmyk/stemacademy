const initialActivities = [
  { id: 1, category: "Assignments", actor: "Physics Teacher", action: "Created an assignment", detail: "Grade 9 · Motion and Force practice", time: "2026-11-08T09:20:00+05:00" },
  { id: 2, category: "Attendance", actor: "Physics Teacher", action: "Updated classroom attendance", detail: "Grade 10 · Daily register example", time: "2026-11-08T08:55:00+05:00" },
  { id: 3, category: "Communication", actor: "Academy Admin", action: "Published an academy notice", detail: "Reminder about the weekly class schedule", time: "2026-11-07T15:10:00+05:00" },
  { id: 4, category: "Assessments", actor: "Physics Teacher", action: "Added an assessment", detail: "Grade 9 · Chapter test example", time: "2026-11-07T12:30:00+05:00" },
  { id: 5, category: "Classes", actor: "Academy Admin", action: "Updated class information", detail: "Grade 10 Physics · Example class record", time: "2026-11-06T11:45:00+05:00" },
  { id: 6, category: "Account", actor: "Academy Admin", action: "Reviewed account settings", detail: "Profile and academy preferences preview", time: "2026-11-05T10:00:00+05:00" }
];
let activities = [...initialActivities];
const list = document.getElementById("activityList");
const search = document.getElementById("activitySearch");
const category = document.getElementById("categoryFilter");
const actor = document.getElementById("actorFilter");
const count = document.getElementById("activityCount");
const empty = document.getElementById("emptyActivity");
const summary = document.getElementById("activitySummary");

function formatDate(value) {
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function render() {
  const query = search.value.trim().toLowerCase();
  const filtered = activities.filter(item => {
    const matchesText = [item.category, item.actor, item.action, item.detail].join(" ").toLowerCase().includes(query);
    return matchesText && (category.value === "all" || item.category === category.value) && (actor.value === "all" || item.actor === actor.value);
  }).sort((a, b) => new Date(b.time) - new Date(a.time));
  count.textContent = `${filtered.length} activit${filtered.length === 1 ? "y" : "ies"}`;
  summary.innerHTML = ["Classes", "Assignments", "Assessments", "Attendance", "Communication", "Account"].map(name => {
    const total = activities.filter(item => item.category === name).length;
    return `<div class="activity-stat"><strong>${total}</strong><span>${name}</span></div>`;
  }).join("");
  list.innerHTML = filtered.map(item => `
    <article class="activity-entry">
      <span class="activity-dot" aria-hidden="true"></span>
      <div class="activity-entry-main">
        <div class="activity-entry-top"><span class="activity-category">${item.category}</span><time datetime="${item.time}">${formatDate(item.time)}</time></div>
        <h3>${item.action}</h3><p>${item.detail}</p><span class="activity-actor">${item.actor}</span>
      </div>
    </article>`).join("");
  empty.hidden = filtered.length !== 0;
}
[search, category, actor].forEach(control => control.addEventListener("input", render));
document.getElementById("resetActivity").addEventListener("click", () => {
  activities = [...initialActivities];
  search.value = "";
  category.value = "all";
  actor.value = "all";
  render();
});
document.getElementById("menuButton")?.addEventListener("click", () => document.getElementById("sidebar")?.classList.toggle("open"));
render();