/*
 * Which pages each role may open. This drives navigation and the browser-side
 * page guard only. The server remains authoritative for every API call, so a
 * hidden link or a skipped guard does not grant access to data.
 * Mapping approved by the academy owner.
 */
const ALL = ["admin", "teacher", "student"];
const STAFF = ["admin", "teacher"];
const ADMIN = ["admin"];

export const PAGE_POLICY = Object.freeze({
  "activate-account.html": ALL,
  "index.html": ALL,
  "assignments.html": ALL,
  // Owner decision: hidden for V1 until official AJK syllabus content is verified.
  "course-hub.html": [],
  "communication.html": ALL,
  "chitchat.html": ALL,
  "profile.html": ALL,
  "classes.html": STAFF,
  "subjects.html": STAFF,
  "attendance.html": STAFF,
  "my-attendance.html": ["student"],
  "assessments.html": STAFF,
  "activity-logs.html": ADMIN,
  "settings.html": ADMIN,
  "admin-management.html": ADMIN,
  "role-preview.html": ADMIN,
  // Student assessment page: students and administrators by URL. Teachers are excluded pending owner review.
  "take-assessment.html": ["student", "admin"],
  "my-assessments.html": ["student", "admin"]
});

/**
 * Some navigation entries lead to a different page for certain roles. Students
 * see the Assessments entry as their own list, not the staff management page.
 */
export const NAV_REDIRECTS = Object.freeze({
  student: Object.freeze({ "assessments.html": "my-assessments.html", "attendance.html": "my-attendance.html" })
});

/** The page a navigation link should point to for this role. */
export function navTargetFor(role, page) {
  return NAV_REDIRECTS[role]?.[page] ?? page;
}

/** "/assignments.html" -> "assignments.html"; "/" -> "index.html". */
export function pageKey(pathname) {
  const name = String(pathname || "").split("/").pop().split(/[?#]/)[0];
  return name || "index.html";
}

/** Unknown pages are denied to everyone except admins. */
export function canViewPage(role, page) {
  const roles = PAGE_POLICY[page];
  if (!roles) return role === "admin";
  return roles.includes(role);
}
