# STEM Academy — Phase 5 Progress (Stages 1–5 partly complete)

**Status:** Stages 1–4 complete. Stage 5 partly complete (see below). Stages 6–7 pending.
**Safety:** Nothing deployed. No production Firebase project touched. Synthetic data only.

## Completed

### Stage 1 — Baseline
- Phase 4 R2 extracted and checked against its report. Baseline: 67 tests, 61 passed, 6 skipped.

### Backend
- **Race fix:** update, publish and close run in Firestore transactions. The concurrent-publish test fails on the pre-fix module and passes on the fix.
- **Subjects endpoint:** `GET /api/subjects?classId=` returns the subjects a caller may use in one class.
  - Admin: all active subjects for the class grade.
  - Teacher: only subjects with an active teaching assignment in that class (and active class access).
  - Student: active subjects for the class grade (with active class membership).
  - Out-of-scope and missing classes return the same 404.

### Stage 4 — Sign-in
- Academy-ID login mapped to `<id>@stemacademy.edu.pk` (login alias).
- Session core: one token refresh on 401, then session end. A 403 never ends the session.
- **Session-only persistence:** the Firebase session ends when the browser closes (shared classroom computers).
- Build: `npm run build:client` bundles `src/client` to `public/assets/js/bundles/` (generated, git-ignored).

### Stage 5 — Guards, roles and assignments
- **Guard on all 12 sidebar pages** via `bundles/session.js`. Login and forbidden pages are not guarded.
- **Role-based navigation:** `src/client/nav-policy.js` hides links and blocks pages by role. The role is fetched from `/api/me` only.
  - Proposed policy (confirm with owner): students get Dashboard, Assignments, Course Hub, Communication, Profile. Teachers add Classes, Subjects, Attendance, Assessments. Administrators alone get Activity Logs, Settings and Role Preview.
- **Forbidden page** at `/forbidden.html` for blocked visitors.
- **Sign-out** button on every sidebar page.
- **Assignments page connected to the API:** class and subject selectors, list, detail, create, edit, publish and close for staff. Students see Current (published) and Past / Completed (closed), read-only. Server data is written with `textContent` only.
- Removed: `public/assets/js/app.js` (loaded by no page) and the stub `login.js`.

## Test status (exact, as last run)

- Total: 100. Passed: 94. Failed: 0. Skipped: 6.
- Skipped, emulator-dependent, NOT executed: tests 38, 47, 50, 51, 52, 58.
- NOT executed: `npm run build:client`, any browser test, any Firebase Auth or Firestore emulator test, and the assignments page in a browser.

## Pending

### Before the next checkpoint (owner / Codespaces)
1. `npm install`, then commit the updated `package-lock.json`. The lockfile is out of sync with `package.json` (`esbuild` 0.24.2, `firebase` 10.14.1), so `npm ci` fails until this is done. Confirm both versions exist.
2. `npm run build:client` with the four `PUBLIC_FIREBASE_*` variables set.
3. `npm install -g firebase-tools` and `npm run test:emulator`.
4. Open the pages in a browser against the emulator: sign in, sign out, role-blocked page, assignments flow.

### Stage 5 — still to do
- Classes, subjects, attendance, assessments, course hub, communication, activity logs, profile, settings and role preview still show preview data. Each needs its own API connection or an explicit "preview" label.
- The dashboard (`index.html`) is still a static preview. Its role-specific content is not built.
- Attendance, assessments, communication and course hub have no backend routes yet.

### Stage 6 — not started
- Emulator tests for sign-in, session expiry and the subjects endpoint.
- Browser or end-to-end tests of login, redirects, sign-out and role-blocked pages.
- Re-run the authorization matrix against the emulator.

### Stage 7 — not started
- README setup, emulator guide, environment variables.
- Final `docs/PHASE_5_REPORT.md`.

## Open decisions
1. Confirm the proposed role-to-page policy in `src/client/nav-policy.js`.
2. Confirm which preview pages should be connected to real data before the pilot, and which should be removed or labeled "not in this version".

## Known risks
- Nothing in the browser has run yet, so the login, guard and assignments page are unverified.
- Firebase may reject the `stemacademy.edu.pk` alias for email/password accounts. This needs the separate test-project check from the approved design.
- The student "Current" and "Past / Completed" views depend on the server's publication states. Their behavior is covered by API tests, not by a browser test.

## Update: second Stage 5 pass

- **Policy confirmed** by the academy owner. `src/client/nav-policy.js` matches the approved mapping.
- **Profile** shows the signed-in account from `/api/me`. Editing and password changes are not available in this version; the profile form is disabled.
- **Classes** shows live classes from `/api/classes`, within each account's access. Adding classes is not available.
- **Dashboard** shows a live greeting, role and class count. Other figures on this page are sample data.
- **Sample-data notice** added to: Subjects, Attendance, Assessments, Course Hub, Communication, Role Preview, Activity Logs, Settings and the Dashboard figures. These pages still have no backend routes.
- **Still not connected:** attendance, assessments, course hub, communication, activity logs, settings, and the subject chapters and objectives on the Subjects page. Each needs backend routes and a data design before it can be connected.
- **Script order:** the session bundle now loads in `<head>` ahead of page scripts on profile and classes. Other pages keep it at the end of the body.
- **Tests:** 100 total, 94 passed, 0 failed, 6 skipped (emulator, not executed). Page-level behaviour is not browser-tested.

