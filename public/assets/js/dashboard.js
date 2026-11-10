/*
 * Dashboard: role-specific counts from /api/dashboard. Each figure is a live
 * count from the server; zero means there is no matching record.
 */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const ROLE_LABELS = { admin: "Administrator", teacher: "Teacher", student: "Student" };
  const METRICS = {
    admin: [
      ["activeClasses", "Active classes", "Classes currently open"],
      ["activeStudents", "Active students", "Student accounts that can sign in"],
      ["activeTeachers", "Active teachers", "Teacher accounts that can sign in"],
      ["activeNotices", "Notices on the board", "Active notices across the academy"],
      ["unreadMessages", "Unread ChitChat messages", "Recent unread messages (up to 500 per class)"]
    ],
    teacher: [
      ["assignedClasses", "My classes", "Classes you teach"],
      ["studentsInMyClasses", "Students in my classes", "Distinct active students"],
      ["myTeachingAssignments", "My teaching assignments", "Active subject assignments"],
      ["visibleNotices", "Notices for me", "Academy and class notices"],
      ["unreadMessages", "Unread ChitChat messages", "Recent unread messages (up to 500 per class)"]
    ],
    student: [
      ["enrolledClasses", "My classes", "Classes you are enrolled in"],
      ["visibleNotices", "Notices for me", "Academy and class notices"],
      ["unreadMessages", "Unread ChitChat messages", "Recent unread messages (up to 500 per class)"]
    ]
  };
  const EMPTY_MESSAGES = {
    admin: "No classes, students or teachers are recorded yet. Add them in Academy Management.",
    teacher: "No classes are assigned to you yet. Your administrator assigns teaching responsibilities.",
    student: "You are not enrolled in an active class yet. Your administrator adds students to classes."
  };

  function todayLabel() {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi"
    }).format(new Date()).toUpperCase();
  }

  function renderCards(role, metrics) {
    const grid = $("statsGrid");
    grid.replaceChildren();
    for (const [key, label, hint] of METRICS[role] ?? []) {
      const card = document.createElement("article");
      card.className = "stat-card";
      const top = document.createElement("div");
      top.className = "stat-top";
      const name = document.createElement("span");
      name.textContent = label;
      top.append(name);
      const value = document.createElement("strong");
      value.textContent = String(metrics[key] ?? 0);
      const note = document.createElement("small");
      note.textContent = hint;
      card.append(top, value, note);
      grid.append(card);
    }
    grid.hidden = false;
  }

  // The first metric per role is its core academic record (classes, or students in a teacher's view).
  function isEmpty(role, metrics) {
    const primary = METRICS[role]?.[0]?.[0];
    return primary !== undefined && metrics[primary] === 0;
  }

  async function init() {
    let me;
    try {
      me = await window.StemSession.ready;
    } catch {
      return;
    }

    $("todayLabel").textContent = todayLabel();
    $("greeting").textContent = `Signed in as ${me.displayName || "your account"} · ${ROLE_LABELS[me.role] ?? "Signed in"}`;

    try {
      const { data } = await window.StemSession.apiFetch("/dashboard");
      renderCards(data.role, data.metrics);
      $("dashboardStatus").textContent = "";
      if (isEmpty(data.role, data.metrics)) {
        const empty = $("dashboardEmpty");
        empty.textContent = EMPTY_MESSAGES[data.role];
        empty.hidden = false;
      }
    } catch (error) {
      $("dashboardStatus").textContent = error.message || "Your figures could not be loaded.";
    }
  }

  init();
})();
