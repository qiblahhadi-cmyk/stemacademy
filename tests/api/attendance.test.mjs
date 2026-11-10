import test from "node:test";
import assert from "node:assert/strict";
import { handleAttendance, attendanceRecordId, validateAttendanceDate } from "../../netlify/functions/lib/routes/attendance.mjs";
import { createFakeDb } from "../helpers/fake-firestore.mjs";

const TODAY = "2026-11-09";
const SERVER_TS = "SERVER_TS";

const SEED = {
  classes: {
    "class-9": { name: "Grade 9 A", grade: 9, active: true, academicSessionId: "2026" },
    "class-10": { name: "Grade 10 A", grade: 10, active: true, academicSessionId: "2026" }
  },
  users: {
    "teacher-1": { displayName: "Ms. Ali", role: "teacher", active: true },
    "teacher-2": { displayName: "Mr. Raza", role: "teacher", active: true },
    "stu-amina": { displayName: "Amina Khan", role: "student", active: true },
    "stu-bilal": { displayName: "Bilal Ahmed", role: "student", active: true },
    "stu-inactive": { displayName: "Left Student", role: "student", active: false },
    "stu-grade10": { displayName: "Other Class", role: "student", active: true }
  },
  classAccess: {
    "ca_82c5dd0dfce93b6e2ad93814f25421c9a32e85d3ac4e2575348f4b10e953a090": { userUid: "teacher-1", classId: "class-9", accessType: "teacher", active: true },
    "ca_061a452227b62fbd33755ed12819aafc5fe01e2069750953fc7c28631d3fe410": { userUid: "teacher-2", classId: "class-10", accessType: "teacher", active: true },
    "ca_8cf8d5d5a5beae7b10cdaef7d6a682922467964bc58d3693f8e72f03640980f1": { userUid: "stu-amina", classId: "class-9", accessType: "student", active: true },
    "ca_eec8d033e423c94ad3acbdb2072349f3a551ef734aab4963e01d20990a16ebdb": { userUid: "stu-bilal", classId: "class-9", accessType: "student", active: true },
    "ca_8bc8e0e3df00ca6b21bafb12f6b6dd7221e0c7917bc028404ef1ea00a0c104c5": { userUid: "stu-inactive", classId: "class-9", accessType: "student", active: true },
    "ca_7ec0d5e6968eb7108f585d81ddfab068efb9fe54b46d775819b98b7eb137713a": { userUid: "stu-grade10", classId: "class-10", accessType: "student", active: true }
  },
  teachingAssignments: {
    "ta-t1": { teacherUid: "teacher-1", classId: "class-9", subjectId: "physics-9", active: true },
    "ta-t2": { teacherUid: "teacher-2", classId: "class-10", subjectId: "physics-10", active: true }
  }
};

const teacher1 = { uid: "teacher-1", role: "teacher" };
const admin = { uid: "admin-1", role: "admin" };
const student = { uid: "stu-amina", role: "student" };

async function call(db, user, method, path, body, query = "") {
  const url = `https://example.test/api${path}${query}`;
  const init = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  const request = new Request(url, init);
  try {
    const response = await handleAttendance(request, {
      path, user, db, serverTimestamp: () => SERVER_TS, today: () => TODAY
    });
    return { status: response.status, json: await response.json() };
  } catch (error) {
    return { status: 500, json: { error: { code: error.message } } };
  }
}

const markBody = (overrides = {}) => ({
  classId: "class-9",
  date: TODAY,
  records: [{ studentUid: "stu-amina", status: "present" }, { studentUid: "stu-bilal", status: "absent" }],
  ...overrides
});

const recordOf = (db, uid, date = TODAY) => db.store.get(`attendanceRecords/${attendanceRecordId("class-9", date, uid)}`);

test("record IDs are deterministic and do not collide across components", () => {
  assert.equal(attendanceRecordId("c", "2026-11-09", "u"), attendanceRecordId("c", "2026-11-09", "u"));
  assert.notEqual(attendanceRecordId("a_b", "2026-11-09", "c"), attendanceRecordId("a", "b_2026-11-09", "c"));
  assert.match(attendanceRecordId("c", "2026-11-09", "u"), /^[0-9a-f]{64}$/);
});

