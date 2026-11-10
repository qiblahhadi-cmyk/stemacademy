import { requireClassAccess, requireTeachingAssignment, txAuthorizeScope } from "../authorization.mjs";
import { jsonResponse, errorResponse } from "../response.mjs";
import { API_ERRORS } from "../errors.mjs";

/*
 * Assignment workflow. Pure request handling: the caller (api.mjs) authenticates
 * the user and supplies the Firestore handle and a server-timestamp factory, so
 * this module never imports firebase-admin and can be unit-tested directly.
 *
 * Security rules enforced here:
 * - Scope (class + subject) is always derived from the STORED record for
 *   update/publish/close, never from the request body.
 * - classId and subjectId are immutable after creation.
 * - Students can list only published assignments in classes they belong to.
 * - Every state change and create writes an audit entry in the same batch.
 * - Audit metadata contains identifiers and field names only, never content.
 */

const ASSIGNMENT_TYPES = new Set(["physical", "online"]);
const CREATE_FIELDS = new Set(["title", "instructions", "type", "classId", "subjectId", "dueAt"]);
const UPDATE_FIELDS = new Set(["title", "instructions", "type", "dueAt"]);
const STAFF_ROLES = new Set(["admin", "teacher"]);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const ISO_WITH_TIMEZONE = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?(Z|[+-]\d\d:\d\d)$/;
const LIST_LIMIT = 100;
const STUDENT_VISIBLE_STATES = ["published", "closed"];

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isValidId = (value) => typeof value === "string" && ID_PATTERN.test(value);
const isStaff = (user) => STAFF_ROLES.has(user.role);

function fail(code, message) {
  const details = API_ERRORS[code];
  return errorResponse(code, message ?? details.message, details.status);
}

function deny() {
  throw new Error("FORBIDDEN");
}

/**
 * Validate and normalize a create or update payload.
 * Returns { value } on success or { error } with a safe, generic message.
 */
export function validateAssignmentInput(input, mode) {
  if (!isPlainObject(input)) {
    return { error: "A JSON object is required." };
  }

  const allowed = mode === "create" ? CREATE_FIELDS : UPDATE_FIELDS;
  const keys = Object.keys(input);

  if (keys.some((key) => !allowed.has(key))) {
    return { error: "The request contains unsupported fields." };
  }

  if (mode === "update" && keys.length === 0) {
    return { error: "No changes were provided." };
  }

  const value = {};

  if (mode === "create") {
    value.instructions = "";
    value.dueAt = null;
  }

  if (mode === "create" || "title" in input) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (title.length < 2 || title.length > 160) {
      return { error: "Title must contain 2 to 160 characters." };
    }
    value.title = title;
  }

  if ("instructions" in input) {
    if (typeof input.instructions !== "string" || input.instructions.length > 10000) {
      return { error: "Instructions must be text of at most 10000 characters." };
    }
    value.instructions = input.instructions.trim();
  }

  if (mode === "create" || "type" in input) {
    if (!ASSIGNMENT_TYPES.has(input.type)) {
      return { error: "Type must be physical or online." };
    }
    value.type = input.type;
  }

  if (mode === "create") {
    if (!isValidId(input.classId)) {
      return { error: "A valid classId is required." };
    }
    if (!isValidId(input.subjectId)) {
      return { error: "A valid subjectId is required." };
    }
    value.classId = input.classId;
    value.subjectId = input.subjectId;
  }

  if ("dueAt" in input) {
    if (input.dueAt === null) {
      value.dueAt = null;
    } else {
      if (typeof input.dueAt !== "string" || !ISO_WITH_TIMEZONE.test(input.dueAt)) {
        return { error: "dueAt must be an ISO timestamp with an explicit timezone." };
      }
      const parsed = new Date(input.dueAt);
      if (Number.isNaN(parsed.getTime())) {
        return { error: "dueAt must be an ISO timestamp with an explicit timezone." };
      }
      value.dueAt = parsed.toISOString();
    }
  }

  return { value };
}

/**
 * Server-side scope check. Teachers need an exact active teaching assignment;
 * students need active class membership; admins are academy-wide. In every case
 * the class and subject must exist, be active, and share the same grade.
 */
async function authorizeScope(db, user, classId, subjectId) {
  if (user.role === "teacher") {
    await requireTeachingAssignment(db, user, classId, subjectId);
  } else if (user.role === "student") {
    await requireClassAccess(db, user, classId, "student");
  } else if (user.role !== "admin") {
    deny();
  }

  const [classSnapshot, subjectSnapshot] = await Promise.all([
    db.collection("classes").doc(classId).get(),
    db.collection("subjects").doc(subjectId).get()
  ]);

  if (!classSnapshot.exists || !subjectSnapshot.exists) {
    throw new Error("NOT_FOUND");
  }

  const classData = classSnapshot.data();
  const subjectData = subjectSnapshot.data();

  if (
    classData.active !== true ||
    subjectData.active !== true ||
    classData.grade !== subjectData.grade
  ) {
    throw new Error("NOT_FOUND");
  }
}

