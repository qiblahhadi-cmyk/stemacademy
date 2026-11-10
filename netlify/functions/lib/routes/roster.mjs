import { requireClassTeachingAssignment } from "../authorization.mjs";
import { jsonResponse, errorResponse } from "../response.mjs";
import { API_ERRORS } from "../errors.mjs";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const fail = (code, message) => errorResponse(code, message ?? API_ERRORS[code].message, API_ERRORS[code].status);

/** Only these fields leave the server for roster rows: no UIDs, emails or timestamps. */
function person(profile) {
  return { academyId: profile.academyId ?? null, displayName: profile.displayName || "Unnamed account" };
}

async function loadProfiles(db, uids) {
  const unique = [...new Set(uids)];
  const snapshots = await Promise.all(unique.map((uid) => db.collection("users").doc(uid).get()));
  return new Map(snapshots.filter((snap) => snap.exists).map((snap) => [snap.id, snap.data()]));
}

/**
 * GET /classes/{classId}/roster. Administrators see any active class. Teachers
 * see a class only with an active teaching assignment; anything else is a
 * 404 so that class IDs cannot be probed. Students are refused by role.
 */
export async function handleRoster(request, ctx) {
  if (request.method !== "GET") return fail("METHOD_NOT_ALLOWED");
  if (!["admin", "teacher"].includes(ctx.user?.role)) return fail("FORBIDDEN");
  const segments = ctx.path.split("/").filter(Boolean);
  const classId = segments[1];
  if (segments.length !== 3 || !ID.test(classId ?? "")) return fail("NOT_FOUND");

  try {
    const classSnap = await ctx.db.collection("classes").doc(classId).get();
    if (!classSnap.exists || classSnap.data().active !== true) return fail("NOT_FOUND");
    if (ctx.user.role === "teacher") await requireClassTeachingAssignment(ctx.db, ctx.user, classId);

    const [memberships, assignments] = await Promise.all([
      ctx.db.collection("classAccess").where("classId", "==", classId)
        .where("accessType", "==", "student").where("active", "==", true).limit(500).get(),
      ctx.db.collection("teachingAssignments").where("classId", "==", classId)
        .where("active", "==", true).limit(100).get()
    ]);

    const studentUids = memberships.docs.map((doc) => doc.data().userUid).filter(Boolean);
    const teacherUids = assignments.docs.map((doc) => doc.data().teacherUid).filter(Boolean);
    const profiles = await loadProfiles(ctx.db, [...studentUids, ...teacherUids]);

    const byName = (a, b) => a.displayName.localeCompare(b.displayName, "en");
    const students = [...new Set(studentUids)]
      .map((uid) => profiles.get(uid))
      .filter((profile) => profile?.role === "student" && profile.active === true)
      .map(person).sort(byName);
    const teachers = [...new Set(teacherUids)]
      .map((uid) => profiles.get(uid))
      .filter((profile) => profile?.role === "teacher" && profile.active === true)
      .map(person).sort(byName);

    const classData = classSnap.data();
    return jsonResponse({
      success: true,
      data: {
        class: { id: classSnap.id, name: classData.name, grade: classData.grade, academicSessionId: classData.academicSessionId ?? null },
        counts: { students: students.length, teachers: teachers.length },
        students,
        teachers
      }
    });
  } catch (error) {
    if (error.message === "FORBIDDEN") return fail("NOT_FOUND");
    throw error;
  }
}
