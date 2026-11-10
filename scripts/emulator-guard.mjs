/*
 * Refuses any local setup that could touch a live Firebase project. Used by the
 * emulator seed script and the emulator client build. Pure function: no I/O.
 */
import { LOCAL_AUTH_EMULATOR_HOST, LOCAL_FIRESTORE_EMULATOR_HOST, assertLocalEmulatorHosts } from "../netlify/functions/lib/emulator-host.mjs";

export const EMULATOR_AUTH_HOST = LOCAL_AUTH_EMULATOR_HOST;
export const EMULATOR_FIRESTORE_HOST = LOCAL_FIRESTORE_EMULATOR_HOST;

export function assertEmulatorEnv(env) {
  if (env.NETLIFY) {
    throw new Error("Emulator tooling must never run in a Netlify build.");
  }
  if (!env.FIREBASE_AUTH_EMULATOR_HOST || !env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Set FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST to the local emulators.");
  }
  assertLocalEmulatorHosts(env.FIREBASE_AUTH_EMULATOR_HOST, env.FIRESTORE_EMULATOR_HOST);
  const project = env.FIREBASE_ADMIN_PROJECT_ID || env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT || "";
  if (!project.startsWith("demo-")) {
    throw new Error("Emulator tooling requires a demo- project ID.");
  }
  return project;
}
