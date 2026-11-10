import { createHash } from "node:crypto";
import { requireClassAccess, classAccessDocumentId, txAuthorizeScope } from "../authorization.mjs";
import { authorizeClassSubject } from "./scope.mjs";
import { jsonResponse, errorResponse } from "../response.mjs";
import { API_ERRORS } from "../errors.mjs";

/*
 * Assessments (MCQ), per docs/ROLE_PERMISSION_MATRIX.md sections 2, 4 and 11.
 * - Staff create and edit drafts, then publish and close. Questions and answer
 *   keys are locked once published.
 * - Answer keys live in assessmentAnswerKeys/{assessmentId}; no student-facing
 *   response includes them.
 * - Students start one attempt (more only after a teacher approves a retake),
 *   within the opening window and before the earlier of closing time or the
 *   time limit. Submissions after the deadline are refused and the attempt expires.
 * - Marks stay hidden from students until results are approved and then released.
 *   Approval and release are separate, audited steps.
 */

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const TYPES = new Set(["quiz", "class_test", "monthly_test"]);
const META_FIELDS = ["title", "assessmentType", "instructions", "durationMinutes", "opensAt", "closesAt"];
const ISO_WITH_TIMEZONE = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?(Z|[+-]\d\d:\d\d)$/;
const MAX_QUESTIONS = 50;
const MAX_OPTIONS = 6;
const LIST_LIMIT = 100;
const BOUNDED = 500;

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isStaff = (user) => user.role === "admin" || user.role === "teacher";

function fail(code, message) {
  const details = API_ERRORS[code];
  return errorResponse(code, message ?? details.message, details.status);
}

const notFound = () => fail("NOT_FOUND", "Resource not found.");

function digest(...parts) {
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

export const resultRecordId = (assessmentId, studentUid) => digest("result", assessmentId, studentUid);
export const attemptRecordId = (assessmentId, studentUid, number) =>
  digest("attempt", assessmentId, studentUid, String(number));

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function instantOrError(value) {
  if (typeof value !== "string" || !ISO_WITH_TIMEZONE.test(value) || Number.isNaN(Date.parse(value))) {
    return { error: "Dates must be ISO timestamps with an explicit timezone." };
  }
  return { value: new Date(value).toISOString() };
}

/** Validates question content. Question IDs are assigned by the server (q1, q2, ...). */
export function validateQuestions(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_QUESTIONS) {
    return { error: `Provide between 1 and ${MAX_QUESTIONS} questions.` };
  }

  const questions = [];
  const answers = {};
  let totalMarks = 0;
  // At most 50 questions of at most 10 marks each, so totals are bounded by 500 without a separate cap.

  for (let index = 0; index < input.length; index += 1) {
    const q = input[index];
    if (!isObject(q) || Object.keys(q).some((k) => !["text", "options", "correctIndex", "marks"].includes(k))) {
      return { error: "Each question may contain only text, options, correctIndex and marks." };
    }

    const text = typeof q.text === "string" ? q.text.trim() : "";
    if (text.length < 1 || text.length > 500) return { error: "Question text must contain 1 to 500 characters." };

    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > MAX_OPTIONS) {
      return { error: "Each question needs 2 to 6 options." };
    }
    const options = q.options.map((o) => (typeof o === "string" ? o.trim() : ""));
    if (options.some((o) => o.length < 1 || o.length > 200)) {
      return { error: "Each option must contain 1 to 200 characters." };
    }

    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= options.length) {
      return { error: "Each question needs a valid correct option." };
    }
    if (!Number.isInteger(q.marks) || q.marks < 1 || q.marks > 10) {
      return { error: "Marks per question must be a whole number from 1 to 10." };
    }

    const id = `q${index + 1}`;
    questions.push({ id, text, options, marks: q.marks });
    answers[id] = q.correctIndex;
    totalMarks += q.marks;
  }

  return { questions, answers, totalMarks };
}

