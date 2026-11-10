import { jsonResponse, errorResponse } from "../response.mjs";
import { API_ERRORS } from "../errors.mjs";

/*
 * Read-only administrator view of the append-only `auditLogs` collection.
 *
 * - The caller (handleAdmin) has already enforced the administrator role.
 * - Only GET is supported. Nothing here writes to Firestore.
 * - Only `auditLogs` is read, plus `users/{uid}.academyId` for actor labels.
 * - Responses are built from explicit allowlists; raw documents, display
 *   names, e-mail aliases and free-form metadata are never returned.
 */

const fail = (code, message) => errorResponse(code, message ?? API_ERRORS[code].message, API_ERRORS[code].status);

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const SCAN_BATCH = 100;
const MAX_SCANNED_PER_REQUEST = 500;
const MAX_QUERY_LENGTH = 100;
const ACTION_PATTERN = /^[a-z][a-z0-9_.-]{1,80}$/i;
const DOC_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ACTOR_ROLES = ["admin", "teacher", "student"];

/** Academy calendar is Asia/Karachi (UTC+05:00, no daylight saving). */
const ACADEMY_OFFSET = "+05:00";

/** Action prefix -> category shown in the interface. */
const CATEGORY_BY_PREFIX = {
  assignment: "Assignments",
  assessment: "Assessments",
  attendance: "Attendance",
  notice: "Communication",
  chitchat: "Communication",
  membership: "Classes",
  classes: "Classes",
  subjects: "Classes",
  "teaching-assignment": "Classes",
  students: "Account",
  staff: "Account",
  account: "Account",
  profile: "Account"
};
export const AUDIT_CATEGORIES = Object.freeze(["Classes", "Assignments", "Assessments", "Attendance", "Communication", "Account", "Other"]);

const DESCRIPTIONS = {
  "assignment.created": "Created an assignment draft",
  "assignment.updated": "Updated an assignment",
  "assignment.published": "Published an assignment",
  "assignment.closed": "Closed an assignment",
  "assessment.created": "Created an assessment draft",
  "assessment.updated": "Updated an assessment",
  "assessment.published": "Published an assessment",
  "assessment.closed": "Closed an assessment",
  "assessment.submitted": "A student submitted an assessment attempt",
  "assessment.attempt_reopened": "Reopened an assessment attempt",
  "assessment.retake_approved": "Approved an assessment retake",
  "assessment.result_approved": "Approved an assessment result",
  "assessment.result_released": "Released an assessment result",
  "attendance.marked": "Marked class attendance",
  "attendance.corrected": "Corrected an attendance record",
  "notice.created": "Created a notice",
  "notice.updated": "Updated a notice",
  "notice.deactivated": "Removed a notice",
  "chitchat.edited": "Edited a class message",
  "chitchat.deleted": "Removed a class message",
  "chitchat.moderated": "Moderated a class message",
  "chitchat.report_reviewed": "Reviewed a ChitChat report",
  "membership.enrolled": "Enrolled a student in a class",
  "membership.reactivated": "Reactivated a class membership",
  "membership.deactivated": "Deactivated a class membership",
  "teaching-assignment.created": "Assigned a teacher to a class subject",
  "teaching-assignment.reactivated": "Reactivated a teaching assignment",
  "teaching-assignment.deactivated": "Deactivated a teaching assignment",
  "teaching-assignment.updated": "Updated a teaching assignment",
  "classes.created": "Created a class",
  "classes.updated": "Updated a class",
  "classes.deactivated": "Deactivated a class",
  "subjects.created": "Created a subject",
  "subjects.updated": "Updated a subject",
  "subjects.deactivated": "Deactivated a subject",
  "students.updated": "Updated a student account",
  "students.deactivated": "Deactivated a student account",
  "staff.updated": "Updated a teacher account",
  "staff.deactivated": "Deactivated a teacher account",
  "account.provisioned.pending_activation": "Provisioned a new account (pending activation)",
  "account.credential_issuance_started": "Started owner credential issuance",
  "account.credential_issued": "Owner issued an initial credential",
  "account.initial_password_changed": "Completed first password change",
  "profile.displayName.updated": "Updated own display name"
};

/** Metadata keys that may be returned. Everything else is dropped. */
const METADATA_ALLOWLIST = ["classId", "subjectId", "scope", "fields", "attendanceDate", "count", "role", "academyId"];