test("date validation rejects malformed, impossible and future dates", () => {
  assert.equal(validateAttendanceDate("2026-11-09", TODAY), null);
  assert.equal(validateAttendanceDate("2026-11-08", TODAY), null);
  assert.match(validateAttendanceDate("11/09/2026", TODAY), /YYYY-MM-DD/);
  assert.match(validateAttendanceDate("2026-02-30", TODAY), /valid calendar/);
  assert.match(validateAttendanceDate("2026-11-10", TODAY), /future/);
});

test("students have no attendance access", async () => {
  const db = createFakeDb(SEED);
  const { status, json } = await call(db, student, "GET", "/attendance", undefined, "?classId=class-9");
  assert.equal(status, 403);
  assert.equal(json.error.code, "FORBIDDEN");
});

test("roster lists active class students with names, and excludes inactive or other-class students", async () => {
  const db = createFakeDb(SEED);
  const { status, json } = await call(db, teacher1, "GET", "/attendance", undefined, `?classId=class-9&date=${TODAY}`);
  assert.equal(status, 200);
  assert.equal(json.data.marked, false);
  assert.deepEqual(json.data.students.map((s) => s.name), ["Amina Khan", "Bilal Ahmed"]);
  assert.ok(json.data.students.every((s) => s.status === null && s.correctionCount === 0));
});

test("teacher marks students in an assigned class; records carry the correct fields", async () => {
  const db = createFakeDb(SEED);
  const { status, json } = await call(db, teacher1, "POST", "/attendance/mark", markBody());
  assert.equal(status, 201, JSON.stringify(json));
  assert.equal(json.data.marked, 2);

  const amina = recordOf(db, "stu-amina");
  assert.equal(amina.status, "present");
  assert.equal(amina.attendanceDate, TODAY);
  assert.equal(amina.markedBy, "teacher-1");
  assert.equal(amina.correctionCount, 0);
  assert.equal(amina.createdAt, SERVER_TS);
});

test("marking writes an audit entry with identifiers and counts only", async () => {
  const db = createFakeDb(SEED);
  await call(db, teacher1, "POST", "/attendance/mark", markBody());
  const audit = [...db.store.values()].find((v) => v.action === "attendance.marked");
  assert.equal(audit.metadata.count, 2);
  assert.doesNotMatch(JSON.stringify(audit), /Amina|Bilal/);
});

test("teacher cannot mark a class without a teaching assignment (same 404 as a missing class)", async () => {
  const db = createFakeDb(SEED);
  const denied = await call(db, teacher1, "POST", "/attendance/mark", markBody({ classId: "class-10", records: [{ studentUid: "stu-grade10", status: "present" }] }));
  const missing = await call(db, teacher1, "POST", "/attendance/mark", markBody({ classId: "no-such-class" }));
  assert.equal(denied.status, 404);
  assert.deepEqual(denied.json, missing.json);
});

test("students outside the class or with inactive accounts are rejected and nothing is written", async () => {
  const db = createFakeDb(SEED);
  const outsider = await call(db, teacher1, "POST", "/attendance/mark", markBody({
    records: [{ studentUid: "stu-amina", status: "present" }, { studentUid: "stu-grade10", status: "present" }]
  }));
  assert.equal(outsider.status, 400);
  const inactive = await call(db, teacher1, "POST", "/attendance/mark", markBody({
    records: [{ studentUid: "stu-inactive", status: "present" }]
  }));
  assert.equal(inactive.status, 400);
  assert.equal([...db.store.keys()].filter((k) => k.startsWith("attendanceRecords/")).length, 0);
});

test("membership deactivation racing with marking aborts the attendance write", async () => {
  const db = createFakeDb(SEED);
  db.beforeNextCommit = () => db.updateDocument("classAccess", "ca_8cf8d5d5a5beae7b10cdaef7d6a682922467964bc58d3693f8e72f03640980f1", { active: false });
  const result = await call(db, teacher1, "POST", "/attendance/mark", markBody({
    records: [{ studentUid: "stu-amina", status: "present" }]
  }));
  assert.equal(result.status, 400);
  assert.equal(recordOf(db, "stu-amina"), undefined);
});

