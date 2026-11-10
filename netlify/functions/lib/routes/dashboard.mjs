import { visibleClassIds, visibleNotices } from "./notices.mjs";
import { jsonResponse, errorResponse } from "../response.mjs";
import { API_ERRORS } from "../errors.mjs";
import { unreadMessageCount } from "./chitchat.mjs";

const fail = (code) => errorResponse(code, API_ERRORS[code].message, API_ERRORS[code].status);

/** Distinct students with an active membership AND an active student account. */
async function countStudentsIn(db, classIds) {
  if (classIds.length === 0) return 0;
  const snapshots = await Promise.all(classIds.map((classId) => db.collection("classAccess")
    .where("classId", "==", classId).where("accessType", "==", "student")
    .where("active", "==", true).limit(500).get()));
  const uids = [...new Set(snapshots.flatMap((snap) => snap.docs.map((doc) => doc.data().userUid)).filter(Boolean))];
  const profiles = await Promise.all(uids.map((uid) => db.collection("users").doc(uid).get()));
  return profiles.filter((snap) => snap.exists && snap.data().role === "student" && snap.data().active === true).length;
}

async function adminMetrics(db, user) {
  const [classes, students, staff, notices] = await Promise.all([
    db.collection("classes").where("active", "==", true).limit(500).get(),
    db.collection("users").where("role", "==", "student").where("active", "==", true).limit(1000).get(),
    db.collection("users").where("role", "==", "teacher").where("active", "==", true).limit(500).get(),
    visibleNotices(db, user)
  ]);
  return {
    activeClasses: classes.docs.length,
    activeStudents: students.docs.length,
    activeTeachers: staff.docs.length,
    activeNotices: notices.length,
    unreadMessages: await unreadMessageCount(db, user, classes.docs.map((doc) => doc.id))
  };
}

async function teacherMetrics(db, user) {
  const classIds = await visibleClassIds(db, user);
  const [assignments, notices, students] = await Promise.all([
    db.collection("teachingAssignments").where("teacherUid", "==", user.uid).where("active", "==", true).limit(200).get(),
    visibleNotices(db, user),
    countStudentsIn(db, classIds)
  ]);
  return {
    assignedClasses: classIds.length,
    studentsInMyClasses: students,
    myTeachingAssignments: assignments.docs.filter((doc) => classIds.includes(doc.data().classId)).length,
    visibleNotices: notices.length,
    unreadMessages: await unreadMessageCount(db, user, classIds)
  };
}

async function studentMetrics(db, user) {
  const memberships = await db.collection("classAccess").where("userUid", "==", user.uid)
    .where("accessType", "==", "student").where("active", "==", true).limit(100).get();
  const classSnaps = await Promise.all(memberships.docs.map((doc) => db.collection("classes").doc(doc.data().classId).get()));
  const notices = await visibleNotices(db, user);
  const activeClassIds = memberships.docs.filter((doc, i) => classSnaps[i].exists && classSnaps[i].data().active === true).map((doc) => doc.data().classId);
  return {
    enrolledClasses: activeClassIds.length,
    visibleNotices: notices.length,
    unreadMessages: await unreadMessageCount(db, user, activeClassIds)
  };
}

/** GET /dashboard: role-specific counts only. Each role sees its own scope; nothing is sampled or estimated. */
export async function handleDashboard(request, ctx) {
  if (request.method !== "GET") return fail("METHOD_NOT_ALLOWED");
  const { user, db } = ctx;
  let metrics;
  if (user.role === "admin") metrics = await adminMetrics(db, user);
  else if (user.role === "teacher") metrics = await teacherMetrics(db, user);
  else if (user.role === "student") metrics = await studentMetrics(db, user);
  else return fail("FORBIDDEN");
  return jsonResponse({ success: true, data: { role: user.role, metrics } });
}