function categoryOf(action) {
  if (typeof action !== "string") return "Other";
  const prefix = Object.keys(CATEGORY_BY_PREFIX)
    .filter((key) => action === key || action.startsWith(`${key}.`))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? CATEGORY_BY_PREFIX[prefix] : "Other";
}

function describe(action) {
  if (typeof action !== "string" || !action) return "Recorded an action";
  if (DESCRIPTIONS[action]) return DESCRIPTIONS[action];
  const readable = action.replace(/[._-]+/g, " ").trim();
  return `Recorded action: ${readable.slice(0, 80)}`;
}

function safeMetadata(metadata) {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const out = {};
  for (const key of METADATA_ALLOWLIST) {
    const value = metadata[key];
    if (value === undefined || value === null) continue;
    if (key === "fields") {
      if (Array.isArray(value)) out.fields = value.filter((item) => typeof item === "string").slice(0, 20).map((item) => item.slice(0, 60));
    } else if (key === "count") {
      if (Number.isFinite(value)) out.count = value;
    } else if (typeof value === "string") {
      out[key] = value.slice(0, 100);
    }
  }
  return out;
}

/** Firestore Timestamp, {_seconds}, {seconds}, Date or ISO string -> ISO string, else null. */
export function toIso(value) {
  try {
    if (value && typeof value.toDate === "function") return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    if (value && typeof value._seconds === "number") return new Date(value._seconds * 1000 + Math.floor((value._nanoseconds ?? 0) / 1e6)).toISOString();
    if (value && typeof value.seconds === "number") return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1e6)).toISOString();
    if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  } catch { /* fall through */ }
  return null;
}

