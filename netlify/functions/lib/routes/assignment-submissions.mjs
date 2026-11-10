import { txAuthorizeScope, requireClassAccess, requireTeachingAssignment } from "../authorization.mjs";
import { jsonResponse, errorResponse } from "../response.mjs";
import { API_ERRORS } from "../errors.mjs";
import { createHash } from "node:crypto";

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const fail = (code, message) => errorResponse(code, message ?? API_ERRORS[code].message, API_ERRORS[code].status);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const submissionId = (assignmentId, uid) => `as_${createHash("sha256").update(JSON.stringify([assignmentId, uid])).digest("hex")}`;
async function bodyOf(req) { try { return await req.json(); } catch { return undefined; } }
function missing() { return fail("NOT_FOUND", "Submission not found."); }
function safeSubmission(id, d) {
  return { id, assignmentId: d.assignmentId, studentUid: d.studentUid, text: d.text,
    status: d.status, revision: d.revision, submittedAt: d.submittedAt ?? null,
    reviewedAt: d.reviewedAt ?? null, feedback: d.feedback ?? "", grade: d.grade ?? null };
}

/** Text-only assignment submissions. No file storage or external services. */
export async function handleAssignmentSubmissions(request, ctx) {
  const parts = ctx.path.split("/").filter(Boolean);
  if (parts[0] !== "assignment-submissions" || parts.length > 3) return fail("NOT_FOUND");
  const method = request.method;

  if (parts.length === 1 && method === "POST") {
    if (ctx.user.role !== "student") return fail("FORBIDDEN");
    const body = await bodyOf(request);
    if (!isObject(body) || Object.keys(body).some(k => !["assignmentId", "text"].includes(k)) ||
        !ID.test(body.assignmentId ?? "") || typeof body.text !== "string" || !body.text.trim() || body.text.length > 20000) {
      return fail("INVALID_INPUT", "Provide an assignmentId and text of 1 to 20000 characters.");
    }
    const assignmentRef = ctx.db.collection("assignments").doc(body.assignmentId);
    const id = submissionId(body.assignmentId, ctx.user.uid);
    const ref = ctx.db.collection("assignmentSubmissions").doc(id);
    return ctx.db.runTransaction(async tx => {
      const assignmentSnap = await tx.get(assignmentRef);
      if (!assignmentSnap.exists) return missing();
      const assignment = assignmentSnap.data();
      try { await txAuthorizeScope(tx, ctx.db, ctx.user, assignment.classId, assignment.subjectId); }
      catch (e) { if (["FORBIDDEN", "NOT_FOUND"].includes(e.message)) return missing(); throw e; }
      if (assignment.publicationState !== "published") return missing();
      if (assignment.dueAt) {
        const due = typeof assignment.dueAt?.toDate === "function" ? assignment.dueAt.toDate() : new Date(assignment.dueAt);
        const nowDate = typeof ctx.now === "function" ? ctx.now() : new Date();
        if (!Number.isNaN(due.getTime()) && nowDate.getTime() > due.getTime()) return fail("CONFLICT", "The submission deadline has passed.");
      }
      const existingSnap = await tx.get(ref);
      const existing = existingSnap.exists ? existingSnap.data() : null;
      if (existing?.status === "graded") return fail("CONFLICT", "A graded submission cannot be changed.");
      const now = ctx.serverTimestamp();
      const revision = (existing?.revision ?? 0) + 1;
      const data = { assignmentId: body.assignmentId, classId: assignment.classId, subjectId: assignment.subjectId,
        studentUid: ctx.user.uid, text: body.text.trim(), status: "submitted", revision,
        submittedAt: now, updatedAt: now, reviewedAt: null, reviewedBy: null, feedback: "", grade: null };
      tx.set(ref, data);
      tx.set(ctx.db.collection("assignmentSubmissionRevisions").doc(), { submissionId: id, assignmentId: body.assignmentId,
        studentUid: ctx.user.uid, revision, text: data.text, submittedAt: now, action: existing ? "resubmitted" : "submitted" });
      tx.set(ctx.db.collection("auditLogs").doc(), { actorUid: ctx.user.uid, actorRole: ctx.user.role,
        action: existing ? "assignment.submission.resubmitted" : "assignment.submission.created",
        targetType: "assignmentSubmission", targetId: id, metadata: { assignmentId: body.assignmentId, revision }, createdAt: now });
      return jsonResponse({ success: true, data: { submission: safeSubmission(id, data) } }, existing ? 200 : 201);
    });
  }

  if (parts.length === 1 && method === "GET") {
    const assignmentId = new URL(request.url).searchParams.get("assignmentId");
    if (!ID.test(assignmentId ?? "")) return fail("INVALID_INPUT", "A valid assignmentId is required.");
    const assignmentSnap = await ctx.db.collection("assignments").doc(assignmentId).get();
    if (!assignmentSnap.exists) return missing();
    const assignment = assignmentSnap.data();
    // Draft assignments are invisible to students; answer exactly as for a missing record.
    if (ctx.user.role === "student" && !["published", "closed"].includes(assignment.publicationState)) return missing();
    try {
      if (ctx.user.role === "student") await requireClassAccess(ctx.db, ctx.user, assignment.classId, "student");
      else if (ctx.user.role === "teacher") await requireTeachingAssignment(ctx.db, ctx.user, assignment.classId, assignment.subjectId);
      else if (ctx.user.role !== "admin") return fail("FORBIDDEN");
      const [classSnap, subjectSnap] = await Promise.all([
        ctx.db.collection("classes").doc(assignment.classId).get(),
        ctx.db.collection("subjects").doc(assignment.subjectId).get()
      ]);
      if (!classSnap.exists || !subjectSnap.exists || classSnap.data().active !== true || subjectSnap.data().active !== true || classSnap.data().grade !== subjectSnap.data().grade) return missing();
    } catch (e) { if (["FORBIDDEN", "NOT_FOUND"].includes(e.message)) return missing(); throw e; }
    if (ctx.user.role === "student") {
      const id = submissionId(assignmentId, ctx.user.uid);
      const snap = await ctx.db.collection("assignmentSubmissions").doc(id).get();
      return jsonResponse({ success: true, data: { submissions: snap.exists ? [safeSubmission(id, snap.data())] : [] } });
    }
    const snap = await ctx.db.collection("assignmentSubmissions").where("assignmentId", "==", assignmentId).limit(500).get();
    return jsonResponse({ success: true, data: { submissions: snap.docs.map(d => safeSubmission(d.id, d.data())) } });
  }

  if (parts.length === 3 && parts[2] === "review" && method === "PATCH") {
    if (!ID.test(parts[1])) return fail("INVALID_INPUT", "Invalid submission ID.");
    if (!["teacher", "admin"].includes(ctx.user.role)) return fail("FORBIDDEN");
    const body = await bodyOf(request);
    if (!isObject(body) || Object.keys(body).some(k => !["feedback", "grade"].includes(k)) ||
        ("feedback" in body && (typeof body.feedback !== "string" || body.feedback.length > 5000)) ||
        ("grade" in body && !(typeof body.grade === "number" && Number.isFinite(body.grade) && body.grade >= 0 && body.grade <= 100)) ||
        !Object.keys(body).length) return fail("INVALID_INPUT", "Provide feedback (up to 5000 characters) and/or a grade from 0 to 100.");
    const ref = ctx.db.collection("assignmentSubmissions").doc(parts[1]);
    return ctx.db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return missing();
      const current = snap.data();
      const assignmentSnap = await tx.get(ctx.db.collection("assignments").doc(current.assignmentId));
      if (!assignmentSnap.exists || assignmentSnap.data().classId !== current.classId || assignmentSnap.data().subjectId !== current.subjectId) return missing();
      try { await txAuthorizeScope(tx, ctx.db, ctx.user, current.classId, current.subjectId); }
      catch (e) { if (["FORBIDDEN", "NOT_FOUND"].includes(e.message)) return missing(); throw e; }
      const now = ctx.serverTimestamp();
      const patch = { updatedAt: now, reviewedAt: now, reviewedBy: ctx.user.uid };
      if ("feedback" in body) patch.feedback = body.feedback.trim();
      if ("grade" in body) patch.grade = body.grade;
      if ("grade" in body) patch.status = "graded";
      tx.update(ref, patch);
      tx.set(ctx.db.collection("auditLogs").doc(), { actorUid: ctx.user.uid, actorRole: ctx.user.role,
        action: "assignment.submission.reviewed", targetType: "assignmentSubmission", targetId: parts[1],
        metadata: { assignmentId: current.assignmentId, changedFields: Object.keys(body) }, createdAt: now });
      return jsonResponse({ success: true, data: { submission: safeSubmission(parts[1], { ...current, ...patch }) } });
    });
  }
  return fail("NOT_FOUND");
}
