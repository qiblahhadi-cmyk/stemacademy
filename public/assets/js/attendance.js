/*
 * Attendance page. Every read and write goes through window.StemSession and the
 * server, which checks role, class scope, membership and the reason rule. The
 * controls here only make the common path easy.
 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const KARACHI = "Asia/Karachi";
  const LABELS = { present: "Present", absent: "Absent", late: "Late" };
  const state = { roster: [], marked: false, correctingUid: null };

  const api = (path, options) => window.StemSession.apiFetch(path, options);

  function todayInAcademy() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: KARACHI }).format(new Date());
  }

  function notify(id, text) {
    $(id).textContent = text || "";
  }

  function cell(content) {
    const td = document.createElement("td");
    if (content instanceof Node) td.append(content);
    else td.textContent = String(content);
    return td;
  }

  function statusSelect(uid) {
    const select = document.createElement("select");
    select.dataset.uid = uid;
    select.setAttribute("aria-label", "Choose status");
    select.append(new Option("Choose…", ""));
    for (const [value, label] of Object.entries(LABELS)) select.append(new Option(label, value));
    select.addEventListener("change", updateControls);
    return select;
  }

  function updateControls() {
    const selects = [...document.querySelectorAll("select[data-uid]")];
    const unmarkedSelects = selects;
    const chosen = unmarkedSelects.filter((s) => s.value).length;
    $("saveButton").disabled = chosen === 0;
    $("markAllPresent").disabled = unmarkedSelects.length === 0;
  }

  function updateSummary() {
    const count = (status) => state.roster.filter((s) => s.status === status).length;
    $("presentCount").textContent = count("present");
    $("absentCount").textContent = count("absent");
    $("lateCount").textContent = count("late");
    $("unmarkedCount").textContent = state.roster.filter((s) => s.status === null).length;
  }

  function render() {
    const body = $("rosterBody");
    body.replaceChildren();

    if (state.roster.length === 0) {
      const td = document.createElement("td");
      td.colSpan = 4;
      td.textContent = "No active students are enrolled in this class.";
      const tr = document.createElement("tr");
      tr.append(td);
      body.append(tr);
    } else {
      for (const student of state.roster) {
        const tr = document.createElement("tr");
        tr.append(cell(student.name));

        if (student.status === null) {
          tr.append(cell(statusSelect(student.studentUid)));
          tr.append(cell(String(student.correctionCount)));
          tr.append(cell("Choose a status, then save"));
        } else {
          tr.append(cell(LABELS[student.status]));
          tr.append(cell(String(student.correctionCount)));
          const button = document.createElement("button");
          button.type = "button";
          button.className = "table-action";
          button.dataset.correct = student.studentUid;
          button.textContent = "Correct";
          tr.append(cell(button));
        }
        body.append(tr);
      }
    }

    updateSummary();
    updateControls();
    $("resultCount").textContent = `${state.roster.length} student(s)`;
  }

  async function loadRoster() {
    const classId = $("classSelect").value;
    const date = $("attendanceDate").value;
    if (!classId || !date) {
      state.roster = [];
      notify("rosterStatus", "Choose a class and date.");
      render();
      return;
    }

    notify("rosterStatus", "Loading…");
    const { data } = await api(`/attendance?classId=${encodeURIComponent(classId)}&date=${encodeURIComponent(date)}`);
    state.roster = data.students;
    state.marked = data.marked;
    notify("rosterStatus", data.marked
      ? "Attendance recorded for this day. Use Correct to change a student's status."
      : "Not yet recorded for this day.");
    render();
  }

  async function save() {
    const records = [...document.querySelectorAll("select[data-uid]")]
      .filter((s) => s.value)
      .map((s) => ({ studentUid: s.dataset.uid, status: s.value }));
    if (records.length === 0) return;

    $("saveButton").disabled = true;
    try {
      const { data } = await api("/attendance/mark", {
        method: "POST",
        body: { classId: $("classSelect").value, date: $("attendanceDate").value, records }
      });
      notify("pageNotice", `Saved attendance for ${data.marked} student(s).`);
    } catch (error) {
      notify("pageNotice", error.message);
    } finally {
      await loadRoster().catch((error) => notify("pageNotice", error.message));
    }
  }

  async function markAllPresent() {
    for (const select of document.querySelectorAll("select[data-uid]")) {
      if (!select.value) select.value = "present";
    }
    updateControls();
  }

  async function openCorrection(uid) {
    const student = state.roster.find((s) => s.studentUid === uid);
    if (!student || student.status === null) return;
    state.correctingUid = uid;

    $("correctionStudent").textContent = student.name;
    $("correctionCurrent").textContent = `Currently recorded as ${LABELS[student.status]}.`;
    $("correctionStatus").value = student.status;
    $("correctionReason").value = "";
    notify("correctionFeedback", "");

    const history = $("correctionHistory");
    history.replaceChildren();
    const params = new URLSearchParams({ classId: $("classSelect").value, date: $("attendanceDate").value, studentUid: uid });
    try {
      const { data } = await api(`/attendance/corrections?${params}`);
      if (data.corrections.length === 0) {
        const item = document.createElement("li");
        item.textContent = "No corrections yet.";
        history.append(item);
      }
      for (const c of data.corrections) {
        const item = document.createElement("li");
        const when = c.correctedAt
          ? new Intl.DateTimeFormat("en-PK", { timeZone: KARACHI, dateStyle: "medium", timeStyle: "short" }).format(new Date(c.correctedAt))
          : "";
        item.textContent = `${when}: ${LABELS[c.previousStatus]} → ${LABELS[c.newStatus]} by ${c.correctedByName}. Reason: ${c.reason}`;
        history.append(item);
      }
    } catch (error) {
      notify("correctionFeedback", error.message);
    }

    $("correctionDialog").showModal();
  }

  async function submitCorrection(event) {
    event.preventDefault();
    const reason = $("correctionReason").value.trim();
    if (reason.length < 3) {
      notify("correctionFeedback", "Enter a reason of at least 3 characters.");
      return;
    }

    const button = $("saveCorrection");
    button.disabled = true;
    try {
      await api("/attendance/correct", {
        method: "POST",
        body: {
          classId: $("classSelect").value,
          date: $("attendanceDate").value,
          studentUid: state.correctingUid,
          status: $("correctionStatus").value,
          reason
        }
      });
      $("correctionDialog").close();
      notify("pageNotice", "Correction saved.");
      await loadRoster();
    } catch (error) {
      notify("correctionFeedback", error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function init() {
    let me;
    try {
      me = await window.StemSession.ready;
    } catch {
      return;
    }
    if (me.role !== "admin" && me.role !== "teacher") return;

    const today = todayInAcademy();
    $("attendanceDate").value = today;
    $("attendanceDate").max = today;

    const { data } = await api("/classes");
    const select = $("classSelect");
    select.replaceChildren(new Option(data.classes.length ? "Choose a class" : "No classes available", ""));
    for (const c of data.classes) select.append(new Option(`${c.name} (Grade ${c.grade})`, c.id));

    select.addEventListener("change", () => loadRoster().catch((e) => notify("pageNotice", e.message)));
    $("attendanceDate").addEventListener("change", () => loadRoster().catch((e) => notify("pageNotice", e.message)));
    $("saveButton").addEventListener("click", save);
    $("markAllPresent").addEventListener("click", markAllPresent);

    $("rosterBody").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-correct]");
      if (button) openCorrection(button.dataset.correct).catch((e) => notify("pageNotice", e.message));
    });

    $("correctionForm").addEventListener("submit", submitCorrection);
    $("cancelCorrection").addEventListener("click", () => $("correctionDialog").close());
    $("closeCorrection").addEventListener("click", () => $("correctionDialog").close());

    render();
  }

  init();
})();
