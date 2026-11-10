import { createHash } from "node:crypto";
import { classAccessDocumentId } from "../authorization.mjs";
import { academyIdToAuthEmail } from "../../../../public/assets/js/login-alias.mjs";
import { allocateStaffId, allocateStudentId } from "../id-allocator.mjs";
import { jsonResponse, errorResponse } from "../response.mjs";
import { API_ERRORS } from "../errors.mjs";
import { listAuditLogs } from "./audit-logs.mjs";

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const fail = (code, message) => errorResponse(code, message ?? API_ERRORS[code].message, API_ERRORS[code].status);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const clean = (value) => typeof value === "string" ? value.trim() : "";
async function bodyOf(request) { try { return await request.json(); } catch { return undefined; } }
function audit(ctx, action, targetType, targetId, metadata = {}) {
  return { actorUid: ctx.user.uid, actorRole: "admin", action, targetType, targetId, metadata, createdAt: ctx.serverTimestamp() };
}
function deterministicId(parts) { return createHash("sha256").update(JSON.stringify(parts)).digest("hex"); }

const COLLECTIONS = {
  students: { collection: "users", role: "student", fields: ["displayName", "active"], searchable: ["displayName", "academyId"] },
  staff: { collection: "users", roles: ["teacher"], fields: ["displayName", "active"], searchable: ["displayName", "academyId"] },
  classes: { collection: "classes", fields: ["name", "grade", "academicSessionId", "active"], searchable: ["name", "academicSessionId"] },
  subjects: { collection: "subjects", fields: ["name", "grade", "board", "active"], searchable: ["name", "board"] },
  "teaching-assignments": { collection: "teachingAssignments", fields: ["teacherUid", "classId", "subjectId", "active"], searchable: ["teacherUid", "classId", "subjectId"] }
};

function validateResource(resource, input, creating) {
  if (!object(input)) return { error: "A JSON object is required." };
  const config = COLLECTIONS[resource];
  if (Object.keys(input).some((key) => !config.fields.includes(key))) return { error: "Unsupported or immutable fields were provided." };
  const value = {};
  if (!creating && ["classes", "subjects"].includes(resource) && "grade" in input) return { error: "Grade is immutable after record creation; create a new academic record instead." };
  if (!creating && resource === "teaching-assignments" && ["teacherUid", "classId", "subjectId"].some((key) => key in input)) return { error: "The assignment tuple is immutable; deactivate it and create a new assignment." };
  if (["students", "staff"].includes(resource) && (creating || "displayName" in input)) {
    const key = "displayName";
    const name = clean(input[key]);
    if (name.length < 2 || name.length > 100) return { error: `${key} must contain 2 to 100 characters.` };
    value[key] = name;
  }
  if (["classes", "subjects"].includes(resource) && (creating || "name" in input)) {
    const key = "name";
    const name = clean(input[key]);
    if (name.length < 2 || name.length > 100) return { error: `${key} must contain 2 to 100 characters.` };
    value[key] = name;
  }
  if (resource === "classes") {
    if (creating || "grade" in input) {
      if (![9, 10].includes(Number(input.grade))) return { error: "Grade must be 9 or 10." };
      value.grade = Number(input.grade);
    }
    if (creating || "academicSessionId" in input) {
      const session = clean(input.academicSessionId);
      if (!/^20\d{2}$/.test(session)) return { error: "academicSessionId must be a four-digit year." };
      value.academicSessionId = session;
    }
  }
  if (resource === "subjects") {
    if (creating || "grade" in input) {
      if (![9, 10].includes(Number(input.grade))) return { error: "Grade must be 9 or 10." };
      value.grade = Number(input.grade);
    }
    if (creating || "board" in input) {
      const board = clean(input.board);
      if (board !== "AJK") return { error: "Only the AJK board is supported in this V1 configuration." };
      value.board = board;
    }
  }
  if (resource === "teaching-assignments") {
    for (const key of ["teacherUid", "classId", "subjectId"]) {
      if (creating || key in input) {
        if (!ID.test(input[key] ?? "")) return { error: `A valid ${key} is required.` };
        value[key] = input[key];
      }
    }
  }
  if ("active" in input) {
    if (typeof input.active !== "boolean") return { error: "active must be a boolean." };
    value.active = input.active;
  }
  if (creating && resource !== "teaching-assignments" && !("active" in value)) value.active = true;
  if (!creating && Object.keys(value).length === 0) return { error: "No changes were provided." };
  return { value };
}

