/*
 * Student list of assessments. Students see published and closed assessments in
 * their own classes, with their own status. The server decides what they may do;
 * this page only links into the take-assessment page.
 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const KARACHI = "Asia/Karachi";
  const state = { view: "current", items: [] };

  const api = (path) => window.StemSession.apiFetch(path);
  const when = (iso) => (iso ? new Intl.DateTimeFormat("en-PK", { timeZone: KARACHI, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "No closing time");

  function statusText(item) {
    const a = item.attempt;
    if (a.status === "released") return `Marks released: ${a.score} out of ${a.maxScore}`;
    if (a.status === "submitted") return "Submitted. Waiting for marks.";
    if (a.status === "in_progress") return "In progress";
    if (a.status === "not_submitted") return "Not submitted";
    if (item.window === "upcoming") return "Not open yet";
    if (item.window === "closed") return "Closed. You did not attempt it.";
    return a.attemptsRemaining > 0 ? "Open. Not started yet." : "Open";
  }

  function isPast(item) {
    return item.window === "closed" || item.attempt.status === "released" || item.attempt.status === "submitted";
  }

  function cell(content) {
    const td = document.createElement("td");
    if (content instanceof Node) td.append(content);
    else td.textContent = String(content);
    return td;
  }

  function render() {
    const body = $("listBody");
    const rows = state.items.filter((item) => (state.view === "past" ? isPast(item) : !isPast(item)));
    body.replaceChildren();

    if (rows.length === 0) {
      const td = document.createElement("td");
      td.colSpan = 5;
      td.textContent = state.view === "past"
        ? "No completed assessments yet."
        : "No current assessments.";
      const tr = document.createElement("tr");
      tr.append(td);
      body.append(tr);
    } else {
      for (const item of rows) {
        const tr = document.createElement("tr");
        const title = document.createElement("td");
        title.textContent = item.title;
        const meta = document.createElement("small");
        meta.className = "muted";
        meta.textContent = `${item.totalMarks} marks · ${item.questionCount} questions${item.durationMinutes ? ` · ${item.durationMinutes} min` : ""}`;
        title.append(document.createElement("br"), meta);

        const link = document.createElement("a");
        link.className = "table-action";
        link.href = `/take-assessment.html?id=${encodeURIComponent(item.id)}`;
        link.textContent = item.attempt.status === "in_progress" ? "Resume" : "Open";

        tr.append(title, cell(item.subjectName), cell(when(item.closesAt)), cell(statusText(item)), cell(link));
        body.append(tr);
      }
    }
    $("resultCount").textContent = `${rows.length} assessment(s)`;
  }

  async function init() {
    try {
      await window.StemSession.ready;
    } catch {
      return;
    }

    try {
      const { data } = await api("/assessments/mine");
      state.items = data.assessments;
      render();
    } catch (error) {
      $("resultCount").textContent = error.message;
      $("listBody").replaceChildren();
    }

    for (const tab of document.querySelectorAll("[data-view]")) {
      tab.addEventListener("click", () => {
        state.view = tab.dataset.view;
        for (const other of document.querySelectorAll("[data-view]")) {
          other.setAttribute("aria-pressed", String(other === tab));
        }
        render();
      });
    }
  }

  init();
})();