function toIsoOrNull(value) {
  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return value;
  }
  return null;
}

/** Explicit allowlist. Never includes createdBy or other staff identifiers. */
function toResponseAssignment(id, data) {
  return {
    id,
    title: data.title,
    instructions: data.instructions || "",
    type: data.type,
    classId: data.classId,
    subjectId: data.subjectId,
    dueAt: data.dueAt || null,
    publicationState: data.publicationState,
    createdAt: toIsoOrNull(data.createdAt),
    updatedAt: toIsoOrNull(data.updatedAt)
  };
}

function auditEntry(user, action, targetId, metadata, serverTimestamp) {
  return {
    actorUid: user.uid,
    actorRole: user.role,
    action,
    targetType: "assignment",
    targetId,
    metadata,
    createdAt: serverTimestamp()
  };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function assignmentNotFound() {
  return fail("NOT_FOUND", "Assignment not found.");
}

/**
 * Load an assignment for an ID-addressed request. Missing, out-of-scope, and
 * inactive-scope records all produce the SAME response, so callers cannot use
 * status codes or messages to discover which assignment IDs exist.
 */
async function loadScopedAssignment(ctx, id) {
  const ref = ctx.db.collection("assignments").doc(id);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    return { response: assignmentNotFound() };
  }

  const current = snapshot.data();

  try {
    // Authorize against the stored scope, never against anything in the request.
    await authorizeScope(ctx.db, ctx.user, current.classId, current.subjectId);
  } catch (error) {
    if (error.message === "FORBIDDEN" || error.message === "NOT_FOUND") {
      return { response: assignmentNotFound() };
    }
    throw error;
  }

  return { ref, current };
}

/**
 * Run a read-check-write sequence atomically. The state read happens inside the
 * transaction, so a concurrent publish/close/update either commits first (and
 * this call sees the new state) or is retried against the latest state.
 * Authorization uses the stored record's scope; out-of-scope and missing records
 * return the same not-found response.
 */
async function scopedTransaction(ctx, id, apply) {
  const ref = ctx.db.collection("assignments").doc(id);

  return ctx.db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) {
      return assignmentNotFound();
    }

    const current = snapshot.data();

    try {
      await txAuthorizeScope(tx, ctx.db, ctx.user, current.classId, current.subjectId);
    } catch (error) {
      if (error.message === "FORBIDDEN" || error.message === "NOT_FOUND") {
        return assignmentNotFound();
      }
      throw error;
    }

    return apply({ tx, ref, current });
  });
}

async function getAssignment(ctx, id) {
  const loaded = await loadScopedAssignment(ctx, id);
  if (loaded.response) return loaded.response;

  // Students may not open drafts, even by direct ID; respond as if absent.
  if (ctx.user.role === "student" && !STUDENT_VISIBLE_STATES.includes(loaded.current.publicationState)) {
    return assignmentNotFound();
  }

  return jsonResponse({
    success: true,
    data: { assignment: toResponseAssignment(id, loaded.current) }
  });
}

async function listAssignments(request, ctx) {
  const url = new URL(request.url);
  const classId = url.searchParams.get("classId");
  const subjectId = url.searchParams.get("subjectId");

  if (!isValidId(classId) || !isValidId(subjectId)) {
    return fail("INVALID_INPUT", "classId and subjectId are required.");
  }

  await authorizeScope(ctx.db, ctx.user, classId, subjectId);

  let query = ctx.db.collection("assignments")
    .where("classId", "==", classId)
    .where("subjectId", "==", subjectId);

  if (ctx.user.role === "student") {
    // Closed assignments stay visible to students as read-only history.
    query = query.where("publicationState", "in", STUDENT_VISIBLE_STATES);
  }

  const snapshot = await query.orderBy("createdAt", "desc").limit(LIST_LIMIT).get();

  return jsonResponse({
    success: true,
    data: {
      assignments: snapshot.docs.map((doc) => toResponseAssignment(doc.id, doc.data()))
    }
  });
}