async function validateAssignmentRefs(db, value) {
  const [teacher, cls, subject] = await Promise.all([
    db.collection("users").doc(value.teacherUid).get(),
    db.collection("classes").doc(value.classId).get(),
    db.collection("subjects").doc(value.subjectId).get()
  ]);
  if (!teacher.exists || teacher.data().role !== "teacher" || teacher.data().active !== true) throw new Error("INVALID_INPUT");
  if (!cls.exists || cls.data().active !== true || !subject.exists || subject.data().active !== true || cls.data().grade !== subject.data().grade) throw new Error("INVALID_INPUT");
  return { teacher: teacher.data(), cls: cls.data(), subject: subject.data() };
}

async function listResource(request, ctx, resource) {
  const config = COLLECTIONS[resource];
  let query = ctx.db.collection(config.collection).limit(500);
  if (resource === "students") query = query.where("role", "==", "student");
  if (resource === "staff") query = query.where("role", "==", "teacher");
  const snapshot = await query.get();
  const allowedFields = {
    students: ["role", "displayName", "academyId", "active", "provisioningStatus", "createdAt"],
    staff: ["role", "displayName", "academyId", "active", "provisioningStatus", "createdAt"],
    classes: ["name", "grade", "academicSessionId", "active", "createdAt"],
    subjects: ["name", "grade", "board", "active", "createdAt"],
    "teaching-assignments": ["teacherUid", "classId", "subjectId", "active", "createdAt"]
  };
  let records = snapshot.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, ...Object.fromEntries(allowedFields[resource].filter((field) => data[field] !== undefined).map((field) => [field, data[field]])) };
  });
  const url = new URL(request.url);
  const active = url.searchParams.get("active");
  if (active === "true" || active === "false") records = records.filter((record) => record.active === (active === "true"));
  const q = clean(url.searchParams.get("q")).toLocaleLowerCase();
  if (q) records = records.filter((record) => config.searchable.some((field) => String(record[field] ?? "").toLocaleLowerCase().includes(q)));
  return jsonResponse({ success: true, data: { records } });
}

async function createResource(request, ctx, resource) {
  const body = await bodyOf(request);
  const checked = validateResource(resource, body, true);
  if (checked.error) return fail("INVALID_INPUT", checked.error);
  const value = checked.value;
  const assignmentId = resource === "teaching-assignments" ? `ta_${deterministicId([value.teacherUid, value.classId, value.subjectId])}` : null;
  const collection = ctx.db.collection(COLLECTIONS[resource].collection);
  const ref = assignmentId ? collection.doc(assignmentId) : collection.doc();
  if (resource === "teaching-assignments") {
    try { await validateAssignmentRefs(ctx.db, value); } catch { return fail("INVALID_INPUT", "Teacher, active class and active same-grade subject must exist."); }
    value.active = true;
    value.createdAt = ctx.serverTimestamp();
    value.createdBy = ctx.user.uid;
    const membershipId = classAccessDocumentId(value.classId, value.teacherUid, "teacher");
    const membershipRef = ctx.db.collection("classAccess").doc(membershipId);
    return ctx.db.runTransaction(async (tx) => {
      const [existing, membership, teacherSnap, classSnap, subjectSnap] = await Promise.all([
        tx.get(ref), tx.get(membershipRef),
        tx.get(ctx.db.collection("users").doc(value.teacherUid)),
        tx.get(ctx.db.collection("classes").doc(value.classId)),
        tx.get(ctx.db.collection("subjects").doc(value.subjectId))
      ]);
      if (!teacherSnap.exists || teacherSnap.data().role !== "teacher" || teacherSnap.data().active !== true ||
          !classSnap.exists || classSnap.data().active !== true || !subjectSnap.exists || subjectSnap.data().active !== true ||
          classSnap.data().grade !== subjectSnap.data().grade) return fail("CONFLICT", "The teacher, class or subject changed during assignment. Refresh and retry.");
      if (existing.exists && existing.data().active === true) return jsonResponse({ success: true, data: { id: ref.id, active: true } });
      tx.set(ref, { ...value, createdAt: existing.exists ? existing.data().createdAt ?? value.createdAt : value.createdAt, updatedAt: ctx.serverTimestamp() });
      tx.set(membershipRef, { classId: value.classId, userUid: value.teacherUid, accessType: "teacher", active: true, updatedAt: ctx.serverTimestamp(), createdBy: ctx.user.uid });
      tx.set(ctx.db.collection("auditLogs").doc(), audit(ctx, existing.exists ? "teaching-assignment.reactivated" : "teaching-assignment.created", "teachingAssignment", ref.id, { classId: value.classId, subjectId: value.subjectId, teacherUid: value.teacherUid }));
      return jsonResponse({ success: true, data: { id: ref.id, active: true } }, existing.exists ? 200 : 201);
    });
  }
  value.createdAt = ctx.serverTimestamp(); value.updatedAt = ctx.serverTimestamp(); value.createdBy = ctx.user.uid;
  return ctx.db.runTransaction(async (tx) => {
    tx.set(ref, value);
    tx.set(ctx.db.collection("auditLogs").doc(), audit(ctx, `${resource}.created`, COLLECTIONS[resource].collection, ref.id));
    return jsonResponse({ success: true, data: { id: ref.id } }, 201);
  });
}

