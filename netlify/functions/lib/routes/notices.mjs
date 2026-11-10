import { requireClassTeachingAssignment, txAuthorizeScope } from "../authorization.mjs";
import { jsonResponse, errorResponse } from "../response.mjs";
import { API_ERRORS } from "../errors.mjs";

const ID = /^[A-Za-z0-9_-]{1,100}$/;
export const NOTICE_PRIORITIES = Object.freeze(["normal", "important"]);
const PRIORITIES = new Set(NOTICE_PRIORITIES);
const fail = (code, message) => errorResponse(code, message ?? API_ERRORS[code].message, API_ERRORS[code].status);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

async function bodyOf(request) { try { return await request.json(); } catch { return undefined; } }
function validate(input, create) {
  if (!object(input)) return { error: "A JSON object is required." };
  const allowed = create ? ["title", "body", "scope", "classId", "priority"] : ["title", "body", "priority"];
  if (Object.keys(input).some((key) => !allowed.includes(key))) return { error: "Unsupported notice fields were provided." };
  const value = {};
  if (create || "title" in input) {
    if (typeof input.title !== "string" || input.title.trim().length < 3 || input.title.trim().length > 120) return { error: "Title must contain 3 to 120 characters." };
    value.title = input.title.trim();
  }
  if (create || "body" in input) {
    if (typeof input.body !== "string" || input.body.trim().length < 3 || input.body.trim().length > 2000) return { error: "Notice text must contain 3 to 2000 characters." };
    value.body = input.body.trim();
  }
  if (create) {
    if (!["academy", "class"].includes(input.scope)) return { error: "Scope must be academy or class." };
    value.scope = input.scope;
    if (input.scope === "class" && !ID.test(input.classId ?? "")) return { error: "A valid classId is required for a class notice." };
    if (input.scope === "academy" && input.classId !== undefined) return { error: "Academy notices cannot include a classId." };
    if (input.scope === "class") value.classId = input.classId;
  }
  if (create || "priority" in input) {
    if (!PRIORITIES.has(input.priority)) return { error: "Priority must be normal or important." };
    value.priority = input.priority;
  }
  if (!create && Object.keys(value).length === 0) return { error: "No changes were provided." };
  return { value };
}

async function authorizeClassNotice(db, user, classId) {
  const classSnap = await db.collection("classes").doc(classId).get();
  if (!classSnap.exists || classSnap.data().active !== true) throw new Error("NOT_FOUND");
  if (user.role === "teacher") await requireClassTeachingAssignment(db, user, classId);
  else if (user.role !== "admin") throw new Error("FORBIDDEN");
}

export async function visibleClassIds(db, user) {
  if (user.role === "admin") return null;
  const type = user.role === "teacher" ? "teacher" : "student";
  const access = await db.collection("classAccess").where("userUid", "==", user.uid)
    .where("accessType", "==", type).where("active", "==", true).limit(100).get();
  const ids = [...new Set(access.docs.map((doc) => doc.data().classId).filter(Boolean))];
  // A historical/active classAccess row must not keep notices visible after
  // the class itself has been deactivated. Apply this to both student and
  // teacher audiences; teacher assignment checks alone do not check class state.
  const activeIds = [];
  for (const classId of ids) {
    const classSnap = await db.collection("classes").doc(classId).get();
    if (classSnap.exists && classSnap.data().active === true) activeIds.push(classId);
  }
  if (user.role === "teacher") {
    const allowed = [];
    for (const classId of activeIds) {
      try { await requireClassTeachingAssignment(db, user, classId); allowed.push(classId); }
      catch (error) { if (error.message !== "FORBIDDEN" && error.message !== "NOT_FOUND") throw error; }
    }
    return allowed;
  }
  return activeIds;
}

/**
 * Milliseconds for ordering. Firestore Timestamps (admin SDK), their JSON form
 * {_seconds, _nanoseconds}, and ISO strings are supported; anything else sorts last.
 */
export function timeKey(value) {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value._seconds === "number") return value._seconds * 1000 + Math.floor((value._nanoseconds ?? 0) / 1e6);
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Active notices the user may read, newest first. Shared by the notice list and the dashboard. */
export async function visibleNotices(db, user) {
  const visible = await visibleClassIds(db, user);
  const snapshot = await db.collection("notices").where("active", "==", true).limit(200).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((notice) => notice.scope === "academy" ||
      (notice.scope === "class" && (visible === null || visible.includes(notice.classId))))
    .sort((a, b) => timeKey(b.createdAt) - timeKey(a.createdAt));
}

