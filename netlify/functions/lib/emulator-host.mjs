/**
 * Strict local-only Firebase Emulator endpoint policy.
 * Keep these exact endpoints aligned with firebase.json and package scripts.
 */
export const LOCAL_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
export const LOCAL_FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

export function assertLocalEmulatorHosts(authHost, firestoreHost) {
  if (authHost !== LOCAL_AUTH_EMULATOR_HOST || firestoreHost !== LOCAL_FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      `Firebase emulator hosts must be exactly ${LOCAL_AUTH_EMULATOR_HOST} and ${LOCAL_FIRESTORE_EMULATOR_HOST}. Remote, alternate, and malformed hosts are refused.`
    );
  }
}
