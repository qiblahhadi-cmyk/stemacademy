import { requireClassAccess } from "../authorization.mjs";
import { jsonResponse, errorResponse } from "../response.mjs";
import { API_ERRORS } from "../errors.mjs";

/*
 * GET /subjects?classId=... returns the subjects a caller may work with in one
 * class. Admins see every active subject for the class grade. Teachers see only
 * subjects with an active teaching assignment in that class. Students see every
 * active subject for the class grade. Out-of-scope and missing classes return
 * the same 404, matching the assignment routes.
 */

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

function notFound() {
  return errorResponse("NOT_FOUND", API_ERRORS.NOT_FOUND.message, API_ERRORS.NOT_FOUND.status);
}

function toResponseSubject(id, data) {
  return { id, name: data.name, board: data.board, grade: data.grade };
}

export async function handleSubjects(request, ctx) {
  if (request.method !== "GET") {
    return errorResponse("METHOD_NOT_ALLOWED", API_ERRORS.METHOD_NOT_ALLOWED.message, 405);
  }

  const classId = new URL(request.url).searchParams.get("classId");
  if (typeof classId !== "string" || !ID_PATTERN.test(classId)) {
    return errorResponse("INVALID_INPUT", "A valid classId is required.", 400);
  }

  const { db, user } = ctx;

  try {
    if (user.role === "student") {
      await requireClassAccess(db, user, classId, "student");
    } else if (user.role === "teacher") {
      await requireClassAccess(db, user, classId, "teacher");
    } else if (user.role !== "admin") {
      return notFound();
    }

    const classSnapshot = await db.collection("classes").doc(classId).get();
    if (!classSnapshot.exists || classSnapshot.data().active !== true) {
      return notFound();
    }
    const grade = classSnapshot.data().grade;

    let subjectIds = null; // null means "every active subject for the grade"
    if (user.role === "teacher") {
      const assignments = await db.collection("teachingAssignments")
        .where("teacherUid", "==", user.uid)
        .where("classId", "==", classId)
        .where("active", "==", true)
        .limit(200)
        .get();
      subjectIds = [...new Set(assignments.docs.map((doc) => doc.data().subjectId).filter(Boolean))];
    }

    const candidateIds = subjectIds ?? (await db.collection("subjects")
      .where("grade", "==", grade)
      .where("active", "==", true)
      .limit(200)
      .get()).docs.map((doc) => doc.id);

    const snapshots = await Promise.all(candidateIds.map((id) => db.collection("subjects").doc(id).get()));

    const subjects = snapshots
      .filter((snap) => snap.exists)
      .map((snap) => ({ snap, data: snap.data() }))
      .filter(({ data }) => data.active === true && data.grade === grade)
      .map(({ snap, data }) => toResponseSubject(snap.id, data));

    return jsonResponse({ success: true, data: { subjects } });
  } catch (error) {
    if (error.message === "FORBIDDEN" || error.message === "NOT_FOUND") {
      return notFound();
    }
    throw error;
  }
}