/** Validates assessment metadata. Returns only the fields supplied (plus defaults on create). */
export function validateAssessmentMeta(input, mode) {
  if (!isObject(input)) return { error: "A JSON object is required." };

  const allowed = new Set([...META_FIELDS, "questions", ...(mode === "create" ? ["classId", "subjectId"] : [])]);
  if (Object.keys(input).some((k) => !allowed.has(k))) return { error: "The request contains unsupported fields." };
  if (mode === "update" && Object.keys(input).length === 0) return { error: "No changes were provided." };

  const value = {};

  if (mode === "create") {
    value.instructions = "";
    value.durationMinutes = null;
    value.opensAt = null;
    value.closesAt = null;
  }

  if (mode === "create" || "title" in input) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (title.length < 2 || title.length > 160) return { error: "Title must contain 2 to 160 characters." };
    value.title = title;
  }

  if (mode === "create" || "assessmentType" in input) {
    if (!TYPES.has(input.assessmentType)) return { error: "Type must be quiz, class_test or monthly_test." };
    value.assessmentType = input.assessmentType;
  }

  if ("instructions" in input) {
    if (typeof input.instructions !== "string" || input.instructions.length > 2000) {
      return { error: "Instructions must be text of at most 2000 characters." };
    }
    value.instructions = input.instructions.trim();
  }

  if ("durationMinutes" in input) {
    const d = input.durationMinutes;
    if (d !== null && (!Number.isInteger(d) || d < 1 || d > 480)) {
      return { error: "Time limit must be a whole number of minutes from 1 to 480, or empty for no limit." };
    }
    value.durationMinutes = d;
  }

  for (const field of ["opensAt", "closesAt"]) {
    if (field in input) {
      if (input[field] === null) {
        value[field] = null;
      } else {
        const parsed = instantOrError(input[field]);
        if (parsed.error) return parsed;
        value[field] = parsed.value;
      }
    }
  }

  if (mode === "create") {
    if (!ID_PATTERN.test(input.classId ?? "")) return { error: "A valid classId is required." };
    if (!ID_PATTERN.test(input.subjectId ?? "")) return { error: "A valid subjectId is required." };
    value.classId = input.classId;
    value.subjectId = input.subjectId;
  }

  if (value.opensAt && value.closesAt && value.closesAt <= value.opensAt) {
    return { error: "The closing time must be after the opening time." };
  }

  return { value };
}

function toIsoOrNull(value) {
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return value;
  return null;
}

/** Student-facing attempt summary. Scores appear only once released. */
function attemptSummary(result) {
  const status = result?.openAttemptId ? "in_progress"
    : result?.state === "released" ? "released"
    : result?.state ? "submitted"
    : result?.attemptsUsed > 0 ? "not_submitted"
    : "not_started";
  return {
    status,
    attemptsRemaining: result ? Math.max(0, result.attemptsAllowed - result.attemptsUsed) : 1,
    score: result?.state === "released" ? result.score : null,
    maxScore: result?.state === "released" ? result.maxScore : null
  };
}

/** Whether students can start now: "upcoming", "open" or "closed". */
export function availabilityWindow(data, now) {
  if (data.closesAt && now >= new Date(data.closesAt)) return "closed";
  if (data.opensAt && now < new Date(data.opensAt)) return "upcoming";
  return "open";
}

/** Summary for listings. Never includes questions or answers. */
function toSummary(id, data) {
  return {
    id,
    title: data.title,
    assessmentType: data.assessmentType,
    classId: data.classId,
    subjectId: data.subjectId,
    publicationState: data.publicationState,
    opensAt: data.opensAt ?? null,
    closesAt: data.closesAt ?? null,
    durationMinutes: data.durationMinutes ?? null,
    totalMarks: data.totalMarks ?? 0,
    questionCount: Array.isArray(data.questions) ? data.questions.length : 0
  };
}

/** Student-facing detail: no questions, no answers, no marks unless released. */
function toStudentDetail(id, data, result) {
  return {
    ...toSummary(id, data),
    instructions: data.instructions || "",
    attempt: result
  };
}

/** Staff detail: includes questions. Answer keys are added by the caller. */
function toStaffDetail(id, data, answers) {
  return {
    ...toSummary(id, data),
    instructions: data.instructions || "",
    publishedAt: toIsoOrNull(data.publishedAt),
    questions: (data.questions ?? []).map((q) => ({
      id: q.id,
      text: q.text,
      options: q.options,
      marks: q.marks,
      correctIndex: answers?.[q.id] ?? null
    }))
  };
}

function auditEntry(user, action, targetId, metadata, now) {
  return {
    actorUid: user.uid,
    actorRole: user.role,
    action,
    targetType: "assessment",
    targetId,
    metadata,
    createdAt: now
  };
}

async function loadAssessment(db, id) {
  const snapshot = await db.collection("assessments").doc(id).get();
  return snapshot.exists ? snapshot.data() : null;
}

/** Runs apply() inside a transaction after checking the stored record's scope. */
async function withScopedAssessment(ctx, id, apply) {
  const ref = ctx.db.collection("assessments").doc(id);
  return ctx.db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return notFound();
    const current = snapshot.data();
    try {
      await txAuthorizeScope(tx, ctx.db, ctx.user, current.classId, current.subjectId);
    } catch (error) {
      if (error.message === "FORBIDDEN" || error.message === "NOT_FOUND") return notFound();
      throw error;
    }
    return apply({ tx, ref, current });
  });
}

async function listAssessments(request, ctx) {
  const url = new URL(request.url);
  const classId = url.searchParams.get("classId");
  const subjectId = url.searchParams.get("subjectId");
  if (!ID_PATTERN.test(classId ?? "") || !ID_PATTERN.test(subjectId ?? "")) {
    return fail("INVALID_INPUT", "classId and subjectId are required.");
  }

  await authorizeClassSubject(ctx.db, ctx.user, classId, subjectId);

  let query = ctx.db.collection("assessments")
    .where("classId", "==", classId)
    .where("subjectId", "==", subjectId);
  if (ctx.user.role === "student") {
    query = query.where("publicationState", "in", ["published", "closed"]);
  }
  const snapshot = await query.orderBy("createdAt", "desc").limit(LIST_LIMIT).get();

  return jsonResponse({
    success: true,
    data: { assessments: snapshot.docs.map((doc) => toSummary(doc.id, doc.data())) }
  });
}

