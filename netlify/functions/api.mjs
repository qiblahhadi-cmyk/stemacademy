import { authenticate } from "./lib/auth-middleware.mjs";
import { getDb } from "./lib/firebase-admin.mjs";
import {
  requireClassAccess,
  requireTeachingAssignment,
  requireClassTeachingAssignment
} from "./lib/authorization.mjs";
import { jsonResponse, errorResponse } from "./lib/response.mjs";
import { API_ERRORS } from "./lib/errors.mjs";

function getRoutePath(request) {
  const pathname = new URL(request.url).pathname;

  return pathname
    .replace(/^\/\.netlify\/functions\/api/, "")
    .replace(/^\/api/, "") || "/";
}

async function getClassSubject(user, classId, subjectId) {
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

export default async function handler(request, context) {
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

    // Protected session endpoint
    if (path === "/me" && method === "GET") {
      const user = await authenticate(request);

      return jsonResponse({
        success: true,
        data: {
          uid: user.uid,
          role: user.role,
          displayName: user.displayName
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
