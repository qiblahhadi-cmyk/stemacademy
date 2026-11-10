# Phase 4 browser walkthrough

Status: **Pending execution against Firebase emulators.** This document is a checklist, not a claim that browser testing has passed.

## Preparation

1. Install dependencies with `npm ci`.
2. Start only the local Auth and Firestore emulators using the demo project: `npm run emulators`.
3. In a separate terminal, build the emulator-only client bundle: `npm run build:client:emulator`.
4. Seed synthetic data with `npm run seed:emulator` and start the local Netlify development server using the repository's emulator-safe configuration.
5. Use only synthetic administrator, teacher and student accounts. Confirm the project ID begins with `demo-` and both emulator hosts are local before signing in.

## Administrator

- [ ] Sign in and confirm the administrator role label/navigation.
- [ ] Open staff Attendance, select an active class and date, view roster, mark records, and correct a record with a reason.
- [ ] Confirm the correction appears in history and audit log.
- [ ] Confirm administrator access to the appropriate management routes remains intact.

## Teacher

- [ ] Sign in and confirm teacher navigation.
- [ ] Open Attendance for an assigned class and verify roster/mark/correction behavior.
- [ ] Attempt an unassigned class and confirm the existing non-disclosing not-found behavior.
- [ ] Confirm a teacher cannot publish academy-wide notices or manage memberships/admin records.

## Student

- [ ] Sign in and confirm Attendance navigation opens `my-attendance.html`, not staff `attendance.html`.
- [ ] Confirm the page shows only the signed-in student's dates, statuses, counts and correction history.
- [ ] Confirm an empty account displays the accurate no-records message.
- [ ] Use Load older attendance and verify cursor pagination.
- [ ] Change the cursor to another student's record ID and confirm the API rejects it.
- [ ] Attempt to open staff Attendance directly and confirm the browser role guard blocks it.
- [ ] Attempt `POST /api/attendance/mark` and `POST /api/attendance/correct` with the student token and confirm both are denied.
- [ ] Confirm another student's record and correction reason never appear in the response or page.

## Record results

After execution, replace each checkbox with PASS/FAIL, include the tested browser/version and emulator project ID, and record any defect with a reproduction. Do not mark this checklist complete based on API tests alone.