test("canonical membership with mismatched class/student relationship is rejected", async () => {
  const db = createFakeDb(SEED);
  db.updateDocument("classAccess", "ca_8cf8d5d5a5beae7b10cdaef7d6a682922467964bc58d3693f8e72f03640980f1", { classId: "class-10" });
  const result = await call(db, teacher1, "POST", "/attendance/mark", markBody({
    records: [{ studentUid: "stu-amina", status: "present" }]
  }));
  assert.equal(result.status, 400);
  assert.equal(recordOf(db, "stu-amina"), undefined);
});

test("marking is all-or-nothing: an already-marked student blocks the whole batch", async () => {
  const db = createFakeDb(SEED);
  await call(db, teacher1, "POST", "/attendance/mark", markBody({ records: [{ studentUid: "stu-amina", status: "present" }] }));
  const second = await call(db, teacher1, "POST", "/attendance/mark", markBody());
  assert.equal(second.status, 409);
  assert.equal(recordOf(db, "stu-bilal"), undefined, "Bilal must not be written when the batch is refused");
  assert.equal(recordOf(db, "stu-amina").status, "present");
});

test("invalid marking requests are refused with safe messages", async () => {
  const db = createFakeDb(SEED);
  const cases = [
    markBody({ records: [] }),
    markBody({ records: [{ studentUid: "stu-amina", status: "excused" }] }),
    markBody({ records: [{ studentUid: "stu-amina", status: "present" }, { studentUid: "stu-amina", status: "late" }] }),
    markBody({ records: [{ studentUid: "../x", status: "present" }] }),
    markBody({ date: "2026-12-01" }),
    markBody({ extra: true }),
    markBody({ classId: "a/b" })
  ];
  for (const body of cases) {
    const { status } = await call(db, teacher1, "POST", "/attendance/mark", body);
    assert.equal(status, 400, `expected 400 for ${JSON.stringify(body).slice(0, 80)}`);
  }
});

test("membership deactivation racing with attendance correction aborts the correction", async () => {
  const db = createFakeDb(SEED);
  await call(db, teacher1, "POST", "/attendance/mark", markBody({
    records: [{ studentUid: "stu-bilal", status: "absent" }]
  }));
  db.beforeNextCommit = () => db.updateDocument("classAccess", "ca_eec8d033e423c94ad3acbdb2072349f3a551ef734aab4963e01d20990a16ebdb", { active: false });
  const result = await call(db, teacher1, "POST", "/attendance/correct", {
    classId: "class-9", date: TODAY, studentUid: "stu-bilal", status: "late", reason: "Correction test"
  });
  assert.equal(result.status, 400);
  assert.equal(recordOf(db, "stu-bilal").status, "absent");
  assert.equal([...db.store.keys()].filter((key) => key.startsWith("attendanceCorrections/")).length, 0);
});

test("correction requires a reason, changes status, keeps the prior value and appends history", async () => {
  const db = createFakeDb(SEED);
  await call(db, teacher1, "POST", "/attendance/mark", markBody());

  const noReason = await call(db, teacher1, "POST", "/attendance/correct", {
    classId: "class-9", date: TODAY, studentUid: "stu-bilal", status: "late", reason: " "
  });
  assert.equal(noReason.status, 400);

  const { status, json } = await call(db, teacher1, "POST", "/attendance/correct", {
    classId: "class-9", date: TODAY, studentUid: "stu-bilal", status: "late", reason: "Arrived after roll call"
  });
  assert.equal(status, 200, JSON.stringify(json));
  assert.equal(json.data.status, "late");

  const record = recordOf(db, "stu-bilal");
  assert.equal(record.status, "late");
  assert.equal(record.correctionCount, 1);
  assert.equal(record.updatedBy, "teacher-1");

  const history = [...db.store.entries()].filter(([k]) => k.startsWith("attendanceCorrections/")).map(([, v]) => v);
  assert.equal(history.length, 1);
  assert.equal(history[0].previousStatus, "absent");
  assert.equal(history[0].newStatus, "late");
  assert.equal(history[0].reason, "Arrived after roll call");
  assert.equal(history[0].correctedBy, "teacher-1");
});

