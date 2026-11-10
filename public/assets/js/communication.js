/* Persistent Firestore-backed in-app notices. All authorization is enforced by the API. */
import { buildNoticePayload, priorityForEditor } from "./notice-form.js";

(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const state = { role: null, classes: [], notices: [], editing: null };
  const api = (path, options) => window.StemSession.apiFetch(path, options);
  const setText = (id, value) => { $(id).textContent = value; };
  const option = (value, label) => { const el = document.createElement("option"); el.value = value; el.textContent = label; return el; };
  const dateLabel = (value) => {
    if (!value) return "";
    const date = typeof value.toDate === "function" ? value.toDate() :
      value._seconds ? new Date(value._seconds * 1000) : new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "Asia/Karachi" }).format(date);
  };
  const audienceLabel = (notice) => notice.scope === "academy"
    ? "All academy classes"
    : state.classes.find((c) => c.id === notice.classId)?.name ?? `Class ${notice.classId}`;
  const isStaff = () => state.role === "admin" || state.role === "teacher";

  function make(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function filtered() {
    const q = $("noticeSearch").value.trim().toLowerCase();
    const audience = $("noticeAudience").value;
    const priority = $("noticePriority").value;
    return state.notices.filter((n) => (audience === "all" ||
      (audience === "academy" && n.scope === "academy") ||
      (audience !== "academy" && n.scope === "class" && n.classId === audience)) &&
      (priority === "all" || n.priority === priority) &&
      (!q || `${n.title} ${n.body} ${audienceLabel(n)}`.toLowerCase().includes(q)));
  }
  function render() {
    const rows = filtered();
    const list = $("noticeList");
    list.replaceChildren();
    if (!rows.length) list.append(make("div", "empty-resource", "No notices match your search or filters."));
    for (const notice of rows) {
      const card = make("article", "notice-card");
      const head = make("div", "notice-card-head");
      const heading = make("div");
      const tags = make("div", "notice-card-tags");
      tags.append(make("span", "notice-audience", audienceLabel(notice)));
      tags.append(make("span", `notice-priority${notice.priority === "important" ? " priority-important" : ""}`,
        notice.priority === "important" ? "Important" : "Normal"));
      heading.append(tags, make("h3", "", notice.title));
      head.append(heading, make("time", "", dateLabel(notice.createdAt)));
      card.append(head, make("p", "", notice.body));
      if (isStaff()) {
        const actions = make("div", "notice-card-actions");
        const edit = make("button", "table-action", "Edit");
        edit.type = "button"; edit.dataset.edit = notice.id;
        const deactivate = make("button", "table-action notice-delete", "Deactivate");
        deactivate.type = "button"; deactivate.dataset.deactivate = notice.id;
        actions.append(edit, deactivate); card.append(actions);
      }
      list.append(card);
    }
    setText("noticeCount", `Showing ${rows.length} of ${state.notices.length} notices.`);
    setText("noticeTotal", state.notices.length);
    setText("academyTotal", state.notices.filter((n) => n.scope === "academy").length);
    setText("classTotal", state.notices.filter((n) => n.scope === "class").length);
    setText("priorityTotal", state.notices.filter((n) => n.priority === "important").length);
  }
  async function load() {
    const result = await api("/notices");
    state.notices = result.data.notices;
    render();
  }
  async function loadClasses() {
    const result = await api("/classes");
    state.classes = result.data.classes;
    if (isStaff()) {
      const target = $("noticeTarget");
      target.replaceChildren();
      if (state.role === "admin") target.append(option("academy", "All academy classes"));
      for (const item of state.classes) target.append(option(`class:${item.id}`, item.name));
    }
    const filter = $("noticeAudience");
    filter.replaceChildren(option("all", "All audiences"), option("academy", "Academy-wide"));
    for (const item of state.classes) filter.append(option(item.id, item.name));
  }
  function openEditor(notice = null) {
    state.editing = notice?.id ?? null;
    $("noticeForm").reset();
    $("noticeDialogTitle").textContent = notice ? "Edit notice" : "Create notice";
    $("noticeTitle").value = notice?.title ?? "";
    $("noticeLevel").value = priorityForEditor(notice);
    $("noticeBody").value = notice?.body ?? "";
    // Audience is fixed after creation (the API ignores it on update), so the editor shows it read-only.
    $("noticeTarget").disabled = Boolean(notice);
    if (notice) $("noticeTarget").value = notice.scope === "academy" ? "academy" : `class:${notice.classId}`;
    setText("noticeFeedback", "");
    $("noticeDialog").showModal();
  }
  async function save(event) {
    event.preventDefault();
    const payload = buildNoticePayload({
      editing: Boolean(state.editing),
      target: $("noticeTarget").value,
      title: $("noticeTitle").value,
      body: $("noticeBody").value,
      priority: $("noticeLevel").value
    });
    try {
      await api(state.editing ? `/notices/${state.editing}` : "/notices", {
        method: state.editing ? "PATCH" : "POST", body: payload
      });
      $("noticeDialog").close(); await load();
    } catch (error) { setText("noticeFeedback", error.message || "Unable to save this notice."); }
  }
  async function onListClick(event) {
    const button = event.target.closest("button[data-edit],button[data-deactivate]");
    if (!button) return;
    const notice = state.notices.find((item) => item.id === (button.dataset.edit || button.dataset.deactivate));
    if (!notice) return;
    if (button.dataset.edit) { openEditor(notice); return; }
    if (!window.confirm("Deactivate this notice? It will no longer appear on the notice board.")) return;
    try { await api(`/notices/${notice.id}`, { method: "POST" }); await load(); }
    catch (error) { window.alert(error.message || "Unable to deactivate this notice."); }
  }
  async function init() {
    try {
      const me = await window.StemSession.ready;
      state.role = me.role;
      if (!isStaff()) $("newNotice").hidden = true;
      if (state.role === "teacher") {
        const academyOption = $("noticeTarget").querySelector('option[value="academy"]');
        academyOption?.remove();
      }
      await loadClasses();
      await load();
      $("newNotice").addEventListener("click", () => openEditor());
      $("noticeForm").addEventListener("submit", save);
      $("noticeList").addEventListener("click", onListClick);
      ["noticeSearch", "noticeAudience", "noticePriority"].forEach((id) =>
        $(id).addEventListener(id === "noticeSearch" ? "input" : "change", render));
      $("closeNotice").addEventListener("click", () => $("noticeDialog").close());
      $("cancelNotice").addEventListener("click", () => $("noticeDialog").close());
      $("menuButton")?.addEventListener("click", () => $("sidebar").classList.toggle("open"));
      document.querySelectorAll("[data-sample-notice]").forEach((el) => el.remove());
      document.querySelectorAll(".role-label").forEach((el) => { el.textContent = me.role === "admin" ? "Administrator" : me.role === "teacher" ? "Teacher" : "Student"; });
      document.querySelectorAll(".preview-tag").forEach((el) => { el.textContent = "PERSISTENT IN-APP NOTICES"; });
    } catch (error) {
      const list = $("noticeList");
      list.replaceChildren(make("div", "empty-resource", error.message || "Unable to load notices."));
    }
  }
  init();
})();