## Update: Attendance (third Stage 5 pass)

**Owner decisions applied:** Activity Logs and Settings are removed from every sidebar. Their pages are admin-only, reachable only by direct URL, and show a "Coming soon" label.

### Attendance — backend (`netlify/functions/lib/routes/attendance.mjs`)
- `GET /api/attendance?classId&date`: roster for one class day (active students with names, status, correction count). Date defaults to today in Asia/Karachi.
- `POST /api/attendance/mark`: records a first marking for up to 100 students, all in one transaction. If any student is already recorded, the whole batch is refused and nothing is written.
- `POST /api/attendance/correct`: changes an existing status. Requires a reason of 3–300 characters. Appends history (previous status, new status, reason, who, when) in the same transaction, and increments the correction count.
- `GET /api/attendance/corrections?classId&date&studentUid`: correction history, newest first, with staff names.
- Record IDs are SHA-256 of class, date and student, following the data model.
- Dates must be real calendar dates and cannot be in the future.
- Teachers: only classes where they hold an active teaching assignment. Administrators: any active class. Students: no access.
- Students must be active members of the class, checked for every request.
- Every mark and correction writes an audit entry. Audit metadata holds identifiers and counts only, not names or reasons.
- Out-of-scope and missing classes return the same 404.

### Attendance — frontend (`public/attendance.html`, `public/assets/js/attendance.js`)
- Class and date selection; roster with a status choice per unrecorded student; "Mark unrecorded as present" shortcut; save.
- Recorded students show their status with a Correct button. The correction dialog requires a reason and shows history.
- The page replaces the earlier demo UI.

### Tests
- `tests/api/attendance.test.mjs`: 16 tests (date rules, scope, membership, all-or-nothing marking, correction chain, concurrent corrections, names-not-IDs in history, admin access, routing).
- `tests/api/attendance-routing.test.mjs` and `subjects` routing: 4 tests.
- Full suite: 119 total, 113 passed, 0 failed, 6 skipped (emulator, not executed).

### Attendance — not yet done
- Not browser-tested. Not run against the Firestore emulator.
- The correction index (`attendanceCorrections`: classId, attendanceDate, studentUid, correctedAt desc) and the equality-only roster queries need emulator confirmation.
- Membership is checked just before the write, outside the transaction. A student removed from a class at that exact moment could still be marked. This is a narrow window and is recorded as a known gap.
- Attendance warnings and support indicators (data model section 14) are not built. They need the thresholds and the minimum-data rule (5 days before a warning).
- Non-attendance days (holidays) are not modelled.
- The Role Preview page still shows sample data. It is admin-only and unlinked.

### Next
- Assessments: the same pattern (teacher-scoped creation and publishing, answer keys kept server-side, marks hidden until released).

## Update: Assessments (fourth Stage 5 pass)

### Backend (`netlify/functions/lib/routes/assessments.mjs`, shared `scope.mjs`)
- **Staff** (teachers in an assigned class and subject; administrators anywhere): create, edit, publish and close MCQ assessments. The list, detail and results are scoped to the stored record. Out-of-scope and missing IDs return the same 404.
- **Questions and dates are locked once published.** Only the title and instructions can change after publication. Closed assessments cannot be edited.
- **Answer keys** live in `assessmentAnswerKeys/{id}`. No student-facing response contains a question's correct option, and the audit log never records answers or scores.
- **Students** may start an assessment only in its opening window and before the earlier of the closing time or the time limit. Starting again resumes the open attempt. Submitting after the deadline expires the attempt and refuses the submission.
- **One attempt by default.** A teacher can approve a retake only after the attempt is used. Each approval grants exactly one more attempt, including when two approvals are sent at the same time.
- **Marks are hidden until released.** Results move through: submitted → approved → released. Approval and release are separate, audited steps. Both work on several students at once and are all-or-nothing.
- **Results overview** shows each student's state: not started, in progress, not submitted, awaiting approval, approved, or released. It uses names; opaque IDs are included only so staff can act on individual students.

### Frontend
- `public/assessments.html` and `public/assets/js/assessments.js`: staff page for class and subject selection, a list, a question editor, publish and close, and a results dialog with approve, release and retake controls.
- `public/take-assessment.html` and `public/assets/js/take-assessment.js`: student page, opened by ID, with start, a countdown, submit, and read-only marks after release. Staff who open it see a message directing them to the Assessments page.
- Policy: `take-assessment.html` is reachable by students and administrators. It is **not linked from the navigation**.

