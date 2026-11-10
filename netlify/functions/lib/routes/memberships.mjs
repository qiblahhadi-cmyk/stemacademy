import { classAccessDocumentId } from "../authorization.mjs";
import { jsonResponse, errorResponse } from "../response.mjs";
import { API_ERRORS } from "../errors.mjs";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const fail = (code, message) => errorResponse(code, message ?? API_ERRORS[code].message, API_ERRORS[code].status);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

async function readJson(request) {
  try { return await request.json(); } catch { return undefined; }
}

/** Admin-only, transactional student/class membership management. */
export async function handleMemberships(request, ctx) {
  if (ctx.user?.role !== "admin") return fail("FORBIDDEN");
  const segments = ctx.path.split("/").filter(Boolean);
  if (segments[0] !== "memberships") return fail("NOT_FOUND");

  if (segments.length === 1 && request.method === "GET") {
    const params = new URL(request.url).searchParams;
    const classId = params.get("classId");
    const studentUid = params.get("studentUid");
    if (classId && !ID.test(classId)) return fail("INVALID_INPUT", "A valid classId is required.");
    if (studentUid && !ID.test(studentUid)) return fail("INVALID_INPUT", "A valid studentUid is required.");
    let query = ctx.db.collection("classAccess").where("accessType", "==", "student").limit(500);
    if (classId) query = query.where("classId", "==", classId);
    if (studentUid) query = query.where("userUid", "==", studentUid);
    const snapshot = await query.get();
    return jsonResponse({ success: true, data: { memberships: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) } });
  }

  if (segments.length === 1 && request.method === "POST") {
    const body = await readJson(request);
    if (!isObject(body) || Object.keys(body).some((key) => !["classId", "studentUid"].includes(key)) ||
        !ID.test(body.classId ?? "") || !ID.test(body.studentUid ?? "")) {
      return fail("INVALID_INPUT", "Provide a valid classId and studentUid.");
    }
    const { classId, studentUid } = body;
    const membershipId = classAccessDocumentId(classId, studentUid, "student");
    const membershipRef = ctx.db.collection("classAccess").doc(membershipId);
    const classRef = ctx.db.collection("classes").doc(classId);
    const studentRef = ctx.db.collection("users").doc(studentUid);

    return ctx.db.runTransaction(async (tx) => {
      const [membershipSnap, classSnap, studentSnap] = await Promise.all([
        tx.get(membershipRef), tx.get(classRef), tx.get(studentRef)
      ]);
      if (!classSnap.exists || classSnap.data().active !== true) return fail("NOT_FOUND", "Active class not found.");
      if (!studentSnap.exists || studentSnap.data().active !== true || studentSnap.data().role !== "student") {
        return fail("INVALID_INPUT", "An active student account is required.");
      }
      if (membershipSnap.exists && membershipSnap.data().active === true) {
        return fail("CONFLICT", "The student is already enrolled in this class.");
      }

      const now = ctx.serverTimestamp();
      const membership = {
        classId, userUid: studentUid, accessType: "student", active: true,
        createdAt: membershipSnap.exists ? membershipSnap.data().createdAt ?? now : now,
        updatedAt: now, createdBy: membershipSnap.exists ? membershipSnap.data().createdBy ?? ctx.user.uid : ctx.user.uid
      };
      tx.set(membershipRef, membership);
      const historyRef = ctx.db.collection("membershipHistory").doc();
      tx.set(historyRef, {
        membershipId, classId, userUid: studentUid, accessType: "student",
        action: membershipSnap.exists ? "membership.reactivated" : "membership.enrolled",
        actorUid: ctx.user.uid, actorRole: ctx.user.role, createdAt: now
      });
      tx.set(ctx.db.collection("auditLogs").doc(), {
        actorUid: ctx.user.uid, actorRole: ctx.user.role,
        action: membershipSnap.exists ? "membership.reactivated" : "membership.enrolled",
        targetType: "classAccess", targetId: membershipId,
        metadata: { classId, studentUid }, createdAt: now
      });
      return jsonResponse({ success: true, data: { membershipId, active: true } }, membershipSnap.exists ? 200 : 201);
    });
  }

  if (segments.length === 4 && segments[3] === "deactivate" && request.method === "POST") {
    const [classId, studentUid] = segments.slice(1, 3);
    if (!ID.test(classId) || !ID.test(studentUid)) return fail("INVALID_INPUT", "Invalid membership identifier.");
    const membershipId = classAccessDocumentId(classId, studentUid, "student");
    const membershipRef = ctx.db.collection("classAccess").doc(membershipId);
    return ctx.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(membershipRef);
      if (!snapshot.exists) return fail("NOT_FOUND", "Membership not found.");
      const current = snapshot.data();
      if (current.classId !== classId || current.userUid !== studentUid || current.accessType !== "student") {
        return fail("NOT_FOUND", "Membership not found.");
      }
      if (current.active !== true) return fail("CONFLICT", "Membership is already inactive.");
      const now = ctx.serverTimestamp();
      tx.update(membershipRef, { active: false, updatedAt: now, deactivatedAt: now, deactivatedBy: ctx.user.uid });
      tx.set(ctx.db.collection("membershipHistory").doc(), {
        membershipId, classId, userUid: studentUid, accessType: "student",
        action: "membership.deactivated", actorUid: ctx.user.uid, actorRole: ctx.user.role, createdAt: now
      });
      tx.set(ctx.db.collection("auditLogs").doc(), {
        actorUid: ctx.user.uid, actorRole: ctx.user.role, action: "membership.deactivated",
        targetType: "classAccess", targetId: membershipId,
        metadata: { classId, studentUid }, createdAt: now
      });
      return jsonResponse({ success: true, data: { membershipId, active: false } });
    });
  }

  return fail("NOT_FOUND", "Membership endpoint not found.");
}