function parseLimit(raw) {
  if (raw === null || raw === "") return DEFAULT_LIMIT;
  if (!/^\d{1,3}$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 && value <= MAX_LIMIT ? value : null;
}

function parseDay(raw, endOfDay) {
  if (!DATE_PATTERN.test(raw)) return null;
  const date = new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}${ACADEMY_OFFSET}`);
  if (Number.isNaN(date.getTime())) return null;
  // Reject impossible dates such as 2026-02-31 that JavaScript would roll over.
  const check = new Date(date.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
  return check === raw ? date : null;
}

function parseFilters(url) {
  const params = url.searchParams;
  const filters = {};

  const action = params.get("action");
  if (action) {
    if (!ACTION_PATTERN.test(action)) return { error: "Invalid action filter." };
    filters.action = action;
  }
  const actorRole = params.get("actorRole");
  if (actorRole) {
    if (!ACTOR_ROLES.includes(actorRole)) return { error: "Invalid actor role filter." };
    filters.actorRole = actorRole;
  }
  const category = params.get("category");
  if (category) {
    if (!AUDIT_CATEGORIES.includes(category)) return { error: "Invalid category filter." };
    filters.category = category;
  }
  const q = (params.get("q") ?? "").trim();
  if (q.length > MAX_QUERY_LENGTH) return { error: "Search text is too long." };
  if (q) filters.q = q.toLocaleLowerCase();

  const from = params.get("from");
  if (from) {
    filters.from = parseDay(from, false);
    if (!filters.from) return { error: "from must be a valid YYYY-MM-DD date." };
  }
  const to = params.get("to");
  if (to) {
    filters.to = parseDay(to, true);
    if (!filters.to) return { error: "to must be a valid YYYY-MM-DD date." };
  }
  if (filters.from && filters.to && filters.from > filters.to) return { error: "from must not be after to." };

  const limit = parseLimit(params.get("limit"));
  if (limit === null) return { error: `limit must be a whole number from 1 to ${MAX_LIMIT}.` };
  filters.limit = limit;

  const cursor = params.get("cursor");
  if (cursor) {
    if (!DOC_ID_PATTERN.test(cursor)) return { error: "Invalid cursor." };
    filters.cursor = cursor;
  }
  return { filters };
}

function matchesInMemory(data, filters) {
  if (filters.actorRole && data.actorRole !== filters.actorRole) return false;
  if (filters.action && data.action !== filters.action) return false;
  if (filters.category && categoryOf(data.action) !== filters.category) return false;
  if (filters.q) {
    const meta = safeMetadata(data.metadata);
    const haystack = [
      data.action, describe(data.action), data.targetType, data.targetId, data.actorRole,
      meta.classId, meta.subjectId, meta.academyId, meta.scope
    ].filter((part) => typeof part === "string").join(" ").toLocaleLowerCase();
    if (!haystack.includes(filters.q)) return false;
  }
  return true;
}

function baseQuery(db, filters) {
  let query = db.collection("auditLogs");
  // At most one equality filter is pushed to Firestore so only the single-field
  // composite indexes in firestore.indexes.json are required. Other filters are
  // applied in memory while scanning (bounded by MAX_SCANNED_PER_REQUEST).
  if (filters.action) query = query.where("action", "==", filters.action);
  else if (filters.actorRole) query = query.where("actorRole", "==", filters.actorRole);
  if (filters.from) query = query.where("createdAt", ">=", filters.from);
  if (filters.to) query = query.where("createdAt", "<=", filters.to);
  return query.orderBy("createdAt", "desc");
}

async function actorLabels(db, uids) {
  const labels = new Map();
  await Promise.all([...uids].map(async (uid) => {
    if (!DOC_ID_PATTERN.test(uid)) return;
    const snapshot = await db.collection("users").doc(uid).get();
    const academyId = snapshot.exists ? snapshot.data().academyId : null;
    labels.set(uid, typeof academyId === "string" ? academyId : null);
  }));
  return labels;
}

export async function listAuditLogs(request, ctx) {
  // Defence in depth: the router already restricts /admin/* to administrators.
  if (ctx.user?.role !== "admin") return fail("FORBIDDEN");
  if (request.method !== "GET") return fail("METHOD_NOT_ALLOWED");

  const parsed = parseFilters(new URL(request.url));
  if (parsed.error) return fail("INVALID_INPUT", parsed.error);
  const { filters } = parsed;

  let cursorSnapshot = null;
  if (filters.cursor) {
    cursorSnapshot = await ctx.db.collection("auditLogs").doc(filters.cursor).get();
    if (!cursorSnapshot.exists) return fail("INVALID_INPUT", "Invalid cursor.");
  }

  const matches = [];
  let scanned = 0;
  let lastScannedId = null;
  let lastBatchFull = false;
  let position = cursorSnapshot;

  while (matches.length <= filters.limit && scanned < MAX_SCANNED_PER_REQUEST) {
    let query = baseQuery(ctx.db, filters).limit(SCAN_BATCH);
    if (position) query = query.startAfter(position);
    const snapshot = await query.get();
    const docs = snapshot.docs;
    lastBatchFull = docs.length === SCAN_BATCH;
    for (const doc of docs) {
      scanned += 1;
      lastScannedId = doc.id;
      const data = doc.data();
      if (matchesInMemory(data, filters)) {
        matches.push({ id: doc.id, data });
        if (matches.length > filters.limit) break;
      }
    }
    if (docs.length < SCAN_BATCH) break;
    position = docs[docs.length - 1];
    if (matches.length > filters.limit) break;
  }

  let nextCursor = null;
  let hasMore = false;
  let scanLimited = false;
  if (matches.length > filters.limit) {
    hasMore = true;
    nextCursor = matches[filters.limit - 1].id;
  } else if (scanned >= MAX_SCANNED_PER_REQUEST && lastBatchFull && lastScannedId) {
    hasMore = true;
    scanLimited = true;
    nextCursor = lastScannedId;
  }

  const page = matches.slice(0, filters.limit);
  const labels = await actorLabels(ctx.db, new Set(page.map((entry) => entry.data.actorUid).filter(Boolean)));
  const records = page.map(({ id, data }) => ({
    id,
    action: typeof data.action === "string" ? data.action : null,
    category: categoryOf(data.action),
    description: describe(data.action),
    actorRole: ACTOR_ROLES.includes(data.actorRole) ? data.actorRole : null,
    actorAcademyId: labels.get(data.actorUid) ?? null,
    targetType: typeof data.targetType === "string" ? data.targetType : null,
    targetId: typeof data.targetId === "string" ? data.targetId : null,
    metadata: safeMetadata(data.metadata),
    createdAt: toIso(data.createdAt)
  }));

  return jsonResponse({
    success: true,
    data: { records, nextCursor, hasMore, scanLimited, limit: filters.limit }
  });
}
