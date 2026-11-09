import { FieldValue } from "firebase-admin/firestore";

const COUNTER_COLLECTION = "systemCounters";
const ACADEMY_TIME_ZONE = "Asia/Karachi";

function academyYear(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("A valid issuance date is required.");
  }

  return new Intl.DateTimeFormat("en", {
    timeZone: ACADEMY_TIME_ZONE,
    year: "numeric"
  }).format(date);
}

async function allocateNextNumber(db, counterId) {
  if (!db || typeof db.runTransaction !== "function") {
    throw new TypeError("A valid Firestore database connection is required.");
  }

  const counterRef = db.collection(COUNTER_COLLECTION).doc(counterId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(counterRef);
    const currentValue = snapshot.exists ? snapshot.data()?.value : 0;

    if (
      !Number.isSafeInteger(currentValue) ||
      currentValue < 0
    ) {
      throw new Error("ID counter is invalid; allocation has been stopped.");
    }

    const nextValue = currentValue + 1;

    if (!Number.isSafeInteger(nextValue)) {
      throw new Error("ID counter has reached its safe limit.");
    }

    transaction.set(counterRef, {
      value: nextValue,
      updatedAt: FieldValue.serverTimestamp()
    });

    return nextValue;
  });
}

/**
 * Allocate a permanent student ID. The year is the academy calendar year
 * at issuance time in Asia/Karachi. Counter increments are atomic; gaps
 * are acceptable and IDs are never recycled.
 */
export async function allocateStudentId(db, issuedAt = new Date()) {
  const year = academyYear(issuedAt);
  const sequence = await allocateNextNumber(db, `student-${year}`);

  return `SA-${year}-${String(sequence).padStart(3, "0")}`;
}

/**
 * Allocate a permanent staff ID. Only the administrator and teacher
 * staff categories are supported.
 */
export async function allocateStaffId(db, staffRole) {
  const prefixes = {
    admin: "SA-ADM",
    teacher: "SA-TCH"
  };
  const prefix = prefixes[staffRole];

  if (!prefix) {
    throw new TypeError("Staff role must be admin or teacher.");
  }

  const sequence = await allocateNextNumber(db, `staff-${staffRole}`);

  return `${prefix}-${String(sequence).padStart(3, "0")}`;
}
