import { authenticate } from "./lib/auth-middleware.mjs";
import {
  requireClassAccess,
  requireTeachingAssignment,
  requireClassTeachingAssignment
} from "./lib/authorization.mjs";
import { jsonResponse, errorResponse } from "./lib/response.mjs";
import { API_ERRORS } from "./lib/errors.mjs";

/** Current academy calendar date (YYYY-MM-DD) in Asia/Karachi. */
function academyToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
}

function getRoutePath(request) {
  const pathname = new URL(request.url).pathname;

  let path = pathname
    .replace(/^\/\.netlify\/functions\/api/, "")
    .replace(/^\/api/, "");

  // Accept both /api/classes and the documented /api/v1/classes form.
  path = path.replace(/^\/v1(?=\/|$)/, "") || "/";
  return path || "/";
}

async function getClassSubject(user, classId, subjectId) {
  const { getDb } = await import("./lib/firebase-admin.mjs");
  const db = getDb();

  // Authorize the requested scope before looking up or returning its records.
  if (user.role === "teacher") {
    await requireTeachingAssignment(db, user, classId, subjectId);
  } else if (user.role === "student") {
    await requireClassAccess(db, user, classId, "student");
  } else if (user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }

  const [classSnapshot, subjectSnapshot] = await Promise.all([
    db.collection("classes").doc(classId).get(),
    db.collection("subjects").doc(subjectId).get()
  ]);

  if (!classSnapshot.exists || !subjectSnapshot.exists) {
    throw new Error("NOT_FOUND");
  }

  const classData = classSnapshot.data();
  const subjectData = subjectSnapshot.data();

  if (
    classData.active !== true ||
    subjectData.active !== true ||
    classData.grade !== subjectData.grade
  ) {
    throw new Error("NOT_FOUND");
  }

  // Return an explicit allowlist; never serialize whole Firestore documents.
  return jsonResponse({
    success: true,
    data: {
      class: {
        id: classSnapshot.id,
        name: classData.name,
        grade: classData.grade,
        academicSessionId: classData.academicSessionId
      },
      subject: {
        id: subjectSnapshot.id,
        name: subjectData.name,
        board: subjectData.board,
        grade: subjectData.grade
      }
    }
  });
}


async function listClasses(user) {
  const { getDb } = await import("./lib/firebase-admin.mjs");
  const db = getDb();
  let classIds = [];

  if (user.role === "admin") {
    const snapshot = await db.collection("classes")
      .where("active", "==", true)
      .limit(100)
      .get();
    classIds = snapshot.docs.map(doc => doc.id);
  } else {
    const accessType = user.role === "teacher" ? "teacher" : "student";
    const accessSnapshot = await db.collection("classAccess")
      .where("userUid", "==", user.uid)
      .where("accessType", "==", accessType)
      .where("active", "==", true)
      .limit(100)
      .get();

    classIds = [...new Set(accessSnapshot.docs.map(doc => doc.data().classId).filter(Boolean))];
  }

  const visibleClasses = await Promise.all(classIds.map(async (classId) => {
    if (user.role === "teacher") {
      try {
        await requireClassTeachingAssignment(db, user, classId);
      } catch (error) {
        if (error.message === "FORBIDDEN") return null;
        throw error;
      }
    }

    const snapshot = await db.collection("classes").doc(classId).get();
    if (!snapshot.exists) return null;

    const data = snapshot.data();
    if (data.active !== true) return null;

    return {
      id: snapshot.id,
      name: data.name,
      grade: data.grade,
      academicSessionId: data.academicSessionId
    };
  }));

  return jsonResponse({
    success: true,
    data: {
      classes: visibleClasses.filter(Boolean)
    }
  });
}

