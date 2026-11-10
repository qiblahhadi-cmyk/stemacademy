import { jsonResponse, errorResponse } from "../response.mjs";
import { API_ERRORS } from "../errors.mjs";

const fail = (code, message) => errorResponse(code, message ?? API_ERRORS[code].message, API_ERRORS[code].status);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** Complete the first-password change for an account issued by the owner-only handoff. */
export async function handleAccountActivation(request, ctx) {
  if (request.method !== "POST") return fail("METHOD_NOT_ALLOWED");
  if (!ctx.user?.mustChangePassword || !["student", "teacher"].includes(ctx.user.role)) return fail("FORBIDDEN");
  let body;
  try { body = await request.json(); } catch { return fail("INVALID_INPUT", "A JSON body is required."); }
  if (!object(body) || Object.keys(body).some((key) => key !== "password") ||
      typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128) {
    return fail("INVALID_INPUT", "Choose a password containing 12 to 128 characters.");
  }

  const userRef = ctx.db.collection("users").doc(ctx.user.uid);
  const current = await userRef.get();
  if (!current.exists || current.data().role !== ctx.user.role ||
      !(current.data().provisioningStatus === "credential_issued" && current.data().active === false) &&
      !(current.data().provisioningStatus === "active" && current.data().active === true)) return fail("ACCOUNT_DISABLED");

  // The new password is sent only over the authenticated HTTPS request. It is
  // never written to Firestore, audit metadata, logs or the response.
  await ctx.auth.updateUser(ctx.user.uid, { password: body.password });

  await ctx.db.runTransaction(async (tx) => {
    const latest = await tx.get(userRef);
    if (!latest.exists || latest.data().role !== ctx.user.role ||
        !(latest.data().provisioningStatus === "credential_issued" && latest.data().active === false) &&
        !(latest.data().provisioningStatus === "active" && latest.data().active === true)) throw new Error("ACCOUNT_DISABLED");
    const now = ctx.serverTimestamp();
    tx.update(userRef, { active: true, provisioningStatus: "active", passwordChangedAt: now, updatedAt: now });
    tx.set(ctx.db.collection("auditLogs").doc(), {
      actorUid: ctx.user.uid, actorRole: ctx.user.role,
      action: "account.initial_password_changed", targetType: "user", targetId: ctx.user.uid,
      metadata: { academyId: latest.data().academyId }, createdAt: now
    });
  });

  // If claim clearing fails, the old token remains restricted by middleware and
  // the user can retry this endpoint. Profile activation alone never bypasses it.
  const authUser = await ctx.auth.getUser(ctx.user.uid);
  const claims = { ...(authUser.customClaims ?? {}) };
  delete claims.mustChangePassword;
  await ctx.auth.setCustomUserClaims(ctx.user.uid, claims);

  return jsonResponse({ success: true, data: { activated: true, passwordChanged: true } });
}
