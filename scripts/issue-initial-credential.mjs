/*
 * Owner-verified, one-time initial credential handoff.
 * Emulator mode is demo-project-only. A non-emulator run requires explicit
 * project confirmation, server-only Admin credentials, and verified in-person
 * authorization. Never redirect output or capture it in a terminal transcript.
 */
import { randomBytes } from "node:crypto";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { assertEmulatorEnv } from "./emulator-guard.mjs";

const hasEmulatorConfig = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST);
let projectId;
let appOptions;
if (hasEmulatorConfig) {
  projectId = assertEmulatorEnv(process.env);
  appOptions = { projectId };
} else {
  projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const expectedProjectId = process.env.ACCOUNT_ACTIVATION_EXPECTED_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (process.env.ALLOW_OWNER_ACCOUNT_ACTIVATION !== "true" || !projectId || expectedProjectId !== projectId ||
      !clientEmail || !privateKey || process.env.NETLIFY) {
    throw new Error("Non-emulator credential issuance requires explicit owner activation permission, matching expected project ID, server-only Admin credentials and a local operator shell.");
  }
  if (projectId.startsWith("demo-")) throw new Error("Use emulator mode for demo projects.");
  appOptions = { projectId, credential: cert({ projectId, clientEmail, privateKey }) };
}

const uid = process.argv[2];
const operatorUid = process.env.ACCOUNT_ACTIVATION_OPERATOR_UID?.trim();
if (!uid || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error("Pass the pending Firebase UID as the first argument.");
if (!operatorUid || !/^[A-Za-z0-9_-]{1,128}$/.test(operatorUid) || process.env.ACCOUNT_ACTIVATION_VERIFIED !== "true") {
  throw new Error("Set ACCOUNT_ACTIVATION_OPERATOR_UID and ACCOUNT_ACTIVATION_VERIFIED=true only after the academy's in-person identity check.");
}
if (process.env.NETLIFY) throw new Error("Credential handoff must run in a controlled operator shell, never inside a hosted function/build.");

const app = initializeApp(appOptions);
const auth = getAuth(app);
const db = getFirestore(app);
const operatorSnap = await db.collection("users").doc(operatorUid).get();
if (!operatorSnap.exists || operatorSnap.data().role !== "admin" || operatorSnap.data().active !== true) {
  throw new Error("The named operator must be an active administrator in the target project.");
}
const userRef = db.collection("users").doc(uid);
const snapshot = await userRef.get();
if (!snapshot.exists || !["student", "teacher"].includes(snapshot.data().role) ||
    snapshot.data().provisioningStatus !== "pending_activation" || snapshot.data().active !== false) {
  throw new Error("The target must be an inactive student/teacher account in pending_activation state.");
}
const authUser = await auth.getUser(uid);
if (authUser.disabled !== true || authUser.customClaims?.mustChangePassword === true) {
  throw new Error("The corresponding Auth account must still be disabled and have no outstanding password-change claim.");
}
const temporaryPassword = randomBytes(24).toString("base64url");

// Acquire a one-time Firestore state lock before touching Firebase Auth. If the
// process is interrupted, the account stays locked in credential_issuing and
// requires explicit owner recovery rather than an unsafe blind retry.
await db.runTransaction(async (tx) => {
  const latest = await tx.get(userRef);
  if (!latest.exists || latest.data().provisioningStatus !== "pending_activation" || latest.data().active !== false) {
    throw new Error("The account is no longer pending; no credential was issued.");
  }
  const now = FieldValue.serverTimestamp();
  tx.update(userRef, { provisioningStatus: "credential_issuing", credentialIssuingAt: now, credentialIssuingBy: operatorUid, updatedAt: now });
  tx.set(db.collection("auditLogs").doc(), {
    actorUid: operatorUid, actorRole: "admin", action: "account.credential_issuance_started",
    targetType: "user", targetId: uid, metadata: { academyId: latest.data().academyId, role: latest.data().role }, createdAt: now
  });
});

await auth.updateUser(uid, { password: temporaryPassword, disabled: false });
await auth.setCustomUserClaims(uid, { ...(authUser.customClaims ?? {}), mustChangePassword: true });
await db.runTransaction(async (tx) => {
  const latest = await tx.get(userRef);
  if (!latest.exists || latest.data().provisioningStatus !== "credential_issuing" || latest.data().active !== false) {
    throw new Error("Credential was set but the account state changed; keep the account locked and request owner recovery.");
  }
  const now = FieldValue.serverTimestamp();
  tx.update(userRef, { provisioningStatus: "credential_issued", credentialIssuedAt: now, credentialIssuedBy: operatorUid, updatedAt: now });
  tx.set(db.collection("auditLogs").doc(), {
    actorUid: operatorUid, actorRole: "admin", action: "account.credential_issued",
    targetType: "user", targetId: uid, metadata: { academyId: latest.data().academyId, role: latest.data().role }, createdAt: now
  });
});

// Print once for a private, in-person handoff. Never write the secret to a file.
process.stdout.write(`\nSynthetic/academy account: ${snapshot.data().academyId}\nTemporary password (one-time display): ${temporaryPassword}\nSign in and change it immediately.\n\n`);