test("corrections are refused for unmarked students and for unchanged statuses", async () => {
  const db = createFakeDb(SEED);
  const unmarked = await call(db, teacher1, "POST", "/attendance/correct", {
    classId: "class-9", date: TODAY, studentUid: "stu-amina", status: "absent", reason: "Mistake"
  });
  assert.equal(unmarked.status, 409);

  await call(db, teacher1, "POST", "/attendance/mark", markBody());
  const same = await call(db, teacher1, "POST", "/attendance/correct", {
    classId: "class-9", date: TODAY, studentUid: "stu-amina", status: "present", reason: "No change"
  });
  assert.equal(same.status, 409);
  assert.equal(recordOf(db, "stu-amina").correctionCount, 0);
});

test("concurrent corrections to one record are serialized: both apply and history chains correctly", async () => {
  const db = createFakeDb(SEED);
  await call(db, teacher1, "POST", "/attendance/mark", markBody({ records: [{ studentUid: "stu-amina", status: "present" }] }));

  const [first, second] = await Promise.all([
    call(db, teacher1, "POST", "/attendance/correct", { classId: "class-9", date: TODAY, studentUid: "stu-amina", status: "absent", reason: "First fix" }),
    call(db, teacher1, "POST", "/attendance/correct", { classId: "class-9", date: TODAY, studentUid: "stu-amina", status: "late", reason: "Second fix" })
  ]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  const record = recordOf(db, "stu-amina");
  assert.equal(record.correctionCount, 2, "both corrections must be applied");

  const history = [...db.store.entries()]
    .filter(([k]) => k.startsWith("attendanceCorrections/"))
    .map(([, v]) => v);
  assert.equal(history.length, 2);

  // Serial orders: (present->absent, absent->late) or (present->late, late->absent).
  // In both, the first correction starts from "present" and the second starts where
  // the first ended, and the record ends at the second correction's new status.
  const chainA = history.find((h) => h.previousStatus === "present");
  assert.ok(chainA, "one correction must start from the original status");
  const chainB = history.find((h) => h.previousStatus === chainA.newStatus);
  assert.ok(chainB, "the other correction must start from the first correction's result");
  assert.equal(chainB.newStatus, record.status, "the final status must match the last correction");
  assert.notEqual(chainA.newStatus, chainB.newStatus);
});

test("correction history lists corrections with names, not identifiers", async () => {
  const db = createFakeDb(SEED);
  await call(db, teacher1, "POST", "/attendance/mark", markBody());
  await call(db, teacher1, "POST", "/attendance/correct", { classId: "class-9", date: TODAY, studentUid: "stu-bilal", status: "present", reason: "Was present" });
  const { status, json } = await call(db, teacher1, "GET", "/attendance/corrections", undefined,
    `?classId=class-9&date=${TODAY}&studentUid=stu-bilal`);
  assert.equal(status, 200);
  assert.equal(json.data.corrections.length, 1);
  assert.equal(json.data.corrections[0].correctedByName, "Ms. Ali");
  assert.doesNotMatch(JSON.stringify(json), /teacher-1/);
});

test("administrators may mark and correct in any active class", async () => {
  const db = createFakeDb(SEED);
  const mark = await call(db, admin, "POST", "/attendance/mark", markBody({
    classId: "class-10", records: [{ studentUid: "stu-grade10", status: "present" }]
  }));
  assert.equal(mark.status, 201);
});

test("routing: unknown attendance paths and wrong methods are refused", async () => {
  const db = createFakeDb(SEED);
  assert.equal((await call(db, teacher1, "DELETE", "/attendance", undefined, "?classId=class-9")).status, 405);
  assert.equal((await call(db, teacher1, "GET", "/attendance/mark")).status, 405);
  assert.equal((await call(db, teacher1, "POST", "/attendance/nothing", {})).status, 404);
});

test("student attendance view returns only the authenticated student's dates, statuses and correction history", async () => {
  const own = attendanceRecordId("class-9", "2026-11-08", "stu-amina");
  const other = attendanceRecordId("class-9", "2026-11-08", "stu-bilal");
  const db = createFakeDb({
    ...SEED,
    attendanceRecords: {
      [own]: { classId: "class-9", attendanceDate: "2026-11-08", studentUid: "stu-amina", status: "late", correctionCount: 1 },
      [other]: { classId: "class-9", attendanceDate: "2026-11-08", studentUid: "stu-bilal", status: "present", correctionCount: 0 }
    },
    attendanceCorrections: {
      c1: { classId: "class-9", attendanceDate: "2026-11-08", studentUid: "stu-amina", previousStatus: "absent", newStatus: "late", reason: "Register correction", correctedAt: "2026-11-08T08:00:00.000Z" },
      c2: { classId: "class-9", attendanceDate: "2026-11-08", studentUid: "stu-bilal", previousStatus: "absent", newStatus: "present", reason: "Other student", correctedAt: "2026-11-08T09:00:00.000Z" }
    }
  });
  const { status, json } = await call(db, student, "GET", "/attendance/mine", undefined, "?studentUid=stu-bilal");
  assert.equal(status, 200);
  assert.equal(json.data.records.length, 1);
  assert.equal(json.data.records[0].date, "2026-11-08");
  assert.equal(json.data.records[0].status, "late");
  assert.equal(json.data.records[0].history.length, 1);
  assert.equal(json.data.records[0].history[0].reason, "Register correction");
  assert.doesNotMatch(JSON.stringify(json), /Bilal|Other student|stu-bilal/);
});

test("student attendance history has an accurate empty state and cannot use staff write routes", async () => {
  const db = createFakeDb(SEED);
  const mine = await call(db, student, "GET", "/attendance/mine");
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.json.data.records, []);
  assert.equal(mine.json.data.hasMore, false);
  const mark = await call(db, student, "POST", "/attendance/mark", markBody({ records: [{ studentUid: "stu-amina", status: "present" }] }));
  const correct = await call(db, student, "POST", "/attendance/correct", { classId: "class-9", date: TODAY, studentUid: "stu-amina", status: "late", reason: "No permission" });
  assert.equal(mark.status, 403);
  assert.equal(correct.status, 403);
  assert.equal([...db.store.keys()].filter((key) => key.startsWith("attendanceRecords/")).length, 0);
});

