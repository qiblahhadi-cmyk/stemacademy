import { requireClassAccess, requireTeachingAssignment } from "../authorization.mjs";

/**
 * Class and subject scope for routes that act on subject-level records.
 * Teachers need an active teaching assignment for the exact class and subject.
 * Students need active membership of the class. Administrators are academy-wide.
 * In every case the class and subject must exist, be active, and share a grade.
 * Throws FORBIDDEN or NOT_FOUND; callers map both to the same not-found response.
 */
export async function authorizeClassSubject(db, user, classId, subjectId) {
  if (user.role === "teacher") {
    await requireTeachingAssignment(db, user, classId, subjectId);
  } else if (user.role === "student") {
    await requireClassAccess(db, user, classId, "student");
  } else if (user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }

  const [classSnap, subjectSnap] = await Promise.all([
    db.collection("classes").doc(classId).get(),
    db.collection("subjects").doc(subjectId).get()
  ]);
  if (!classSnap.exists || !subjectSnap.exists) throw new Error("NOT_FOUND");

  const classData = classSnap.data();
  const subjectData = subjectSnap.data();
  if (classData.active !== true || subjectData.active !== true || classData.grade !== subjectData.grade) {
    throw new Error("NOT_FOUND");
  }
}