async function updateResource(request, ctx, resource, id, deactivate = false) {
  if (!ID.test(id)) return fail("INVALID_INPUT", "Invalid record ID.");
  const body = deactivate ? { active: false } : await bodyOf(request);
  const checked = validateResource(resource, body, false);
  if (checked.error) return fail("INVALID_INPUT", checked.error);
  const ref = ctx.db.collection(COLLECTIONS[resource].collection).doc(id);
  if (resource === "teaching-assignments" && !deactivate) {
    const snap = await ref.get();
    if (!snap.exists) return fail("NOT_FOUND");
    try { await validateAssignmentRefs(ctx.db, { ...snap.data(), ...checked.value }); }
    catch { return fail("INVALID_INPUT", "Teacher, active class and active same-grade subject must exist."); }
  }
  const result = await ctx.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return fail("NOT_FOUND");
    const current = snap.data();
    if (resource === "teaching-assignments" && !deactivate) {
      const next = { ...current, ...checked.value };
      const [teacherSnap, classSnap, subjectSnap] = await Promise.all([
        tx.get(ctx.db.collection("users").doc(next.teacherUid)),
        tx.get(ctx.db.collection("classes").doc(next.classId)),
        tx.get(ctx.db.collection("subjects").doc(next.subjectId))
      ]);
      if (!teacherSnap.exists || teacherSnap.data().role !== "teacher" || teacherSnap.data().active !== true ||
          !classSnap.exists || classSnap.data().active !== true || !subjectSnap.exists || subjectSnap.data().active !== true ||
          classSnap.data().grade !== subjectSnap.data().grade) return fail("CONFLICT", "The teacher, class or subject is no longer eligible for this assignment.");
    }
    if (resource === "students" && current.role !== "student") return fail("NOT_FOUND");
    if (resource === "staff" && current.role !== "teacher") return fail("NOT_FOUND");
    if (deactivate && current.active !== true) return fail("CONFLICT", "Record is already inactive.");
    if (["students", "staff"].includes(resource) && checked.value.active === true &&
        ["pending_activation", "credential_issued"].includes(current.provisioningStatus)) {
      return fail("CONFLICT", "This account cannot be activated until its verified credential handoff is complete.");
    }
    tx.update(ref, { ...checked.value, updatedAt: ctx.serverTimestamp(), updatedBy: ctx.user.uid });
    tx.set(ctx.db.collection("auditLogs").doc(), audit(ctx, `${resource}.${deactivate ? "deactivated" : "updated"}`, COLLECTIONS[resource].collection, id, { fields: Object.keys(checked.value) }));
    return jsonResponse({ success: true, data: { id, ...checked.value } });
  });
  if (result.ok && ["students", "staff"].includes(resource) && typeof checked.value.active === "boolean" && ctx.auth?.updateUser) {
    // Firestore status is authoritative; Auth disable/enable is defense in depth.
    try { await ctx.auth.updateUser(id, { disabled: checked.value.active !== true }); }
    catch { return errorResponse("INTERNAL_ERROR", "The LMS account status was updated, but Firebase Auth synchronization needs operator review.", 500); }
  }
  return result;
}


async function getStudentDetail(ctx, uid) {
  if (!ID.test(uid)) return fail("INVALID_INPUT", "Invalid student UID.");
  const profileSnap = await ctx.db.collection("users").doc(uid).get();
  if (!profileSnap.exists || profileSnap.data().role !== "student") return fail("NOT_FOUND");
  const [membershipSnap, historySnap] = await Promise.all([
    ctx.db.collection("classAccess").where("userUid", "==", uid).where("accessType", "==", "student").limit(500).get(),
    ctx.db.collection("membershipHistory").where("userUid", "==", uid).limit(500).get()
  ]);
  const memberships = membershipSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const activeMemberships = memberships.filter((membership) => membership.active === true);
  const classSnapshots = await Promise.all(activeMemberships.map((membership) => ctx.db.collection("classes").doc(membership.classId).get()));
  const activeClasses = classSnapshots.filter((snapshot) => snapshot.exists && snapshot.data().active === true);
  const grades = [...new Set(activeClasses.map((snapshot) => snapshot.data().grade))];
  const subjectSnapshots = await Promise.all(grades.map((grade) => ctx.db.collection("subjects").where("grade", "==", grade).where("active", "==", true).limit(200).get()));
  const subjects = [];
  for (const classSnap of activeClasses) {
    const classId = classSnap.id;
    const grade = classSnap.data().grade;
    for (const snapshot of subjectSnapshots) {
      for (const subjectDoc of snapshot.docs) {
        const subject = subjectDoc.data();
        if (subject.grade === grade && subject.active === true) subjects.push({ classId, subjectId: subjectDoc.id, name: subject.name, grade, board: subject.board });
      }
    }
  }
  const history = historySnap.docs.map((doc) => {
    const item = doc.data();
    return { id: doc.id, classId: item.classId, action: item.action, actorUid: item.actorUid, createdAt: item.createdAt };
  });
  const profile = profileSnap.data();
  return jsonResponse({ success: true, data: {
    student: { uid, academyId: profile.academyId, displayName: profile.displayName, active: profile.active, provisioningStatus: profile.provisioningStatus ?? null },
    memberships: memberships.map((item) => ({ id: item.id, classId: item.classId, active: item.active, createdAt: item.createdAt, updatedAt: item.updatedAt })),
    subjectAccess: subjects,
    membershipHistory: history
  } });
}

