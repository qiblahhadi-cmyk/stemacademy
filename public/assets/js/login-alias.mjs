/**
 * Convert an immutable academy ID into its internal Firebase email/password
 * login alias. This is an identifier only, not a deliverable email address.
 */
const LOGIN_ALIAS_DOMAIN = "stemacademy.edu.pk";
const ACADEMY_ID_PATTERN = /^(?:SA-\d{4}-\d{3}|SA-(?:TCH|ADM)-\d{3})$/;

export function academyIdToAuthEmail(academyId) {
  if (typeof academyId !== "string") {
    throw new TypeError("A valid academy ID is required.");
  }

  const normalized = academyId.trim().toUpperCase();
  if (!ACADEMY_ID_PATTERN.test(normalized)) {
    throw new TypeError("Academy ID format is invalid.");
  }

  return `${normalized.toLowerCase()}@${LOGIN_ALIAS_DOMAIN}`;
}