async function createAssessment(request, ctx) {
  const body = await readJson(request);
  if (body === undefined) return fail("INVALID_INPUT", "Valid JSON is required.");
  const meta = validateAssessmentMeta(body, "create");
  if (meta.error) return fail("INVALID_INPUT", meta.error);

  let questions = { questions: [], answers: {}, totalMarks: 0 };
  if (body.questions !== undefined) {
    const parsed = validateQuestions(body.questions);
    if (parsed.error) return fail("INVALID_INPUT", parsed.error);
    questions = parsed;
  }

  const ref = ctx.db.collection("assessments").doc();
  return ctx.db.runTransaction(async (tx) => {
    try {
      await txAuthorizeScope(tx, ctx.db, ctx.user, meta.value.classId, meta.value.subjectId);
    } catch (error) {
      if (error.message === "FORBIDDEN" || error.message === "NOT_FOUND") return notFound();
      throw error;
    }
    const now = ctx.serverTimestamp();
    tx.set(ref, {
      ...meta.value, questions: questions.questions, totalMarks: questions.totalMarks,
      publicationState: "draft", createdBy: ctx.user.uid, createdAt: now, updatedAt: now
    });
    tx.set(ctx.db.collection("assessmentAnswerKeys").doc(ref.id), { answers: questions.answers });
    tx.set(ctx.db.collection("auditLogs").doc(), auditEntry(ctx.user, "assessment.created", ref.id, {
      classId: meta.value.classId, subjectId: meta.value.subjectId,
      questionCount: questions.questions.length
    }, now));
    return jsonResponse({ success: true, data: { id: ref.id, publicationState: "draft" } }, 201);
  });
}

async function updateAssessment(request, ctx, id) {
  const body = await readJson(request);
  if (body === undefined) return fail("INVALID_INPUT", "Valid JSON is required.");
  const meta = validateAssessmentMeta(body, "update");
  if (meta.error) return fail("INVALID_INPUT", meta.error);

  let questions = null;
  if (body.questions !== undefined) {
    const parsed = validateQuestions(body.questions);
    if (parsed.error) return fail("INVALID_INPUT", parsed.error);
    questions = parsed;
  }

  return withScopedAssessment(ctx, id, ({ tx, ref, current }) => {
    if (current.publicationState === "closed") {
      return fail("CONFLICT", "Closed assessments cannot be edited.");
    }

    const lockedPublished = current.publicationState === "published";
    const changesLocked = Object.keys(meta.value).some((k) => !["title", "instructions"].includes(k));
    if (lockedPublished && (changesLocked || questions)) {
      return fail("CONFLICT", "Dates, time limit and questions are locked once an assessment is published.");
    }

    const merged = { ...current, ...meta.value };
    if (merged.opensAt && merged.closesAt && merged.closesAt <= merged.opensAt) {
      return fail("INVALID_INPUT", "The closing time must be after the opening time.");
    }

    const now = ctx.serverTimestamp();
    const patch = { ...meta.value, updatedAt: now };
    if (questions) {
      patch.questions = questions.questions;
      patch.totalMarks = questions.totalMarks;
      tx.set(ctx.db.collection("assessmentAnswerKeys").doc(id), { answers: questions.answers });
    }
    tx.update(ref, patch);
    tx.set(ctx.db.collection("auditLogs").doc(), auditEntry(ctx.user, "assessment.updated", id, {
      classId: current.classId,
      subjectId: current.subjectId,
      changedFields: Object.keys(body)
    }, now));

    return jsonResponse({ success: true, data: { id, updated: true } });
  });
}

async function transitionAssessment(ctx, id, { from, to }, now) {
  return withScopedAssessment(ctx, id, ({ tx, ref, current }) => {
    if (current.publicationState !== from) {
      return fail("CONFLICT", `Assessment must be ${from} before it can be ${to}.`);
    }

    if (to === "published") {
      if (!Array.isArray(current.questions) || current.questions.length === 0) {
        return fail("CONFLICT", "Add at least one question before publishing.");
      }
      if (current.closesAt && Date.parse(current.closesAt) <= now.getTime()) {
        return fail("CONFLICT", "The closing time has already passed.");
      }
    }

    const stamp = to === "published" ? { publishedBy: ctx.user.uid, publishedAt: now.toISOString() }
      : { closedBy: ctx.user.uid, closedAt: now.toISOString() };
    const action = to === "published" ? "assessment.published" : "assessment.closed";

    tx.update(ref, { publicationState: to, ...stamp, updatedAt: now.toISOString() });
    tx.set(ctx.db.collection("auditLogs").doc(), auditEntry(ctx.user, action, id, {
      classId: current.classId,
      subjectId: current.subjectId,
      fromState: from,
      toState: to
    }, now.toISOString()));

    return jsonResponse({ success: true, data: { id, publicationState: to } });
  });
}

