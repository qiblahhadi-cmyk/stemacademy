
const VALID_ROLES = ["admin", "teacher", "student"];

export async function authenticate(request, { allowPendingActivation = false, adminAuth: injectedAuth, db: injectedDb } = {}) {
  const header = request.headers.get("authorization");

  if (!header?.startsWith("Bearer ")) {
    throw new Error("UNAUTHENTICATED");
  }

  const token = header.substring(7).trim();

  if (!token) {
    throw new Error("UNAUTHENTICATED");
  }

  // Load the Admin SDK only for protected requests. Public health checks can
  // run without initializing Firebase or requiring credentials.
  const services = injectedAuth && injectedDb ? { auth: injectedAuth, db: injectedDb } : await (async () => {
    const { getAdminAuth, getDb } = await import("./firebase-admin.mjs");
    return { auth: getAdminAuth(), db: getDb() };
  })();

  let decoded;

  try {
    decoded = await services.auth.verifyIdToken(token, true);
  } catch {
    throw new Error("UNAUTHENTICATED");
  }

  const snapshot = await services.db
    .collection("users")
    .doc(decoded.uid)
    .get();

  if (!snapshot.exists) {
    throw new Error("ACCOUNT_NOT_CONFIGURED");
  }

  const user = snapshot.data();

  if (!VALID_ROLES.includes(user.role)) {
    throw new Error("INVALID_ROLE");
  }

  const mustChangePassword = decoded.mustChangePassword === true;
  if (mustChangePassword) {
    if (!allowPendingActivation) throw new Error("PASSWORD_CHANGE_REQUIRED");
    const validActivationState = (user.active === false && user.provisioningStatus === "credential_issued") ||
      (user.active === true && user.provisioningStatus === "active");
    if (!validActivationState) throw new Error("ACCOUNT_DISABLED");
  } else if (user.active !== true) {
    throw new Error("ACCOUNT_DISABLED");
  }

  return {
    uid: decoded.uid,
    role: user.role,
    active: user.active,
    displayName: user.displayName || "",
    mustChangePassword
  };
}