/** Admin-only CRUD and trusted Auth account staging. */
export async function handleAdmin(request, ctx) {
  if (ctx.user?.role !== "admin") return fail("FORBIDDEN");
  const parts = ctx.path.split("/").filter(Boolean);
  if (parts[0] !== "admin") return fail("NOT_FOUND");
  const resource = parts[1];

  if (resource === "accounts" && parts.length === 2 && request.method === "POST") {
    if (!ctx.auth || typeof ctx.auth.createUser !== "function") return errorResponse("INTERNAL_ERROR", "Account provisioning is unavailable.", 500);
    const body = await bodyOf(request);
    if (!object(body) || Object.keys(body).some((key) => !["role", "displayName"].includes(key)) || !["student", "teacher"].includes(body.role)) return fail("INVALID_INPUT", "Only student or teacher accounts can be provisioned by an administrator.");
    const displayName = clean(body.displayName);
    if (displayName.length < 2 || displayName.length > 100) return fail("INVALID_INPUT", "displayName must contain 2 to 100 characters.");
    const academyId = body.role === "student"
      ? await (ctx.allocateStudentId ?? allocateStudentId)(ctx.db, ctx.now?.() ?? new Date())
      : await (ctx.allocateStaffId ?? allocateStaffId)(ctx.db, "teacher");
    const email = academyIdToAuthEmail(academyId);
    let authUser;
    try {
      authUser = await ctx.auth.createUser({ email, displayName, disabled: true });
      const userRef = ctx.db.collection("users").doc(authUser.uid);
      await ctx.db.runTransaction(async (tx) => {
        const existing = await tx.get(userRef);
        if (existing.exists) throw new Error("CONFLICT");
        tx.set(userRef, { role: body.role, active: false, provisioningStatus: "pending_activation", displayName, academyId, createdAt: ctx.serverTimestamp(), createdBy: ctx.user.uid, updatedAt: ctx.serverTimestamp() });
        tx.set(ctx.db.collection("auditLogs").doc(), audit(ctx, "account.provisioned.pending_activation", "user", authUser.uid, { role: body.role, academyId }));
      });
    } catch (error) {
      if (authUser?.uid) { try { await ctx.auth.deleteUser(authUser.uid); } catch { /* documented orphan-recovery path */ } }
      if (error.message === "CONFLICT" || error.code === "auth/email-already-exists") return fail("CONFLICT", "An account already exists for the allocated academy ID.");
      throw error;
    }
    return jsonResponse({ success: true, data: { uid: authUser.uid, academyId, role: body.role, status: "pending_activation", enabled: false } }, 201);
  }

  // Read-only audit log view. Administrator role is already enforced above.
  if (resource === "audit-logs") {
    if (parts.length !== 2) return fail("NOT_FOUND");
    if (request.method !== "GET") return fail("METHOD_NOT_ALLOWED");
    return listAuditLogs(request, ctx);
  }

  if (!COLLECTIONS[resource]) return fail("NOT_FOUND");
  if (resource === "students" && parts.length === 3 && request.method === "GET") return getStudentDetail(ctx, parts[2]);
  if (parts.length === 2 && request.method === "GET") return listResource(request, ctx, resource);
  if (parts.length === 2 && request.method === "POST" && ["students", "staff"].includes(resource)) return fail("METHOD_NOT_ALLOWED", "Use the trusted Firebase Auth account provisioning endpoint.");
  if (parts.length === 2 && request.method === "POST") return createResource(request, ctx, resource);
  if (parts.length === 3 && request.method === "PATCH") return updateResource(request, ctx, resource, parts[2]);
  if (parts.length === 4 && parts[3] === "deactivate" && request.method === "POST") return updateResource(request, ctx, resource, parts[2], true);
  return fail("NOT_FOUND");
}
