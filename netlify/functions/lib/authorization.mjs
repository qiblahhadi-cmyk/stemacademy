import { createHash } from "node:crypto";

/** Canonical document key for one class/user/access tuple. */
export function classAccessDocumentId(classId, userUid, accessType) {
  if (![classId, userUid].every((value) => typeof value === "string" && value.length > 0) ||
      !["student", "teacher"].includes(accessType)) {
    throw new TypeError("A valid class, user and access type are required.");
  }
  return `ca_${createHash("sha256").update(JSON.stringify([classId, accessType, userUid])).digest("hex")}`;
}

function deny() {
  throw new Error("FORBIDDEN");
}

export function requireRole(user, allowedRoles) {
  if (!user || !Array.isArray(allowedRoles) || !allowedRoles.includes(user.role)) {
    deny();
  }

  return user;
}

export function requireStudentOwner(user, studentUid) {
  if (!user || user.role !== "student" || user.uid !== studentUid) {
    deny();
  }

  return user;
}

export async function requireClassAccess(db, user, classId, accessType) {
  if (!user?.uid || !classId || !["teacher", "student"].includes(accessType)) {
    deny();
  }

  if (user.role === "admin") return user;

  const snapshot = await db.collection("classAccess")
    .where("userUid", "==", user.uid)
    .where("classId", "==", classId)
    .where("accessType", "==", accessType)
    .where("active", "==", true)
    .limit(1)
    .get();

  if (snapshot.empty) deny();

  return user;
}

export async function requireTeachingAssignment(db, user, classId, subjectId) {
  if (!user?.uid || user.role !== "teacher" || !classId || !subjectId) {
    deny();
  }

  await requireClassAccess(db, user, classId, "teacher");

  const snapshot = await db.collection("teachingAssignments")
    .where("teacherUid", "==", user.uid)
    .where("classId", "==", classId)
    .where("subjectId", "==", subjectId)
    .where("active", "==", true)
    .limit(1)
    .get();

  if (snapshot.empty) deny();

  return user;
}

export async function requireClassTeachingAssignment(db, user, classId) {
  if (!user?.uid || user.role !== "teacher" || !classId) {
    deny();
  }

  await requireClassAccess(db, user, classId, "teacher");

  const snapshot = await db.collection("teachingAssignments")
    .where("teacherUid", "==", user.uid)
    .where("classId", "==", classId)
    .where("active", "==", true)
    .limit(1)
    .get();

  if (snapshot.empty) deny();

  return user;
}

/**
 * Authorization checks for protected Firestore transactions. Every scope document
 * is read through the caller's transaction so a concurrent deactivation causes
 * Firestore to retry the operation against the revoked state.
 * All reads are completed before callers issue any writes.
 */
export async function txAuthorizeScope(tx, db, user, classId, subjectId = null) {
  if (!user?.uid || !classId || !["admin", "teacher", "student"].includes(user.role)) deny();

  const classRef = db.collection("classes").doc(classId);
  const subjectRef = subjectId ? db.collection("subjects").doc(subjectId) : null;
  const reads = [tx.get(classRef)];
  if (subjectRef) reads.push(tx.get(subjectRef));

  let membershipIndex = -1;
  let assignmentIndex = -1;
  if (user.role === "teacher" || user.role === "student") {
    membershipIndex = reads.length;
    reads.push(tx.get(db.collection("classAccess").doc(
      classAccessDocumentId(classId, user.uid, user.role)
    )));
  }
  if (user.role === "teacher") {
    assignmentIndex = reads.length;
    let assignmentQuery = db.collection("teachingAssignments")
      .where("teacherUid", "==", user.uid)
      .where("classId", "==", classId);
    if (subjectId) assignmentQuery = assignmentQuery.where("subjectId", "==", subjectId);
    reads.push(tx.get(assignmentQuery.where("active", "==", true).limit(100)));
  }

  const snapshots = await Promise.all(reads);
  const classSnap = snapshots[0];
  if (!classSnap.exists || classSnap.data().active !== true) throw new Error("NOT_FOUND");

  if (subjectRef) {
    const subjectSnap = snapshots[1];
    if (!subjectSnap.exists || subjectSnap.data().active !== true ||
        classSnap.data().grade !== subjectSnap.data().grade) throw new Error("NOT_FOUND");
  }

  if (membershipIndex >= 0) {
    const membershipSnap = snapshots[membershipIndex];
    if (!membershipSnap.exists) deny();
    const membership = membershipSnap.data();
    if (membership.classId !== classId || membership.userUid !== user.uid ||
        membership.accessType !== user.role || membership.active !== true) deny();
  }

  if (assignmentIndex >= 0) {
    const assignmentSnap = snapshots[assignmentIndex];
    const assignments = assignmentSnap.docs ?? [];
    if (!assignments.some((doc) => {
      const data = doc.data();
      return data.teacherUid === user.uid && data.classId === classId && data.active === true &&
        (!subjectId || data.subjectId === subjectId);
    })) deny();
  }

  return user;
}
