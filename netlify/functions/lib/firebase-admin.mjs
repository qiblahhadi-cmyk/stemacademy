import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getFirebaseApp() {
  const existing = getApps();

  if (existing.length > 0) {
    return existing[0];
  }

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT;

  const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const firestoreEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const emulatorRequested = Boolean(authEmulatorHost || firestoreEmulatorHost);

  if (emulatorRequested) {
    // Never silently fall back to live Firebase credentials in emulator mode.
    if (!authEmulatorHost || !firestoreEmulatorHost) {
      throw new Error("Both Firebase Auth and Firestore emulator hosts must be configured.");
    }

    if (!projectId?.startsWith("demo-")) {
      throw new Error("Firebase emulator mode requires a demo- project ID.");
    }

    return initializeApp({ projectId });
  }

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase server configuration missing.");
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n")
    }),
    projectId
  });
}

export function getAdminAuth() {
  return getAuth(getFirebaseApp());
}

export function getDb() {
  return getFirestore(getFirebaseApp());
}