async function getAssessment(ctx, id) {
  const data = await loadAssessment(ctx.db, id);
  if (!data) return notFound();

  if (ctx.user.role === "student") {
    if (data.publicationState === "draft") return notFound();
    try {
      await requireClassAccess(ctx.db, ctx.user, data.classId, "student");
      await authorizeClassSubject(ctx.db, ctx.user, data.classId, data.subjectId);
    } catch (error) {
      if (error.message === "FORBIDDEN" || error.message === "NOT_FOUND") return notFound();
      throw error;
    }

    const resultSnap = await ctx.db.collection("assessmentResults").doc(resultRecordId(id, ctx.user.uid)).get();
    const attempt = attemptSummary(resultSnap.exists ? resultSnap.data() : null);
    attempt.window = availabilityWindow(data, ctx.now());

    return jsonResponse({ success: true, data: { assessment: toStudentDetail(id, data, attempt) } });
  }

  try {
    await authorizeClassSubject(ctx.db, ctx.user, data.classId, data.subjectId);
  } catch (error) {
    if (error.message === "FORBIDDEN" || error.message === "NOT_FOUND") return notFound();
    throw error;
  }
  const keySnap = await ctx.db.collection("assessmentAnswerKeys").doc(id).get();
  const answers = keySnap.exists ? keySnap.data().answers : {};
  return jsonResponse({ success: true, data: { assessment: toStaffDetail(id, data, answers) } });
}

/** Published and closed assessments in every class the student belongs to, with their own status. */
async function listMine(ctx) {
  if (ctx.user.role !== "student") return fail("FORBIDDEN");
  const uid = ctx.user.uid;
  const now = ctx.now();

  const access = await ctx.db.collection("classAccess")
    .where("userUid", "==", uid)
    .where("accessType", "==", "student")
    .where("active", "==", true)
    .limit(50)
    .get();
  const classIds = [...new Set(access.docs.map((d) => d.data().classId).filter(Boolean))];

  const classSnaps = await Promise.all(classIds.map((cid) => ctx.db.collection("classes").doc(cid).get()));
  const classes = new Map(classSnaps.filter((c) => c.exists && c.data().active === true)
    .map((c) => [c.id, c.data()]));

  const lists = await Promise.all([...classes.keys()].map((cid) => ctx.db.collection("assessments")
    .where("classId", "==", cid)
    .where("publicationState", "in", ["published", "closed"])
    .limit(LIST_LIMIT)
    .get()));
  const found = lists.flatMap((l) => l.docs.map((d) => ({ id: d.id, data: d.data() })));

  const subjectIds = [...new Set(found.map((f) => f.data.subjectId))];
  const subjectSnaps = await Promise.all(subjectIds.map((sid) => ctx.db.collection("subjects").doc(sid).get()));
  const subjects = new Map(subjectSnaps.filter((s) => s.exists && s.data().active === true)
    .map((s) => [s.id, s.data()]));

  const results = await ctx.db.collection("assessmentResults")
    .where("studentUid", "==", uid)
    .limit(BOUNDED)
    .get();
  const byAssessment = new Map(results.docs.map((d) => [d.data().assessmentId, d.data()]));

  const items = found
    .filter((f) => subjects.has(f.data.subjectId))
    .map((f) => ({
      ...toSummary(f.id, f.data),
      className: classes.get(f.data.classId).name,
      subjectName: subjects.get(f.data.subjectId).name,
      window: availabilityWindow(f.data, now),
      attempt: attemptSummary(byAssessment.get(f.id) ?? null)
    }))
    .sort((a, b) => (a.closesAt ?? "9999").localeCompare(b.closesAt ?? "9999"));

  return jsonResponse({ success: true, data: { assessments: items } });
}

/** Staff: the student's latest attempt with each answer compared to the key. */
async function reviewAttempt(ctx, id, studentUid) {
  const data = await loadAssessment(ctx.db, id);
  if (!data) return notFound();
  try {
    await authorizeClassSubject(ctx.db, ctx.user, data.classId, data.subjectId);
  } catch (error) {
    if (error.message === "FORBIDDEN" || error.message === "NOT_FOUND") return notFound();
    throw error;
  }

  const resultSnap = await ctx.db.collection("assessmentResults").doc(resultRecordId(id, studentUid)).get();
  const latestId = resultSnap.exists ? resultSnap.data().latestAttemptId : null;
  const attemptSnap = latestId ? await ctx.db.collection("assessmentAttempts").doc(latestId).get() : null;
  if (!attemptSnap?.exists || attemptSnap.data().status !== "submitted") {
    return fail("NOT_FOUND", "No submitted attempt for this student.");
  }
  const keySnap = await ctx.db.collection("assessmentAnswerKeys").doc(id).get();
  const key = keySnap.exists ? keySnap.data().answers : {};
  const attempt = attemptSnap.data();
  const given = attempt.answers ?? {};

  return jsonResponse({
    success: true,
    data: {
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      score: attempt.score,
      maxScore: attempt.maxScore,
      answers: (data.questions ?? []).map((q) => ({
        questionId: q.id,
        text: q.text,
        options: q.options,
        marks: q.marks,
        chosenIndex: given[q.id] ?? null,
        correctIndex: key[q.id],
        correct: given[q.id] === key[q.id]
      }))
    }
  });
}

