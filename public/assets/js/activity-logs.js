(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const PAGE_SIZE = 25;
  const formatter = new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" });
  const ROLE_LABELS = { admin: "Administrator", teacher: "Teacher", student: "Student" };
  const METADATA_LABELS = { classId: "Class", subjectId: "Subject", scope: "Audience", attendanceDate: "Attendance date", count: "Records", role: "Role", academyId: "Academy ID", fields: "Fields" };
  let nextCursor = null;
  let loading = false;
  let total = 0;

  function currentQuery(cursor) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    const map = { q: "activitySearch", category: "categoryFilter", actorRole: "roleFilter", from: "fromDate", to: "toDate" };
    for (const [key, id] of Object.entries(map)) {
      const value = $(id).value.trim();
      if (value) params.set(key, value);
    }
    if (cursor) params.set("cursor", cursor);
    return params.toString();
  }

  function formatTime(iso) {
    const date = iso ? new Date(iso) : null;
    return date && !Number.isNaN(date.getTime()) ? formatter.format(date) : "Time unavailable";
  }

  function detailText(record) {
    const parts = [];
    for (const [key, value] of Object.entries(record.metadata || {})) {
      const label = METADATA_LABELS[key] || key;
      parts.push(`${label}: ${Array.isArray(value) ? value.join(", ") : value}`);
    }
    return parts.join(" · ");
  }

  // Built with textContent only: audit values are never interpreted as HTML.
  function entryElement(record) {
    const article = document.createElement("article");
    article.className = "activity-entry";
    const dot = document.createElement("span");
    dot.className = "activity-dot";
    dot.setAttribute("aria-hidden", "true");
    const main = document.createElement("div");
    main.className = "activity-entry-main";
    const top = document.createElement("div");
    top.className = "activity-entry-top";
    const category = document.createElement("span");
    category.className = "activity-category";
    category.textContent = record.category;
    const time = document.createElement("time");
    if (record.createdAt) time.dateTime = record.createdAt;
    time.textContent = formatTime(record.createdAt);
    top.append(category, time);
    const title = document.createElement("h3");
    title.textContent = record.description;
    const detail = document.createElement("p");
    detail.textContent = detailText(record) || (record.targetId ? `Record: ${record.targetId}` : "");
    detail.hidden = !detail.textContent;
    const actor = document.createElement("span");
    actor.className = "activity-actor";
    const role = ROLE_LABELS[record.actorRole] || "Unknown role";
    actor.textContent = record.actorAcademyId ? `${role} · ${record.actorAcademyId}` : role;
    main.append(top, title, detail, actor);
    article.append(dot, main);
    return article;
  }

  function showError(message) {
    const box = $("activityError");
    box.textContent = message || "";
    box.hidden = !message;
  }

  function updateCount() {
    $("activityCount").textContent = `${total} entr${total === 1 ? "y" : "ies"} shown`;
  }

  async function load(reset) {
    if (loading) return;
    loading = true;
    showError("");
    $("loadMore").disabled = true;
    if (reset) { nextCursor = null; total = 0; $("activityList").replaceChildren(); }
    try {
      const result = await window.StemSession.apiFetch(`/admin/audit-logs?${currentQuery(reset ? null : nextCursor)}`);
      const { records, nextCursor: cursor, hasMore, scanLimited } = result.data;
      $("activityList").append(...records.map(entryElement));
      total += records.length;
      nextCursor = hasMore ? cursor : null;
      $("loadMore").hidden = !hasMore;
      $("scanNote").hidden = !scanLimited;
      $("emptyActivity").hidden = total !== 0 || hasMore;
      updateCount();
    } catch (error) {
      showError(error?.message || "Activity could not be loaded. Please try again.");
      $("activityCount").textContent = "Unavailable";
    } finally {
      loading = false;
      $("loadMore").disabled = false;
    }
  }

  $("activityFilters").addEventListener("submit", (event) => { event.preventDefault(); load(true); });
  $("clearFilters").addEventListener("click", () => { $("activityFilters").reset(); load(true); });
  $("loadMore").addEventListener("click", () => load(false));
  $("menuButton")?.addEventListener("click", () => $("sidebar")?.classList.toggle("open"));
  load(true);
})();
