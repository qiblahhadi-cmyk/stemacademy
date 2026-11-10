import { createHash } from "node:crypto";
/*
 * One-time, emulator-only migration from arbitrary classAccess document IDs to
 * `ca_` plus SHA-256 of JSON tuple `[classId, accessType, userUid]`. Legacy documents are retained but safely
 * deactivated and linked to the canonical record; membership history is append-only.
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { assertEmulatorEnv } from "./emulator-guard.mjs";

const projectId = assertEmulatorEnv(process.env);
if (getApps().length === 0) initializeApp({ projectId });
const db = getFirestore();
const snapshot = await db.collection("classAccess").get();
let migrated = 0;
let alreadyCanonical = 0;

for (const legacyDoc of snapshot.docs) {
  const data = legacyDoc.data();
  if (!data.classId || !data.userUid || !["student", "teacher"].includes(data.accessType)) {
    throw new Error(`Refusing malformed classAccess record: ${legacyDoc.id}`);
  }
  const canonicalId = `ca_${createHash("sha256").update(JSON.stringify([data.classId, data.accessType, data.userUid])).digest("hex")}`;
  if (legacyDoc.id === canonicalId) {
    alreadyCanonical += 1;
    continue;
  }

  const canonicalRef = db.collection("classAccess").doc(canonicalId);
  const historyRef = db.collection("membershipHistory").doc();
  await db.runTransaction(async (tx) => {
    const [canonicalSnap, legacySnap] = await Promise.all([
      tx.get(canonicalRef), tx.get(legacyDoc.ref)
    ]);
    if (!legacySnap.exists) return;
    const legacy = legacySnap.data();
    if (canonicalSnap.exists) {
      const current = canonicalSnap.data();
      if (current.classId !== legacy.classId || current.userUid !== legacy.userUid || current.accessType !== legacy.accessType) {
        throw new Error(`Canonical membership collision for ${canonicalId}`);
      }
      // Never reactivate a previously deactivated canonical membership by migration.
      tx.update(legacyDoc.ref, { active: false, migratedTo: canonicalId, migratedAt: new Date().toISOString() });
    } else {
      tx.set(canonicalRef, { ...legacy, createdAt: legacy.createdAt ?? new Date().toISOString(), migratedFrom: legacyDoc.id });
      tx.update(legacyDoc.ref, { active: false, migratedTo: canonicalId, migratedAt: new Date().toISOString() });
    }
    tx.set(historyRef, {
      classId: legacy.classId,
      userUid: legacy.userUid,
      accessType: legacy.accessType,
      action: "membership.document_id_migrated",
      previousDocumentId: legacyDoc.id,
      canonicalDocumentId: canonicalId,
      activeBeforeMigration: legacy.active === true,
      createdAt: new Date().toISOString()
    });
  });
  migrated += 1;
}

console.log(JSON.stringify({ projectId, migrated, alreadyCanonical }, null, 2));
