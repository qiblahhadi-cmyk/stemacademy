/*
 * Binds the session core to the real Firebase Auth SDK. Configuration is injected
 * at build time by scripts/build-client.mjs. These values are public web config,
 * but they still come from the environment and are never typed into source.
 */
import { initializeApp } from "firebase/app";
import {
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";

/* global __FIREBASE_WEB_CONFIG__, __FIREBASE_USE_EMULATOR__ */

export function createFirebaseAuthAdapter() {
  const app = initializeApp(__FIREBASE_WEB_CONFIG__);
  const auth = getAuth(app);

  if (__FIREBASE_USE_EMULATOR__) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  }

  // Session-only persistence: the sign-in ends when the browser closes. Classroom
  // computers are shared, so nothing survives a closed browser.
  const persistence = setPersistence(auth, browserSessionPersistence);

  return {
    currentUser: () => auth.currentUser,
    signIn: async (email, password) => {
      await persistence;
      return signInWithEmailAndPassword(auth, email, password);
    },
    signOut: () => signOut(auth),
    onChange: (callback) => onAuthStateChanged(auth, callback)
  };
}
