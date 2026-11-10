/*
 * Pure helpers for the notice form. communication.js imports these, and the
 * tests import them directly. Values must match the API: see NOTICE_PRIORITIES
 * in netlify/functions/lib/routes/notices.mjs.
 */
export const NOTICE_PRIORITIES = Object.freeze(["normal", "important"]);

/**
 * Builds the request body for create (POST) or edit (PATCH).
 * The API accepts only title, body and priority on update. Scope and class are
 * fixed when a notice is created, so they are never sent on edit.
 */
export function buildNoticePayload({ editing, target, title, body, priority }) {
  const fields = { title: title.trim(), body: body.trim(), priority };
  if (editing) return fields;
  if (target === "academy") return { ...fields, scope: "academy" };
  return { ...fields, scope: "class", classId: target.slice("class:".length) };
}

/** The priority to pre-select in the editor. Unknown values fall back to normal. */
export function priorityForEditor(notice) {
  return NOTICE_PRIORITIES.includes(notice?.priority) ? notice.priority : "normal";
}