/**
 * Staff: reopen an expired attempt after a documented technical problem. The attempt
 * keeps its history (a reopenings list), its deadline is recalculated within the
 * closing time, and marks are not changed.
 */
async function reopenAttempt(request, ctx, id) {
  const body = await readJson(request);
  if (body === undefined) return fail("INVALID_INPUT", "Valid JSON is required.");
  if (!isObject(body) || Object.keys(body).some((k) => !["studentUid", "reason"].includes(k))) {
    return fail("INVALID_INPUT", "The request contains unsupported fields.");
  }
  if (!UID_PATTERN.test(body.studentUid ?? "")) return fail("INVALID_INPUT", "A valid studentUid is required.");
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 3 || reason.length > 300) {
    return fail("INVALID_INPUT", "Describe the technical problem in 3 to 300 characters.");
  }

  return withScopedAssessment(ctx, id, async ({ tx, current }) => {
    if (current.publicationState !== "published") return fail("CONFLICT", "Only published assessments can be reopened.");

    const resultRef = ctx.db.collection("assessmentResults").doc(resultRecordId(id, body.studentUid));
    const resultSnap = await tx.get(resultRef);
    if (!resultSnap.exists || !resultSnap.data().latestAttemptId) {
      return fail("CONFLICT", "This student has no attempt to reopen.");
    }
    const result = resultSnap.data();
    const attemptRef = ctx.db.collection("assessmentAttempts").doc(result.latestAttemptId);
    const attemptSnap = await tx.get(attemptRef);
    if (!attemptSnap.exists) return fail("CONFLICT", "This student has no attempt to reopen.");
    const attempt = attemptSnap.data();

    const now = ctx.now();
    const nowIso = now.toISOString();
    const expiredNow = attempt.status === "in_progress" && now >= new Date(attempt.deadline);
    if (attempt.status !== "expired" && !expiredNow) {
      return fail("CONFLICT", "Only an attempt that has expired can be reopened.");
    }
    if (current.closesAt && now >= new Date(current.closesAt)) {
      return fail("CONFLICT", "The assessment has closed, so the attempt cannot be reopened.");
    }

    const durationEnd = current.durationMinutes ? now.getTime() + current.durationMinutes * 60000 : Infinity;
    const closeEnd = current.closesAt ? Date.parse(current.closesAt) : Infinity;
    const deadline = new Date(Math.min(durationEnd, closeEnd)).toISOString();

    tx.update(attemptRef, {
      status: "in_progress",
      deadline,
      reopenings: [...(attempt.reopenings ?? []), { by: ctx.user.uid, at: nowIso, reason }]
    });
    tx.update(resultRef, { openAttemptId: attemptRef.id, updatedAt: nowIso });
    tx.set(ctx.db.collection("auditLogs").doc(), auditEntry(ctx.user, "assessment.attempt_reopened", id, {
      classId: current.classId,
      subjectId: current.subjectId,
      attemptNumber: attempt.attemptNumber
    }, nowIso));

    return jsonResponse({ success: true, data: { reopened: true, deadline } });
  });
}

