import { assertLocalEmulatorHosts } from "./emulator-host.mjs";

/**
 * Resolve Firebase Admin configuration without initializing any SDK clients.
 * Emulator mode is deliberately fail-closed: both emulators and a demo-
 * project ID are mandatory whenever either emulator host is supplied.
 */
export function resolveFirebaseConfig(env = process.env) {
  const projectId =
    env.FIREBASE_ADMIN_PROJECT_ID ||
    env.GCLOUD_PROJECT ||
    env.GOOGLE_CLOUD_PROJECT;

  const authEmulatorHost = env.FIREBASE_AUTH_EMULATOR_HOST;
  const firestoreEmulatorHost = env.FIRESTORE_EMULATOR_HOST;
  const emulatorRequested = Boolean(authEmulatorHost || firestoreEmulatorHost);

  if (emulatorRequested) {
    if (!authEmulatorHost || !firestoreEmulatorHost) {
      throw new Error("Both Firebase Auth and Firestore emulator hosts must be configured.");
    }

    assertLocalEmulatorHosts(authEmulatorHost, firestoreEmulatorHost);

    if (!projectId?.startsWith("demo-")) {
      throw new Error("Firebase emulator mode requires a demo- project ID.");
    }

    return { mode: "emulator", projectId };
  }

  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase server configuration missing.");
  }

  return {
    mode: "service-account",
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n")
  };
}