test("student attendance history paginates older records without accepting another student's cursor", async () => {
  const records = {};
  for (let day = 1; day <= 201; day += 1) {
    const uniqueDate = new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10);
    records[attendanceRecordId("class-9", uniqueDate, "stu-amina")] = {
      classId: "class-9", attendanceDate: uniqueDate, studentUid: "stu-amina", status: "present", correctionCount: 0
    };
  }
  records[attendanceRecordId("class-9", "2026-04-01", "stu-bilal")] = {
    classId: "class-9", attendanceDate: "2026-04-01", studentUid: "stu-bilal", status: "absent", correctionCount: 0
  };
  const db = createFakeDb({ ...SEED, attendanceRecords: records });
  const first = await call(db, student, "GET", "/attendance/mine");
  assert.equal(first.status, 200);
  assert.equal(first.json.data.records.length, 200);
  assert.equal(first.json.data.hasMore, true);
  assert.ok(first.json.data.nextCursor);
  const second = await call(db, student, "GET", "/attendance/mine", undefined, `?cursor=${first.json.data.nextCursor}`);
  assert.equal(second.status, 200);
  assert.equal(second.json.data.records.length, 1);
  assert.equal(second.json.data.hasMore, false);
  const otherCursor = attendanceRecordId("class-9", "2026-04-01", "stu-bilal");
  const rejected = await call(db, student, "GET", "/attendance/mine", undefined, `?cursor=${otherCursor}`);
  assert.equal(rejected.status, 400);
});