async function startAttempt(ctx, id) {
  if (ctx.user.role !== "student") return fail("FORBIDDEN");
  const initial = await loadAssessment(ctx.db, id);
  if (!initial || initial.publicationState === "draft") return notFound();

  const now = ctx.now();
  const nowIso = now.toISOString();
  const assessmentRef = ctx.db.collection("assessments").doc(id);
  const resultRef = ctx.db.collection("assessmentResults").doc(resultRecordId(id, ctx.user.uid));

  return ctx.db.runTransaction(async (tx) => {
    const assessmentSnap = await tx.get(assessmentRef);
    if (!assessmentSnap.exists) return notFound();
    const data = assessmentSnap.data();
    if (data.publicationState === "draft") return notFound();
    try {
      await txAuthorizeScope(tx, ctx.db, ctx.user, data.classId, data.subjectId);
    } catch (error) {
      if (error.message === "FORBIDDEN" || error.message === "NOT_FOUND") return notFound();
      throw error;
    }
    if (data.opensAt && now < new Date(data.opensAt)) return fail("CONFLICT", "This assessment has not opened yet.");
    if (data.closesAt && now >= new Date(data.closesAt)) return fail("CONFLICT", "This assessment has closed.");
    if (data.publicationState !== "published") return fail("CONFLICT", "This assessment is not available.");

    const resultSnap = await tx.get(resultRef);
    const result = resultSnap.exists ? resultSnap.data() : {
      assessmentId: id,
      classId: data.classId,
      studentUid: ctx.user.uid,
      attemptsAllowed: 1,
      attemptsUsed: 0,
      openAttemptId: null,
      latestAttemptId: null,
      state: null
    };

    // Resume an open attempt that is still within its deadline.
    if (result.openAttemptId) {
      const openRef = ctx.db.collection("assessmentAttempts").doc(result.openAttemptId);
      const openSnap = await tx.get(openRef);
      if (openSnap.exists && openSnap.data().status === "in_progress" && now < new Date(openSnap.data().deadline)) {
        return jsonResponse({ success: true, data: {
          attemptId: result.openAttemptId,
          deadline: openSnap.data().deadline,
          questions: publicQuestions(data)
        } });
      }
      if (openSnap.exists && openSnap.data().status === "in_progress") {
        tx.update(openRef, { status: "expired", expiredAt: nowIso });
      }
      result.openAttemptId = null;
    }

    if (result.attemptsUsed >= result.attemptsAllowed) {
      // An attempt that timed out unsubmitted was just marked expired above; the
      // result record must stop pointing at it, or it would stay "in progress"
      // forever and block a teacher-approved retake.
      if (resultSnap.exists && resultSnap.data().openAttemptId) {
        tx.update(resultRef, { openAttemptId: null, updatedAt: nowIso });
      }
      return fail("CONFLICT", "No attempts remaining. Ask your teacher about a retake.");
    }

    const number = result.attemptsUsed + 1;
    const attemptId = attemptRecordId(id, ctx.user.uid, number);
    const durationEnd = data.durationMinutes ? now.getTime() + data.durationMinutes * 60000 : Infinity;
    const closeEnd = data.closesAt ? Date.parse(data.closesAt) : Infinity;
    const deadline = new Date(Math.min(durationEnd, closeEnd)).toISOString();

    tx.set(ctx.db.collection("assessmentAttempts").doc(attemptId), {
      assessmentId: id,
      classId: data.classId,
      studentUid: ctx.user.uid,
      attemptNumber: number,
      status: "in_progress",
      startedAt: nowIso,
      deadline,
      answers: null,
      score: null,
      maxScore: data.totalMarks
    });
    tx.set(resultRef, {
      ...result,
      attemptsUsed: number,
      openAttemptId: attemptId,
      latestAttemptId: attemptId,
      updatedAt: nowIso
    });

    return jsonResponse({ success: true, data: { attemptId, deadline, questions: publicQuestions(data) } }, 201);
  });
}

/** Questions for a student attempt: text and options only, never the correct answer. */
function publicQuestions(data) {
  return (data.questions ?? []).map((q) => ({ id: q.id, text: q.text, options: q.options, marks: q.marks }));
}

async function submitAttempt(request, ctx, id) {
  if (ctx.user.role !== "student") return fail("FORBIDDEN");
  const body = await readJson(request);
  if (body === undefined) return fail("INVALID_INPUT", "Valid JSON is required.");
  if (!isObject(body) || Object.keys(body).some((k) => !["attemptId", "answers"].includes(k))) {
    return fail("INVALID_INPUT", "The request contains unsupported fields.");
  }
  if (!ID_PATTERN.test(body.attemptId ?? "")) return fail("INVALID_INPUT", "A valid attemptId is required.");
  if (body.answers !== undefined && !isObject(body.answers)) return fail("INVALID_INPUT", "Answers must be an object.");

  const attemptRef = ctx.db.collection("assessmentAttempts").doc(body.attemptId);
  const attemptSnap = await attemptRef.get();
  if (!attemptSnap.exists) return notFound();
  const attempt = attemptSnap.data();
  if (attempt.assessmentId !== id || attempt.studentUid !== ctx.user.uid) return notFound();

  const data = await loadAssessment(ctx.db, id);
  if (!data) return notFound();
  const questionIds = new Set((data.questions ?? []).map((q) => q.id));
  const answers = body.answers ?? {};
  for (const [qid, choice] of Object.entries(answers)) {
    if (!questionIds.has(qid)) return fail("INVALID_INPUT", "An answer refers to an unknown question.");
    const question = data.questions.find((q) => q.id === qid);
    if (!Number.isInteger(choice) || choice < 0 || choice >= question.options.length) {
      return fail("INVALID_INPUT", "Each answer must be one of the listed options.");
    }
  }

  const keyRef = ctx.db.collection("assessmentAnswerKeys").doc(id);
  const resultRef = ctx.db.collection("assessmentResults").doc(resultRecordId(id, ctx.user.uid));
  const now = ctx.now();
  const nowIso = now.toISOString();

  const assessmentRef = ctx.db.collection("assessments").doc(id);
  return ctx.db.runTransaction(async (tx) => {
    const [freshAttempt, keySnap, resultSnap, freshAssessment] = await Promise.all([
      tx.get(attemptRef), tx.get(keyRef), tx.get(resultRef), tx.get(assessmentRef)
    ]);
    if (!freshAttempt.exists || !freshAssessment.exists) return notFound();
    const current = freshAttempt.data();
    const freshData = freshAssessment.data();
    if (current.assessmentId !== id || current.studentUid !== ctx.user.uid) return notFound();
    try {
      await txAuthorizeScope(tx, ctx.db, ctx.user, current.classId, freshData.subjectId);
    } catch (error) {
      if (error.message === "FORBIDDEN" || error.message === "NOT_FOUND") return notFound();
      throw error;
    }
    if (current.status !== "in_progress") {
      return fail("CONFLICT", "This attempt has already been submitted or has expired.");
    }
    if (now >= new Date(current.deadline)) {
      tx.update(attemptRef, { status: "expired", expiredAt: nowIso });
      tx.update(resultRef, { openAttemptId: null, updatedAt: nowIso });
      return fail("CONFLICT", "The time for this attempt has ended.");
    }

    const key = keySnap.exists ? keySnap.data().answers : {};
    let score = 0;
    for (const question of freshData.questions ?? []) {
      if (answers[question.id] === key[question.id]) score += question.marks;
    }
    const maxScore = freshData.totalMarks;

    tx.update(attemptRef, { status: "submitted", submittedAt: nowIso, answers, score, maxScore });
    const result = resultSnap.exists ? resultSnap.data() : {};
    tx.set(resultRef, {
      ...result,
      assessmentId: id,
      classId: freshData.classId,
      studentUid: ctx.user.uid,
      openAttemptId: null,
      latestAttemptId: attemptRef.id,
      score,
      maxScore,
      state: "pending_review",
      submittedAt: nowIso,
      updatedAt: nowIso
    });
    // The audit entry records that a submission happened, never the answers or score.
    tx.set(ctx.db.collection("auditLogs").doc(), auditEntry(ctx.user, "assessment.submitted", id, {
      classId: freshData.classId,
      subjectId: freshData.subjectId,
      attemptNumber: current.attemptNumber
    }, nowIso));

    return jsonResponse({ success: true, data: { submitted: true } });
  });
}