async function createAssignment(request, ctx) {
  const body = await readJson(request);
  if (body === undefined) {
    return fail("INVALID_INPUT", "Valid JSON is required.");
  }

  const { error, value } = validateAssignmentInput(body, "create");
  if (error) {
    return fail("INVALID_INPUT", error);
  }

  const ref = ctx.db.collection("assignments").doc();
  return ctx.db.runTransaction(async (tx) => {
    try {
      await txAuthorizeScope(tx, ctx.db, ctx.user, value.classId, value.subjectId);
    } catch (error) {
      if (error.message === "FORBIDDEN") return fail("FORBIDDEN");
      if (error.message === "NOT_FOUND") return assignmentNotFound();
      throw error;
    }
    const now = ctx.serverTimestamp();
    tx.set(ref, {
      ...value,
      publicationState: "draft",
      createdBy: ctx.user.uid,
      createdAt: now,
      updatedAt: now
    });
    tx.set(ctx.db.collection("auditLogs").doc(), auditEntry(ctx.user, "assignment.created", ref.id, {
      classId: value.classId, subjectId: value.subjectId
    }, ctx.serverTimestamp));
    return jsonResponse({ success: true, data: { id: ref.id, publicationState: "draft" } }, 201);
  });
}

async function updateAssignment(request, ctx, id) {
  const body = await readJson(request);
  if (body === undefined) {
    return fail("INVALID_INPUT", "Valid JSON is required.");
  }

  const { error, value } = validateAssignmentInput(body, "update");
  if (error) {
    return fail("INVALID_INPUT", error);
  }

  return scopedTransaction(ctx, id, ({ tx, ref, current }) => {
    if (current.publicationState === "closed") {
      return fail("CONFLICT", "Closed assignments cannot be edited.");
    }

    const now = ctx.serverTimestamp();

    tx.update(ref, { ...value, updatedAt: now });
    tx.set(
      ctx.db.collection("auditLogs").doc(),
      auditEntry(ctx.user, "assignment.updated", id, {
        classId: current.classId,
        subjectId: current.subjectId,
        changedFields: Object.keys(value)
      }, ctx.serverTimestamp)
    );

    return jsonResponse({ success: true, data: { id, updated: true } });
  });
}

async function transitionAssignment(ctx, id, { from, to }) {
  return scopedTransaction(ctx, id, ({ tx, ref, current }) => {
    if (current.publicationState !== from) {
      return fail("CONFLICT", `Assignment must be ${from} before it can be ${to}.`);
    }

    const now = ctx.serverTimestamp();
    const stamps = to === "published"
      ? { publishedBy: ctx.user.uid, publishedAt: now }
      : { closedBy: ctx.user.uid, closedAt: now };
    const action = to === "published" ? "assignment.published" : "assignment.closed";

    tx.update(ref, { publicationState: to, ...stamps, updatedAt: now });
    tx.set(
      ctx.db.collection("auditLogs").doc(),
      auditEntry(ctx.user, action, id, {
        classId: current.classId,
        subjectId: current.subjectId,
        fromState: from,
        toState: to
      }, ctx.serverTimestamp)
    );

    return jsonResponse({ success: true, data: { id, publicationState: to } });
  });
}

/**
 * Route /assignments requests. `ctx.path` is the normalized API path
 * (e.g. "/assignments/abc/publish"); `ctx.user` must already be authenticated.
 */
export async function handleAssignments(request, ctx) {
  const segments = ctx.path.split("/").filter(Boolean);

  if (segments[0] !== "assignments" || segments.length > 3) {
    return fail("NOT_FOUND", "Assignment endpoint not found.");
  }

  const [, id, action] = segments;
  const method = request.method;

  if (id !== undefined && !isValidId(id)) {
    return fail("INVALID_INPUT", "Invalid assignment ID.");
  }

  if (id === undefined) {
    if (method === "GET") return listAssignments(request, ctx);
    if (method === "POST") {
      if (!isStaff(ctx.user)) return fail("FORBIDDEN");
      return createAssignment(request, ctx);
    }
    return fail("METHOD_NOT_ALLOWED");
  }

  if (action === undefined) {
    if (method === "GET") return getAssignment(ctx, id);
    if (method !== "PATCH") return fail("METHOD_NOT_ALLOWED");
    if (!isStaff(ctx.user)) return fail("FORBIDDEN");
    return updateAssignment(request, ctx, id);
  }

  if (action === "publish" || action === "close") {
    if (method !== "POST") return fail("METHOD_NOT_ALLOWED");
    if (!isStaff(ctx.user)) return fail("FORBIDDEN");
    return action === "publish"
      ? transitionAssignment(ctx, id, { from: "draft", to: "published" })
      : transitionAssignment(ctx, id, { from: "published", to: "closed" });
  }

  return fail("NOT_FOUND", "Assignment endpoint not found.");
}
