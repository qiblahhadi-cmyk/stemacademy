const previews = {
  admin: {
    title: "Administrator workspace",
    description: "A central overview for managing the academy and its learning operations.",
    listTitle: "Administrator tools",
    cards: [["Academy users","—","Manage approved student and staff accounts"],["Classes","—","Organise grade-based class groups"],["System activity","—","Review important administrative events"],["Academic setup","AJK","Maintain curriculum and calendar settings"]],
    items: ["Create and manage teacher and student accounts","Set up grades, classes and class memberships","Maintain subjects, chapters and topics","Review attendance, assessments and released results","Manage notices, settings and activity logs"]
  },
  teacher: {
    title: "Teacher workspace",
    description: "A focused daily workspace for classroom teaching and student progress.",
    listTitle: "Teacher tools",
    cards: [["My classes","—","Only assigned classes"],["Assignments","—","Prepare and review classroom work"],["Attendance","—","Record classroom attendance"],["Assessments","—","Record marks and feedback"]],
    items: ["View assigned classes and enrolled students","Organise Physics topics and learning materials","Create assignments and assessments","Record attendance and assessment marks","Share class notices and review student progress"]
  },
  student: {
    title: "Student workspace",
    description: "A clear view of learning tasks, course progress and published results.",
    listTitle: "Student learning tools",
    cards: [["My assignments","—","Work assigned to your class"],["Course progress","—","Your learning journey"],["Attendance","—","Your own attendance record"],["Results","—","Results released to you"]],
    items: ["View your class subjects, chapters and topics","Open assigned work and submit permitted responses","Continue lessons in the course hub","View your own attendance and released results","Read academy and classroom notices"]
  }
};

const cards = document.getElementById("roleCards");
const list = document.getElementById("roleList");
function showRole(role) {
  const data = previews[role] || previews.admin;
  document.getElementById("roleTitle").textContent = data.title;
  document.getElementById("roleDescription").textContent = data.description;
  document.getElementById("roleListTitle").textContent = data.listTitle;
  cards.innerHTML = data.cards.map(([title, value, note]) => `<article class="role-card"><span>${title}</span><strong>${value}</strong><small>${note}</small></article>`).join("");
  list.innerHTML = data.items.map(item => `<li>${item}</li>`).join("");
  document.querySelectorAll("[data-role]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.role === role)));
}
document.querySelectorAll("[data-role]").forEach(button => button.addEventListener("click", () => showRole(button.dataset.role)));
showRole("admin");