async function classRoster(db, classId) {
  const access = await db.collection("classAccess")
    .where("classId", "==", classId)
    .where("accessType", "==", "student")
    .where("active", "==", true)
    .limit(BOUNDED)
    .get();
  const uids = [...new Set(access.docs.map((d) => d.data().userUid).filter(Boolean))];
  const accounts = await Promise.all(uids.map((uid) => db.collection("users").doc(uid).get()));
  const roster = new Map();
  accounts.forEach((snap, i) => {
    if (snap.exists && snap.data().active === true && snap.data().role === "student") {
      roster.set(uids[i], snap.data().displayName || "Student");
    }
  });
  return roster;
}

async function resultsOverview(ctx, id) {
  const data = await loadAssessment(ctx.db, id);
  if (!data) return notFound();
  try {
    await authorizeClassSubject(ctx.db, ctx.user, data.classId, data.subjectId);
  } catch (error) {
    if (error.message === "FORBIDDEN" || error.message === "NOT_FOUND") return notFound();
    throw error;
  }

  const roster = await classRoster(ctx.db, data.classId);
  const snapshot = await ctx.db.collection("assessmentResults")
    .where("assessmentId", "==", id)
    .limit(BOUNDED)
    .get();
  const byStudent = new Map(snapshot.docs.map((d) => [d.data().studentUid, d.data()]));

  const students = [...roster.entries()].map(([studentUid, name]) => {
    const r = byStudent.get(studentUid);
    return {
      studentUid,
      name,
      state: r?.openAttemptId ? "in_progress"
        : r?.state ?? (r?.attemptsUsed > 0 ? "not_submitted" : "none"),
      score: r?.score ?? null,
      maxScore: r?.maxScore ?? data.totalMarks,
      attemptsUsed: r?.attemptsUsed ?? 0,
      attemptsAllowed: r?.attemptsAllowed ?? 1
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return jsonResponse({ success: true, data: { students } });
}

/** Approve, release or grant a retake for several students at once: all or nothing. */
async function resultAction(request, ctx, id, action) {
  if (!isStaff(ctx.user)) return fail("FORBIDDEN");
  const body = await readJson(request);
  if (body === undefined) return fail("INVALID_INPUT", "Valid JSON is required.");
  const uids = action === "retake" ? [body?.studentUid] : body?.studentUids;
  const valid = Array.isArray(uids) && uids.length >= 1 && uids.length <= 100
    && uids.every((u) => UID_PATTERN.test(u ?? "")) && new Set(uids).size === uids.length;
  if (!valid) return fail("INVALID_INPUT", "Provide one or more distinct valid student IDs.");

  return withScopedAssessment(ctx, id, async ({ tx, ref: _ref, current }) => {
    const refs = uids.map((uid) => ctx.db.collection("assessmentResults").doc(resultRecordId(id, uid)));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));
    const now = ctx.now().toISOString();

    const rules = {
      approve: { need: "pending_review", set: { state: "approved", approvedBy: ctx.user.uid, approvedAt: now } },
      release: { need: "approved", set: { state: "released", releasedBy: ctx.user.uid, releasedAt: now } }
    };

    if (action === "retake") {
      const snap = snaps[0];
      if (!snap.exists) return fail("CONFLICT", "This student has not started the assessment.");
      const r = snap.data();
      if (r.openAttemptId || r.attemptsUsed < r.attemptsAllowed) {
        return fail("CONFLICT", "The student still has an attempt available or one in progress.");
      }
      tx.update(refs[0], { attemptsAllowed: r.attemptsAllowed + 1, updatedAt: now });
      tx.set(ctx.db.collection("auditLogs").doc(), auditEntry(ctx.user, "assessment.retake_approved", id, {
        classId: current.classId, subjectId: current.subjectId
      }, now));
      return jsonResponse({ success: true, data: { granted: 1 } });
    }

    const rule = rules[action];
    if (snaps.some((s) => !s.exists || s.data().state !== rule.need)) {
      return fail("CONFLICT", action === "approve"
        ? "Every selected result must be submitted and awaiting approval."
        : "Every selected result must be approved before release.");
    }

    refs.forEach((r) => tx.update(r, rule.set));
    tx.set(ctx.db.collection("auditLogs").doc(), auditEntry(ctx.user, `assessment.result_${action}d`, id, {
      classId: current.classId,
      subjectId: current.subjectId,
      count: uids.length
    }, now));

    return jsonResponse({ success: true, data: { count: uids.length } });
  });
}

/**
 * Route /assessments requests. ctx: { path, user, db, serverTimestamp, now() }
 * where now() returns the current Date (injected for deterministic tests).
 */
export async function handleAssessments(request, ctx) {
  const segments = ctx.path.split("/").filter(Boolean);
  if (segments[0] !== "assessments" || segments.length > 4) return fail("NOT_FOUND", "Assessment endpoint not found.");

  const [, id, action, subaction] = segments;
  const method = request.method;

  if (id !== undefined && !ID_PATTERN.test(id)) return fail("INVALID_INPUT", "Invalid assessment ID.");

  try {
    if (id === "mine" && action === undefined) {
      return method === "GET" ? await listMine(ctx) : fail("METHOD_NOT_ALLOWED");
    }

    if (id === undefined) {
      if (method === "GET") return await listAssessments(request, ctx);
      if (method === "POST") return isStaff(ctx.user) ? await createAssessment(request, ctx) : fail("FORBIDDEN");
      return fail("METHOD_NOT_ALLOWED");
    }

    if (action === undefined) {
      if (method === "GET") return await getAssessment(ctx, id);
      if (method === "PATCH") return isStaff(ctx.user) ? await updateAssessment(request, ctx, id) : fail("FORBIDDEN");
      return fail("METHOD_NOT_ALLOWED");
    }

    if (action === "publish" || action === "close") {
      if (method !== "POST") return fail("METHOD_NOT_ALLOWED");
      if (!isStaff(ctx.user)) return fail("FORBIDDEN");
      return action === "publish"
        ? await transitionAssessment(ctx, id, { from: "draft", to: "published" }, ctx.now())
        : await transitionAssessment(ctx, id, { from: "published", to: "closed" }, ctx.now());
    }

    if (action === "start") return method === "POST" ? await startAttempt(ctx, id) : fail("METHOD_NOT_ALLOWED");
    if (action === "submit") return method === "POST" ? await submitAttempt(request, ctx, id) : fail("METHOD_NOT_ALLOWED");

    if (action === "results" && subaction === undefined) {
      if (method !== "GET") return fail("METHOD_NOT_ALLOWED");
      if (!isStaff(ctx.user)) return fail("FORBIDDEN");
      return await resultsOverview(ctx, id);
    }
    if (action === "results" && (subaction === "approve" || subaction === "release")) {
      if (method !== "POST") return fail("METHOD_NOT_ALLOWED");
      return await resultAction(request, ctx, id, subaction);
    }
    if (action === "attempts" && subaction === undefined) {
      if (method !== "GET") return fail("METHOD_NOT_ALLOWED");
      if (!isStaff(ctx.user)) return fail("FORBIDDEN");
      const studentUid = new URL(request.url).searchParams.get("studentUid");
      if (!UID_PATTERN.test(studentUid ?? "")) return fail("INVALID_INPUT", "A valid studentUid is required.");
      return await reviewAttempt(ctx, id, studentUid);
    }
    if (action === "reopen" && subaction === undefined) {
      if (method !== "POST") return fail("METHOD_NOT_ALLOWED");
      if (!isStaff(ctx.user)) return fail("FORBIDDEN");
      return await reopenAttempt(request, ctx, id);
    }
    if (action === "retakes" && subaction === undefined) {
      if (method !== "POST") return fail("METHOD_NOT_ALLOWED");
      return await resultAction(request, ctx, id, "retake");
    }

    return fail("NOT_FOUND", "Assessment endpoint not found.");
  } catch (error) {
    if (error.message === "FORBIDDEN" || error.message === "NOT_FOUND") return notFound();
    throw error;
  }
}
