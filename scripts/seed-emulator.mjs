import { createHash } from "node:crypto";
/*
 * Seeds the local Firebase emulators with a small, realistic classroom so the
 * browser walkthrough can run. Passwords are generated per run and printed once.
 * Nothing is written to disk. Refuses to run unless both emulators are configured
 * and the project is a demo- project (see scripts/emulator-guard.mjs).
 */
import { randomBytes } from "node:crypto";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { assertEmulatorEnv } from "./emulator-guard.mjs";

const projectId = assertEmulatorEnv(process.env);
if (getApps().length === 0) initializeApp({ projectId });
const auth = getAuth();
const db = getFirestore();

// Same alias rule as the browser (public/assets/js/login-alias.mjs).
const aliasFor = (academyId) => `${academyId.toLowerCase()}@stemacademy.edu.pk`;

const ACCOUNTS = [
  { academyId: "SA-ADM-001", role: "admin", displayName: "Academy Administrator" },
  { academyId: "SA-TCH-001", role: "teacher", displayName: "Ms. Ali" },
  { academyId: "SA-2026-001", role: "student", displayName: "Amina Khan" },
  { academyId: "SA-2026-002", role: "student", displayName: "Bilal Ahmed" }
];

async function ensureAccount({ academyId, role, displayName }) {
  const email = aliasFor(academyId);
  const password = randomBytes(12).toString("base64url");
  let user;
  try {
    user = await auth.getUserByEmail(email);
    user = await auth.updateUser(user.uid, { password, displayName });
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    user = await auth.createUser({ email, password, displayName, emailVerified: true });
  }
  await db.collection("users").doc(user.uid).set({ role, active: true, displayName, academyId });
  return { uid: user.uid, academyId, password };
}

const accounts = {};
for (const account of ACCOUNTS) {
  const made = await ensureAccount(account);
  accounts[account.academyId] = made;
}

const teacher = accounts["SA-TCH-001"].uid;
const students = [accounts["SA-2026-001"].uid, accounts["SA-2026-002"].uid];

await db.collection("classes").doc("class-9").set({
  name: "Grade 9 A", grade: 9, active: true, academicSessionId: "2026"
});
await db.collection("subjects").doc("physics-9").set({
  name: "Physics", board: "AJK", grade: 9, active: true
});
await db.collection("subjects").doc("chem-9").set({
  name: "Chemistry", board: "AJK", grade: 9, active: true
});
await db.collection("teachingAssignments").doc("ta-tch-physics-9").set({
  teacherUid: teacher, classId: "class-9", subjectId: "physics-9", active: true
});
await db.collection("classAccess").doc(`ca_${createHash("sha256").update(JSON.stringify(["class-9", "teacher", teacher])).digest("hex")}`).set({
  userUid: teacher, classId: "class-9", accessType: "teacher", active: true
});
for (const [index, uid] of students.entries()) {
  await db.collection("classAccess").doc(`ca_${createHash("sha256").update(JSON.stringify(["class-9", "student", uid])).digest("hex")}`).set({
    userUid: uid, classId: "class-9", accessType: "student", active: true
  });
}

console.log("\nEmulator seeded. Sign in at http://localhost:8888/login.html with these academy IDs.");
console.log("Passwords are generated for this run only and are not saved anywhere.\n");
for (const account of ACCOUNTS) {
  const made = accounts[account.academyId];
  console.log(`  ${account.role.padEnd(8)} ${account.academyId.padEnd(13)} password: ${made.password}`);
}
console.log("");
