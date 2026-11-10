import { createHash } from "node:crypto";
import { requireClassTeachingAssignment, classAccessDocumentId, txAuthorizeScope } from "../authorization.mjs";
import { jsonResponse, errorResponse } from "../response.mjs";
import { API_ERRORS } from "../errors.mjs";

/*
 * Attendance workflow, per docs/FIRESTORE_DATA_MODEL.md section 8.
 * - One effective record per class, academy date and student. The record ID is a
 *   SHA-256 of the three components, so it is unambiguous and deterministic.
 * - Initial marking creates records only; it never overwrites a record. Changes
 *   go through correction, which requires a reason and appends history.
 * - Teachers act only in classes where they hold an active teaching assignment.
 *   Administrators act in any active class. Students have no attendance access.
 * - Every mark and correction is audited with identifiers only.
 */

const STATUSES = new Set(["present", "absent", "late"]);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/; // Firebase UIDs, at most 128 characters
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BATCH = 100;
const ROSTER_LIMIT = 500;

const isStaff = (user) => user.role === "admin" || user.role === "teacher";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function fail(code, message) {
  const details = API_ERRORS[code];
  return errorResponse(code, message ?? details.message, details.status);
}

function notFound() {
  return fail("NOT_FOUND", "Resource not found.");
}

export function attendanceRecordId(classId, date, studentUid) {
  return createHash("sha256").update(`${classId}\n${date}\n${studentUid}`).digest("hex");
}

/** Returns an error message, or null when the date is a real, non-future calendar date. */
export function validateAttendanceDate(value, today) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return "Date must be in YYYY-MM-DD format.";
  }
  const [year, month, day] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return "Date is not a valid calendar date.";
  }
  if (value > today) {
    return "Attendance cannot be recorded for a future date.";
  }
  return null;
}

