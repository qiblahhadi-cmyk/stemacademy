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
