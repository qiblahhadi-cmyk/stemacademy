/* Read-only student attendance view. The API scopes every query to the verified UID. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const LABELS = { present: "Present", absent: "Absent", late: "Late" };
  const state = { records: [], cursor: null, hasMore: false, loading: false };
  const api = (path) => window.StemSession.apiFetch(path);

  function cell(value) {
    const td = document.createElement("td");
    td.textContent = String(value);
    return td;
  }
  function formatDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "Asia/Karachi" })
      .format(new Date(Date.UTC(year, month - 1, day, 12)));
  }
  function historyText(items) {
    if (!items.length) return "No corrections";
    return items.map((item) => {
      const when = item.correctedAt
        ? new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(new Date(item.correctedAt))
        : "Date unavailable";
      return `${when}: ${LABELS[item.previousStatus] ?? "Unknown"} → ${LABELS[item.newStatus] ?? "Unknown"}. ${item.reason}`;
    }).join("\n");
  }
  function render() {
    const body = $("attendanceBody");
    body.replaceChildren();
    const records = state.records;
    const counts = { present: 0, absent: 0, late: 0 };
    for (const item of records) if (Object.hasOwn(counts, item.status)) counts[item.status] += 1;
    $("presentCount").textContent = counts.present;
    $("absentCount").textContent = counts.absent;
    $("lateCount").textContent = counts.late;
    $("totalCount").textContent = records.length;

    if (!records.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.textContent = state.loading ? "Loading your attendance…" : "No attendance records are available for your account yet.";
      tr.append(td);
      body.append(tr);
    } else {
      for (const item of records) {
        const tr = document.createElement("tr");
        tr.append(cell(formatDate(item.date)), cell(LABELS[item.status] ?? "Unavailable"), cell(item.correctionCount));
        const history = document.createElement("td");
        history.textContent = historyText(item.history ?? []);
        history.style.whiteSpace = "pre-line";
        tr.append(history);
        body.append(tr);
      }
    }
    $("resultCount").textContent = `${records.length} attendance record(s) loaded`;
    $("loadOlder").hidden = !state.hasMore;
    $("loadOlder").disabled = state.loading;
    $("loadOlder").textContent = state.loading ? "Loading…" : "Load older attendance";
  }
  async function loadPage(append = false) {
    state.loading = true;
    render();
    try {
      const suffix = append && state.cursor ? `?cursor=${encodeURIComponent(state.cursor)}` : "";
      const { data } = await api(`/attendance/mine${suffix}`);
      state.records = append ? [...state.records, ...data.records] : data.records;
      state.cursor = data.nextCursor;
      state.hasMore = data.hasMore;
    } finally {
      state.loading = false;
      render();
    }
  }
  async function init() {
    try {
      const me = await window.StemSession.ready;
      if (me.role !== "student") return;
      await loadPage();
      $("loadOlder").addEventListener("click", () => loadPage(true).catch((error) => {
        $("resultCount").textContent = error.message;
      }));
    } catch (error) {
      $("attendanceBody").replaceChildren();
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.textContent = "Your attendance could not be loaded. Please try again later.";
      tr.append(td);
      $("attendanceBody").append(tr);
      $("resultCount").textContent = error.message;
    }
  }
  init();
})();