export async function handler(request, context) {
  const path = getRoutePath(request);
  const method = request.method;

  try {
    // Public health endpoint
    if (path === "/health" && method === "GET") {
      return jsonResponse({
        success: true,
        application: "STEM Academy",
        version: "1.1.0",
        status: "operational"
      });
    }

    // First-password completion is the only API action allowed while the
    // verified owner-issued mustChangePassword claim is present.
    if (path === "/auth/complete-password-change") {
      const user = await authenticate(request, { allowPendingActivation: true });
      const { getDb, getAdminAuth } = await import("./lib/firebase-admin.mjs");
      const { FieldValue } = await import("firebase-admin/firestore");
      const { handleAccountActivation } = await import("./lib/routes/account-activation.mjs");
      return await handleAccountActivation(request, { path, user, db: getDb(), auth: getAdminAuth(), serverTimestamp: () => FieldValue.serverTimestamp() });
    }

    // Own display name only (PATCH /me). Other profile fields are not writable here.
    if (path === "/me" && method === "PATCH") {
      const user = await authenticate(request);
      const { getDb } = await import("./lib/firebase-admin.mjs");
      const { FieldValue } = await import("firebase-admin/firestore");
      const { handleOwnProfile } = await import("./lib/routes/profile.mjs");
      return await handleOwnProfile(request, { path, user, db: getDb(), serverTimestamp: () => FieldValue.serverTimestamp() });
    }

    // Protected session endpoint
    if (path === "/me" && method !== "GET") {
      return errorResponse(
        "METHOD_NOT_ALLOWED",
        API_ERRORS.METHOD_NOT_ALLOWED.message,
        API_ERRORS.METHOD_NOT_ALLOWED.status
      );
    }

    if (path === "/me" && method === "GET") {
      const user = await authenticate(request, { allowPendingActivation: true });

      return jsonResponse({
        success: true,
        data: {
          uid: user.uid,
          role: user.role,
          displayName: user.displayName,
          mustChangePassword: user.mustChangePassword
        }
      });
    }

    // Role-scoped list of active classes.
    if (path === "/classes") {
      if (method !== "GET") {
        return errorResponse(
          "METHOD_NOT_ALLOWED",
          API_ERRORS.METHOD_NOT_ALLOWED.message,
          API_ERRORS.METHOD_NOT_ALLOWED.status
        );
      }

      const user = await authenticate(request);
      return await listClasses(user);
    }

    // Assignment workflow. Authentication happens first; the route module
    // enforces role, class/subject scope, validation and audit logging.
    if (path === "/assignments" || path.startsWith("/assignments/")) {
      const user = await authenticate(request);
      const { getDb } = await import("./lib/firebase-admin.mjs");
      const { FieldValue } = await import("firebase-admin/firestore");
      const { handleAssignments } = await import("./lib/routes/assignments.mjs");
      return await handleAssignments(request, {
        path,
        user,
        db: getDb(),
        serverTimestamp: () => FieldValue.serverTimestamp()
      });
    }

    // Student text submissions and teacher review for existing assignments.
    if (path === "/assignment-submissions" || path.startsWith("/assignment-submissions/")) {
      const user = await authenticate(request);
      const { getDb } = await import("./lib/firebase-admin.mjs");
      const { FieldValue } = await import("firebase-admin/firestore");
      const { handleAssignmentSubmissions } = await import("./lib/routes/assignment-submissions.mjs");
      return await handleAssignmentSubmissions(request, { path, user, db: getDb(), serverTimestamp: () => FieldValue.serverTimestamp(), now: () => new Date() });
    }

    // Curriculum records are separate from subject metadata; only verified records may be published.
    if (path === "/curriculum" || path.startsWith("/curriculum/")) {
      const user = await authenticate(request);
      const { getDb } = await import("./lib/firebase-admin.mjs");
      const { FieldValue } = await import("firebase-admin/firestore");
      const { handleCurriculum } = await import("./lib/routes/curriculum.mjs");
      return await handleCurriculum(request, { path, user, db: getDb(), serverTimestamp: () => FieldValue.serverTimestamp() });
    }

    // Administrator-only people, academic structure and account provisioning.
    if (path === "/admin" || path.startsWith("/admin/")) {
      const user = await authenticate(request);
      const { getDb, getAdminAuth } = await import("./lib/firebase-admin.mjs");
      const { FieldValue } = await import("firebase-admin/firestore");
      const { handleAdmin } = await import("./lib/routes/admin.mjs");
      return await handleAdmin(request, {
        path, user, db: getDb(), auth: getAdminAuth(),
        serverTimestamp: () => FieldValue.serverTimestamp(), now: () => new Date()
      });
    }

    // Membership administration is restricted to the authenticated administrator.
    if (path === "/memberships" || path.startsWith("/memberships/")) {
      const user = await authenticate(request);
      const { getDb } = await import("./lib/firebase-admin.mjs");
      const { FieldValue } = await import("firebase-admin/firestore");
      const { handleMemberships } = await import("./lib/routes/memberships.mjs");
      return await handleMemberships(request, {
        path, user, db: getDb(), serverTimestamp: () => FieldValue.serverTimestamp()
      });
    }

    // Persistent in-app notices; no external delivery integrations.
    if (path === "/notices" || path.startsWith("/notices/")) {
      const user = await authenticate(request);
      const { getDb } = await import("./lib/firebase-admin.mjs");
      const { FieldValue } = await import("firebase-admin/firestore");
      const { handleNotices } = await import("./lib/routes/notices.mjs");
      return await handleNotices(request, {
        path, user, db: getDb(), serverTimestamp: () => FieldValue.serverTimestamp()
      });
    }

    // ChitChat: all message operations are authenticated and class-scoped server-side.
    if (path === "/chitchat" || path.startsWith("/chitchat/")) {
      const user = await authenticate(request);
      const { getDb } = await import("./lib/firebase-admin.mjs");
      const { FieldValue } = await import("firebase-admin/firestore");
      const { handleChitChat } = await import("./lib/routes/chitchat.mjs");
      return await handleChitChat(request, { path, user, db: getDb(), serverTimestamp: () => FieldValue.serverTimestamp(), now: () => new Date() });
    }

    // Subjects available to the caller within one class.
    if (path === "/subjects") {
      const user = await authenticate(request);
      const { getDb } = await import("./lib/firebase-admin.mjs");
      const { handleSubjects } = await import("./lib/routes/subjects.mjs");
      return await handleSubjects(request, { user, db: getDb() });
    }

    // Attendance (teacher and administrator only; enforced in the route module).
    if (path === "/attendance" || path.startsWith("/attendance/")) {
      const user = await authenticate(request);
      const { getDb } = await import("./lib/firebase-admin.mjs");
      const { FieldValue } = await import("firebase-admin/firestore");
      const { handleAttendance } = await import("./lib/routes/attendance.mjs");
      return await handleAttendance(request, {
        path,
        user,
        db: getDb(),
        serverTimestamp: () => FieldValue.serverTimestamp(),
        today: academyToday
      });
    }

    // Assessments: staff manage drafts; students start and submit attempts.
    if (path === "/assessments" || path.startsWith("/assessments/")) {
      const user = await authenticate(request);
      const { getDb } = await import("./lib/firebase-admin.mjs");
      const { FieldValue } = await import("firebase-admin/firestore");
      const { handleAssessments } = await import("./lib/routes/assessments.mjs");
      return await handleAssessments(request, {
        path,
        user,
        db: getDb(),
        serverTimestamp: () => FieldValue.serverTimestamp(),
        now: () => new Date()
      });
    }

    // Staff roster for one class: administrators, or teachers with an active assignment.
    const rosterMatch = path.match(/^\/classes\/([^/]+)\/roster$/);
    if (rosterMatch) {
      const user = await authenticate(request);
      const { getDb } = await import("./lib/firebase-admin.mjs");
      const { handleRoster } = await import("./lib/routes/roster.mjs");
      return await handleRoster(request, { path, user, db: getDb() });
    }

    // Role-specific dashboard counts.
    if (path === "/dashboard") {
      const user = await authenticate(request);
      const { getDb } = await import("./lib/firebase-admin.mjs");
      const { handleDashboard } = await import("./lib/routes/dashboard.mjs");
      return await handleDashboard(request, { path, user, db: getDb() });
    }

    // First protected academic-data read endpoint.
    const classSubjectMatch = path.match(/^\/classes\/([^/]+)\/subjects\/([^/]+)$/);

    if (classSubjectMatch) {
      if (method !== "GET") {
        return errorResponse(
          "METHOD_NOT_ALLOWED",
          API_ERRORS.METHOD_NOT_ALLOWED.message,
          API_ERRORS.METHOD_NOT_ALLOWED.status
        );
      }

      const user = await authenticate(request);
      return await getClassSubject(user, classSubjectMatch[1], classSubjectMatch[2]);
    }

    // Unknown route
    return errorResponse(
      "NOT_FOUND",
      "API endpoint not found.",
      404
    );

  } catch (error) {
    const code = API_ERRORS[error.message]
      ? error.message
      : "INTERNAL_ERROR";

    if (code === "INTERNAL_ERROR") {
      // Do not expose internal errors to clients.
      return errorResponse(
        code,
        "An unexpected server error occurred.",
        500
      );
    }

    const details = API_ERRORS[code];

    return errorResponse(
      code,
      details.message,
      details.status
    );
  }
}

export default handler;
