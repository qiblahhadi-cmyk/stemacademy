import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { resolveFirebaseConfig } from "./firebase-config.mjs";

function getFirebaseApp() {
  const existing = getApps();

  if (existing.length > 0) {
    return existing[0];
  }

  const config = resolveFirebaseConfig();

  if (config.mode === "emulator") {
    // Emulator mode never loads live credentials or silently falls back.
    return initializeApp({ projectId: config.projectId });
  }

  return initializeApp({
    credential: cert({
      projectId: config.projectId,
      clientEmail: config.clientEmail,
      privateKey: config.privateKey
    }),
    projectId: config.projectId
  });
}

export function getAdminAuth() {
  return getAuth(getFirebaseApp());
}

export function getDb() {
  return getFirestore(getFirebaseApp());
}