async function listNotices(request, ctx) {
  if (!["admin", "teacher", "student"].includes(ctx.user.role)) return fail("FORBIDDEN");
  const notices = await visibleNotices(ctx.db, ctx.user);
  return jsonResponse({ success: true, data: { notices } });
}

async function createNotice(request, ctx) {
  if (!["admin", "teacher"].includes(ctx.user.role)) return fail("FORBIDDEN");
  const body = await bodyOf(request);
  const checked = validate(body, true);
  if (checked.error) return fail("INVALID_INPUT", checked.error);
  const value = checked.value;
  if (ctx.user.role === "teacher" && value.scope !== "class") return fail("FORBIDDEN");
  const ref = ctx.db.collection("notices").doc();
  const auditRef = ctx.db.collection("auditLogs").doc();
  const now = ctx.serverTimestamp();
  return ctx.db.runTransaction(async (tx) => {
    if (value.scope === "class") await txAuthorizeScope(tx, ctx.db, ctx.user, value.classId);
    tx.set(ref, { ...value, active: true, createdBy: ctx.user.uid, createdByRole: ctx.user.role,
      updatedBy: ctx.user.uid, createdAt: now, updatedAt: now });
    tx.set(auditRef, { actorUid: ctx.user.uid, actorRole: ctx.user.role,
      action: "notice.created", targetType: "notice", targetId: ref.id,
      metadata: { scope: value.scope, classId: value.classId ?? null }, createdAt: now });
    return jsonResponse({ success: true, data: { id: ref.id } }, 201);
  });
}

async function updateNotice(request, ctx, id) {
  if (!["admin", "teacher"].includes(ctx.user.role)) return fail("FORBIDDEN");
  if (!ID.test(id)) return fail("INVALID_INPUT", "Invalid notice ID.");
  const ref = ctx.db.collection("notices").doc(id);
  const body = await bodyOf(request);
  const checked = validate(body, false);
  if (checked.error) return fail("INVALID_INPUT", checked.error);
  return ctx.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().active !== true) return fail("NOT_FOUND");
    const current = snap.data();
    if (current.scope === "class") await txAuthorizeScope(tx, ctx.db, ctx.user, current.classId);
    else if (ctx.user.role !== "admin") return fail("FORBIDDEN");
    const now = ctx.serverTimestamp();
    tx.update(ref, { ...checked.value, updatedBy: ctx.user.uid, updatedAt: now });
    tx.set(ctx.db.collection("auditLogs").doc(), { actorUid: ctx.user.uid, actorRole: ctx.user.role,
      action: "notice.updated", targetType: "notice", targetId: id,
      metadata: { fields: Object.keys(checked.value) }, createdAt: now });
    return jsonResponse({ success: true, data: { id } });
  });
}

async function deactivateNotice(ctx, id) {
  if (!["admin", "teacher"].includes(ctx.user.role)) return fail("FORBIDDEN");
  if (!ID.test(id)) return fail("INVALID_INPUT", "Invalid notice ID.");
  const ref = ctx.db.collection("notices").doc(id);
  return ctx.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().active !== true) return fail("NOT_FOUND");
    const current = snap.data();
    if (current.scope === "class") await txAuthorizeScope(tx, ctx.db, ctx.user, current.classId);
    else if (ctx.user.role !== "admin") return fail("FORBIDDEN");
    const now = ctx.serverTimestamp();
    tx.update(ref, { active: false, deactivatedAt: now, deactivatedBy: ctx.user.uid, updatedAt: now });
    tx.set(ctx.db.collection("auditLogs").doc(), { actorUid: ctx.user.uid, actorRole: ctx.user.role,
      action: "notice.deactivated", targetType: "notice", targetId: id,
      metadata: { scope: current.scope, classId: current.classId ?? null }, createdAt: now });
    return jsonResponse({ success: true, data: { id, active: false } });
  });
}

export async function handleNotices(request, ctx) {
  const segments = ctx.path.split("/").filter(Boolean);
  if (segments[0] !== "notices" || segments.length > 2) return fail("NOT_FOUND");
  try {
    if (segments.length === 1 && request.method === "GET") return await listNotices(request, ctx);
    if (segments.length === 1 && request.method === "POST") return await createNotice(request, ctx);
    if (segments.length === 2 && request.method === "PATCH") return await updateNotice(request, ctx, segments[1]);
    if (segments.length === 2 && request.method === "POST") return await deactivateNotice(ctx, segments[1]);
    return fail("METHOD_NOT_ALLOWED");
  } catch (error) {
    if (error.message === "FORBIDDEN" || error.message === "NOT_FOUND") return fail("NOT_FOUND");
    throw error;
  }
}