### Tests
- `tests/api/assessments.test.mjs`: 27 tests covering creation and validation, scope, locking, listing, answer-key secrecy, the start window, concurrent starts, scoring, expiry, approval order and atomicity, retakes (including concurrent approvals), results states, out-of-scope 404s, audit contents and routing.
- `tests/api/assessments-routing.test.mjs`: 2 tests.
- Full suite: 148 total, 142 passed, 0 failed, 6 skipped (emulator, not executed).

### Decisions needed
1. **How students reach assessments.** The approved navigation does not include Assessments for students. Options: (a) add an "Assessments" link to the student navigation, pointing at a student list page that I would build next; (b) keep the current arrangement, where students open an assessment from a link you provide. Option (a) is recommended.
2. **Teachers and the student page.** The owner's wording says teachers have "all student pages", but teachers cannot take an assessment. The current policy excludes them from `take-assessment.html`. Confirm.

### Known gaps
- Not browser-tested. Not run against the Firestore emulator.
- Expired attempts are recognized on the student's next request. There are no background jobs, as the data model requires; a student who never returns leaves the attempt marked in progress until then.
- Questions are not shuffled, and there is no per-question timer.
- Membership is checked just before a write, outside the transaction. This is the same narrow window noted for attendance.
- Assessment analytics, support indicators and student result history are not built.

### Next
- Decision 1 above, then a student assessment list. After that, Course Hub or Communication, or emulator verification of everything built so far.

## Update: Student assessments and teacher review (fifth Stage 5 pass)

### Decisions applied
- **Students** see an "Assessments & Results" link. On every page it leads to `my-assessments.html`, their own list, not the staff page. The rewrite is in `navTargetFor()` in `src/client/nav-policy.js`.
- **Teachers** manage, create, and review assessments on `assessments.html`. They are excluded from `take-assessment.html`, where students start and submit.
- **Administrators** have access to the student list and the student take page, consistent with the approved "everything" rule.

### Student workflow
- `GET /api/assessments/mine` lists published and closed assessments in each class the student belongs to. Each item carries the student's own status (not started, in progress, submitted, not submitted, released) and a window (upcoming, open, closed). Scores appear only after release.
- `my-assessments.html` has Current and Past / Completed views. Each row links to `take-assessment.html?id=…`.
- `take-assessment.html` uses the server's window to show when the assessment opens or that it has closed. The Start button appears only while it is open and an attempt is available.

### Teacher workflow
- **Review answers:** `GET /api/assessments/:id/attempts?studentUid=…` shows the latest submitted attempt, each answer, whether it was correct, and the key. Only submitted attempts can be reviewed.
- **Reopen after a technical problem:** `POST /api/assessments/:id/reopen` with a reason of 3–300 characters. It applies only to an attempt that has expired, or whose deadline has passed while still marked in progress. The attempt keeps a `reopenings` history with who, when, and why. The deadline is recalculated within the closing time. Marks are never changed. Reopening is refused after the assessment closes.
- Attempts now record their latest start, so an attempt that expired without a submission can be reopened.

### Tests
- `tests/api/assessments.test.mjs`: 38 tests. The new ones cover the student list, its window and status logic, the score only after release, answer review, reopening (expired and past-deadline cases), refused reopen cases, scope, and routing.
- `tests/frontend/nav-policy.test.mjs`: navigation redirects and the student list policy.
- Full suite: 161 total, 155 passed, 0 failed, 6 skipped (emulator, not executed).

### Indexes added
- `assessments`: classId and publicationState, for the student list. Together with the earlier assessment indexes, these must be confirmed against the emulator.
- `attendanceCorrections`: from the attendance pass.

### Still open
- Not browser-tested. Not run against the Firestore emulator.
- The student list does not yet paginate beyond 50 classes or 100 assessments per class.
- Membership is checked just before a write, outside the transaction (noted for attendance).
- Question shuffling and per-question timers are not built.
- Assessment analytics and support flags are not built.

## Update: Emulator-ready tooling (verification pass)

- `npm run test:emulator` sets the emulator hosts and the demo project explicitly, then runs the full suite inside `firebase emulators:exec`.
- `npm run emulators` starts the Auth and Firestore emulators.
- `npm run seed:emulator` creates an admin, a teacher, and two students with a class, subjects, and teaching assignments. Passwords are generated per run and printed once. They are not written to disk.
- `npm run dev` builds the emulator browser bundle and starts Netlify Dev. Emulator bundles use only demo configuration and never read `PUBLIC_FIREBASE_*` values.
- `npm run build:client` and the other scripts load `.env` through `--env-file-if-exists`.
- The emulator guard (`scripts/emulator-guard.mjs`) refuses non-emulator setups, non-`demo-` projects, and Netlify builds. It is shared by the seed and the emulator build.
- `docs/LOCAL_EMULATOR_SETUP.md` gives the exact steps and the browser walkthrough checklist.

**Before first use:** install the tools the scripts depend on, then commit the lockfile:
`npm install --save-dev firebase-tools netlify-cli`

**Tests:** 165 total, 159 passed, 0 failed, 6 skipped. The skipped six run under `npm run test:emulator`.