function toIsoOrNull(value) {
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return value;
  return null;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

async function authorizeClass(db, user, classId) {
  if (user.role === "teacher") {
    await requireClassTeachingAssignment(db, user, classId);
  } else if (user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }

  const snapshot = await db.collection("classes").doc(classId).get();
  if (!snapshot.exists || snapshot.data().active !== true) {
    throw new Error("NOT_FOUND");
  }
}

/** Active student members of a class, keyed by UID, with active-account names. */
async function classRoster(db, classId) {
  const access = await db.collection("classAccess")
    .where("classId", "==", classId)
    .where("accessType", "==", "student")
    .where("active", "==", true)
    .limit(ROSTER_LIMIT)
    .get();

  const uids = [...new Set(access.docs.map((doc) => doc.data().userUid).filter(Boolean))];
  const accounts = await Promise.all(uids.map((uid) => db.collection("users").doc(uid).get()));

  const roster = new Map();
  accounts.forEach((snap, index) => {
    if (!snap.exists) return;
    const data = snap.data();
    if (data.active === true && data.role === "student") {
      roster.set(uids[index], data.displayName || "Student");
    }
  });
  return roster;
}

async function displayNames(db, uids) {
  const unique = [...new Set(uids)];
  const snaps = await Promise.all(unique.map((uid) => db.collection("users").doc(uid).get()));
  return new Map(unique.map((uid, index) => [uid, snaps[index].exists ? snaps[index].data().displayName || "Staff" : "Staff"]));
}

/** Student-only attendance history. Identity is always taken from the verified session. */
async function listMyAttendance(request, ctx) {
  if (ctx.user.role !== "student" || !UID_PATTERN.test(ctx.user.uid ?? "")) return fail("FORBIDDEN");
  const cursor = new URL(request.url).searchParams.get("cursor");
  let recordsQuery = ctx.db.collection("attendanceRecords")
    .where("studentUid", "==", ctx.user.uid)
    .orderBy("attendanceDate", "desc");
  if (cursor) {
    if (!/^[a-f0-9]{64}$/.test(cursor)) return fail("INVALID_INPUT", "Invalid attendance cursor.");
    const cursorSnapshot = await ctx.db.collection("attendanceRecords").doc(cursor).get();
    if (!cursorSnapshot.exists || cursorSnapshot.data().studentUid !== ctx.user.uid) {
      return fail("INVALID_INPUT", "Invalid attendance cursor.");
    }
    recordsQuery = recordsQuery.startAfter(cursorSnapshot);
  }
  const [recordsSnapshot, correctionsSnapshot] = await Promise.all([
    recordsQuery.limit(201).get(),
    ctx.db.collection("attendanceCorrections")
      .where("studentUid", "==", ctx.user.uid)
      .orderBy("correctedAt", "desc")
      .limit(500)
      .get()
  ]);

  const pageDocs = recordsSnapshot.docs.slice(0, 200);
  const correctionsByRecord = new Map();
  for (const doc of correctionsSnapshot.docs) {
    const item = doc.data();
    const key = `${item.classId}\n${item.attendanceDate}`;
    if (!correctionsByRecord.has(key)) correctionsByRecord.set(key, []);
    const history = correctionsByRecord.get(key);
    if (history.length < 20) history.push({
      previousStatus: item.previousStatus,
      newStatus: item.newStatus,
      reason: item.reason,
      correctedAt: toIsoOrNull(item.correctedAt)
    });
  }

  const records = pageDocs.map((doc) => {
    const item = doc.data();
    const key = `${item.classId}\n${item.attendanceDate}`;
    return {
      date: item.attendanceDate,
      status: item.status,
      correctionCount: Number.isInteger(item.correctionCount) ? item.correctionCount : 0,
      history: correctionsByRecord.get(key) ?? []
    };
  }).sort((a, b) => b.date.localeCompare(a.date));

  const hasMore = recordsSnapshot.docs.length > 200;
  return jsonResponse({ success: true, data: {
    records, hasMore, nextCursor: hasMore ? pageDocs.at(-1)?.id ?? null : null
  } });
}

async function listRoster(request, ctx) {
  const url = new URL(request.url);
  const classId = url.searchParams.get("classId");
  const date = url.searchParams.get("date") ?? ctx.today();

  if (!ID_PATTERN.test(classId ?? "")) return fail("INVALID_INPUT", "A valid classId is required.");
  const dateError = validateAttendanceDate(date, ctx.today());
  if (dateError) return fail("INVALID_INPUT", dateError);

  await authorizeClass(ctx.db, ctx.user, classId);
  const roster = await classRoster(ctx.db, classId);

  const records = await ctx.db.collection("attendanceRecords")
    .where("classId", "==", classId)
    .where("attendanceDate", "==", date)
    .limit(ROSTER_LIMIT)
    .get();
  const byStudent = new Map(records.docs.map((doc) => [doc.data().studentUid, doc.data()]));

  const students = [...roster.entries()]
    .map(([studentUid, name]) => ({
      studentUid,
      name,
      status: byStudent.get(studentUid)?.status ?? null,
      correctionCount: byStudent.get(studentUid)?.correctionCount ?? 0
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return jsonResponse({
    success: true,
    data: { classId, date, marked: byStudent.size > 0, students }
  });
}

/** Transaction-bound membership and account validation for protected attendance writes. */
async function readActiveStudentMemberships(tx, db, classId, studentUids) {
  const classRef = db.collection("classes").doc(classId);
  const membershipRefs = studentUids.map((uid) => db.collection("classAccess")
    .doc(classAccessDocumentId(classId, uid, "student")));
  const userRefs = studentUids.map((uid) => db.collection("users").doc(uid));
  const [classSnap, ...snapshots] = await Promise.all([
    tx.get(classRef),
    ...membershipRefs.map((ref) => tx.get(ref)),
    ...userRefs.map((ref) => tx.get(ref))
  ]);
  if (!classSnap.exists || classSnap.data().active !== true) return false;
  const membershipSnaps = snapshots.slice(0, studentUids.length);
  const userSnaps = snapshots.slice(studentUids.length);
  return studentUids.every((uid, index) => {
    if (!membershipSnaps[index].exists || !userSnaps[index].exists) return false;
    const membership = membershipSnaps[index].data();
    const account = userSnaps[index].data();
    return membership.classId === classId && membership.userUid === uid &&
      membership.accessType === "student" && membership.active === true &&
      account.role === "student" && account.active === true;
  });
}

function validateMarkBody(body) {
  if (!isObject(body)) return "A JSON object is required.";
  const allowed = new Set(["classId", "date", "records"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return "The request contains unsupported fields.";
  if (!ID_PATTERN.test(body.classId ?? "")) return "A valid classId is required.";
  if (!Array.isArray(body.records) || body.records.length === 0 || body.records.length > MAX_BATCH) {
    return `Provide between 1 and ${MAX_BATCH} attendance records.`;
  }
  const seen = new Set();
  for (const record of body.records) {
    if (!isObject(record) || !UID_PATTERN.test(record.studentUid ?? "") || !STATUSES.has(record.status)) {
      return "Each record needs a valid studentUid and a status of present, absent or late.";
    }
    if (seen.has(record.studentUid)) return "Each student may appear only once in a request.";
    seen.add(record.studentUid);
  }
  return null;
}

async function markAttendance(request, ctx) {
  const body = await readJson(request);
  if (body === undefined) return fail("INVALID_INPUT", "Valid JSON is required.");
  const bodyError = validateMarkBody(body);
  if (bodyError) return fail("INVALID_INPUT", bodyError);

  const date = body.date ?? ctx.today();
  const dateError = validateAttendanceDate(date, ctx.today());
  if (dateError) return fail("INVALID_INPUT", dateError);

  const studentUids = body.records.map((r) => r.studentUid);

  const refs = body.records.map((r) => ctx.db.collection("attendanceRecords")
    .doc(attendanceRecordId(body.classId, date, r.studentUid)));

  return ctx.db.runTransaction(async (tx) => {
    await txAuthorizeScope(tx, ctx.db, ctx.user, body.classId);
    if (!(await readActiveStudentMemberships(tx, ctx.db, body.classId, studentUids))) {
      return fail("INVALID_INPUT", "One or more students are not active members of this class.");
    }
    const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
    if (snapshots.some((snap) => snap.exists)) {
      return fail("CONFLICT", "Attendance is already recorded for one or more students. Use a correction instead.");
    }

    const now = ctx.serverTimestamp();
    body.records.forEach((record, index) => {
      tx.set(refs[index], {
        classId: body.classId,
        attendanceDate: date,
        studentUid: record.studentUid,
        status: record.status,
        markedBy: ctx.user.uid,
        markedByRole: ctx.user.role,
        correctionCount: 0,
        createdAt: now,
        updatedAt: now
      });
    });
    tx.set(ctx.db.collection("auditLogs").doc(), {
      actorUid: ctx.user.uid,
      actorRole: ctx.user.role,
      action: "attendance.marked",
      targetType: "attendance",
      targetId: body.classId,
      metadata: { classId: body.classId, attendanceDate: date, count: body.records.length },
      createdAt: now
    });

    return jsonResponse({ success: true, data: { date, marked: body.records.length } }, 201);
  });
}

function validateCorrectionBody(body) {
  if (!isObject(body)) return "A JSON object is required.";
  const allowed = new Set(["classId", "date", "studentUid", "status", "reason"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return "The request contains unsupported fields.";
  if (!ID_PATTERN.test(body.classId ?? "")) return "A valid classId is required.";
  if (!UID_PATTERN.test(body.studentUid ?? "")) return "A valid studentUid is required.";
  if (!STATUSES.has(body.status)) return "Status must be present, absent or late.";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 3 || reason.length > 300) return "A reason of 3 to 300 characters is required for a correction.";
  return null;
}

async function correctAttendance(request, ctx) {
  const body = await readJson(request);
  if (body === undefined) return fail("INVALID_INPUT", "Valid JSON is required.");
  const bodyError = validateCorrectionBody(body);
  if (bodyError) return fail("INVALID_INPUT", bodyError);

  const dateError = validateAttendanceDate(body.date, ctx.today());
  if (dateError) return fail("INVALID_INPUT", dateError);

  const ref = ctx.db.collection("attendanceRecords")
    .doc(attendanceRecordId(body.classId, body.date, body.studentUid));
  const reason = body.reason.trim();

  return ctx.db.runTransaction(async (tx) => {
    await txAuthorizeScope(tx, ctx.db, ctx.user, body.classId);
    if (!(await readActiveStudentMemberships(tx, ctx.db, body.classId, [body.studentUid]))) {
      return fail("INVALID_INPUT", "This student is not an active member of this class.");
    }
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) {
      return fail("CONFLICT", "Attendance has not been recorded for this student yet.");
    }

    const current = snapshot.data();
    if (current.status === body.status) {
      return fail("CONFLICT", `Attendance is already ${body.status}.`);
    }

    const now = ctx.serverTimestamp();
    tx.update(ref, {
      status: body.status,
      updatedAt: now,
      updatedBy: ctx.user.uid,
      correctionCount: (current.correctionCount ?? 0) + 1
    });
    // Append-only history: who changed it, when, the prior value and the reason.
    tx.set(ctx.db.collection("attendanceCorrections").doc(), {
      classId: body.classId,
      attendanceDate: body.date,
      studentUid: body.studentUid,
      previousStatus: current.status,
      newStatus: body.status,
      reason,
      correctedBy: ctx.user.uid,
      correctedByRole: ctx.user.role,
      correctedAt: now
    });
    tx.set(ctx.db.collection("auditLogs").doc(), {
      actorUid: ctx.user.uid,
      actorRole: ctx.user.role,
      action: "attendance.corrected",
      targetType: "attendance",
      targetId: ref.id,
      metadata: {
        classId: body.classId,
        attendanceDate: body.date,
        studentUid: body.studentUid,
        fromStatus: current.status,
        toStatus: body.status
      },
      createdAt: now
    });

    return jsonResponse({ success: true, data: { status: body.status } });
  });
}

async function listCorrections(request, ctx) {
  const url = new URL(request.url);
  const classId = url.searchParams.get("classId");
  const date = url.searchParams.get("date");
  const studentUid = url.searchParams.get("studentUid");

  if (!ID_PATTERN.test(classId ?? "")) return fail("INVALID_INPUT", "A valid classId is required.");
  if (validateAttendanceDate(date, ctx.today())) return fail("INVALID_INPUT", "A valid date is required.");
  if (!UID_PATTERN.test(studentUid ?? "")) return fail("INVALID_INPUT", "A valid studentUid is required.");

  await authorizeClass(ctx.db, ctx.user, classId);

  const snapshot = await ctx.db.collection("attendanceCorrections")
    .where("classId", "==", classId)
    .where("attendanceDate", "==", date)
    .where("studentUid", "==", studentUid)
    .orderBy("correctedAt", "desc")
    .limit(50)
    .get();

  const docs = snapshot.docs.map((doc) => doc.data());
  const names = await displayNames(ctx.db, docs.map((d) => d.correctedBy));

  return jsonResponse({
    success: true,
    data: {
      corrections: docs.map((d) => ({
        previousStatus: d.previousStatus,
        newStatus: d.newStatus,
        reason: d.reason,
        correctedAt: toIsoOrNull(d.correctedAt),
        correctedByName: names.get(d.correctedBy) ?? "Staff",
        correctedByRole: d.correctedByRole
      }))
    }
  });
}

/**
 * Route /attendance requests. ctx: { path, user, db, serverTimestamp, today() }
 * where today() returns the current academy date (YYYY-MM-DD, Asia/Karachi).
 */
export async function handleAttendance(request, ctx) {
  const segments = ctx.path.split("/").filter(Boolean);
  if (segments[0] !== "attendance" || segments.length > 2) {
    return fail("NOT_FOUND", "Attendance endpoint not found.");
  }

  try {
    const action = segments[1];
    if (action === "mine") {
      return request.method === "GET" ? await listMyAttendance(request, ctx) : fail("METHOD_NOT_ALLOWED");
    }
    if (!isStaff(ctx.user)) return fail("FORBIDDEN");
    const method = request.method;

    if (action === undefined) {
      return method === "GET" ? await listRoster(request, ctx) : fail("METHOD_NOT_ALLOWED");
    }
    if (action === "mark") {
      return method === "POST" ? await markAttendance(request, ctx) : fail("METHOD_NOT_ALLOWED");
    }
    if (action === "correct") {
      return method === "POST" ? await correctAttendance(request, ctx) : fail("METHOD_NOT_ALLOWED");
    }
    if (action === "corrections") {
      return method === "GET" ? await listCorrections(request, ctx) : fail("METHOD_NOT_ALLOWED");
    }
    return fail("NOT_FOUND", "Attendance endpoint not found.");
  } catch (error) {
    if (error.message === "FORBIDDEN" || error.message === "NOT_FOUND") return notFound();
    throw error;
  }
}
