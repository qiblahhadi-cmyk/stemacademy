import { jsonResponse, errorResponse } from "../response.mjs";
import { API_ERRORS } from "../errors.mjs";

const fail = (code, message) => errorResponse(code, message ?? API_ERRORS[code].message, API_ERRORS[code].status);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const EDITABLE_FIELDS = ["displayName"];
const CONTROL_CHARACTERS = /\p{Cc}/u;

async function readJson(request) {
  try { return await request.json(); } catch { return undefined; }
}

/** Validates the one editable field. Returns { value } or { error }. */
export function validateProfileUpdate(input) {
  if (!isObject(input)) return { error: "A JSON object is required." };
  if (Object.keys(input).some((key) => !EDITABLE_FIELDS.includes(key))) {
    return { error: "Only displayName can be changed here." };
  }
  if (!("displayName" in input)) return { error: "displayName is required." };
  if (typeof input.displayName !== "string") return { error: "Display name must be text." };
  const value = input.displayName.trim();
  if (value.length < 2 || value.length > 60) return { error: "Display name must contain 2 to 60 characters." };
  if (CONTROL_CHARACTERS.test(value)) return { error: "Display name contains unsupported characters." };
  return { value };
}

/**
 * PATCH /me. The signed-in user can change only their own display name. The UID
 * comes from the verified token, never from the request. Role, active status,
 * academy ID and provisioning fields cannot be reached from this route.
 */
export async function handleOwnProfile(request, ctx) {
  if (request.method !== "PATCH") return fail("METHOD_NOT_ALLOWED");
  const checked = validateProfileUpdate(await readJson(request));
  if (checked.error) return fail("INVALID_INPUT", checked.error);

  const ref = ctx.db.collection("users").doc(ctx.user.uid);
  const auditRef = ctx.db.collection("auditLogs").doc();
  return ctx.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().active !== true) return fail("NOT_FOUND");
    const now = ctx.serverTimestamp();
    tx.update(ref, { displayName: checked.value, updatedAt: now });
    tx.set(auditRef, {
      actorUid: ctx.user.uid, actorRole: ctx.user.role,
      action: "profile.displayName.updated", targetType: "user", targetId: ctx.user.uid,
      metadata: { fields: ["displayName"] }, createdAt: now
    });
    return jsonResponse({ success: true, data: { displayName: checked.value } });
  });
}
