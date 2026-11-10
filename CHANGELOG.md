# Changelog

## Phase 7 — final verification (source review, 10 November 2026)

### Fixed (each has a regression test in `tests/api/phase7-regressions.test.mjs` or `tests/scripts/`)
- **Assessments:** starting an attempt after an unsubmitted attempt had timed out left `openAttemptId` set on the result record, so the student stayed "in progress" and a teacher could not approve a retake. The stale marker is now cleared in the same transaction.
- **Assessments:** reopening an attempt whose attempt document was missing raised an unhandled error (HTTP 500); it now returns a controlled 409.
- **Admin accounts:** `PATCH /admin/{students|staff}/:id {active:true}` is now refused for `pending_activation` **and** `credential_issued` accounts. Previously a `credential_issued` account could be enabled (and re-enabled in Firebase Auth) before the first-password change, leaving it locked out.
- **Assignment submissions:** `GET /assignment-submissions` now returns the same 404 for a student asking about a draft assignment as for a missing one (previously 200 with an empty list, disclosing that a draft exists).
- **Windows:** `npm run build:client:emulator` no longer uses a POSIX inline variable (`FIREBASE_USE_EMULATOR=true node …`) and now runs through the loopback-enforcing wrapper with `--emulator`.
- **Windows:** `scripts/run-emulator-command.mjs` quotes arguments for `cmd.exe` (`scripts/shell-quote.mjs`) so `emulators:exec … "npm test"` is not split.
- **Config:** `firebase.json` binds the Auth, Firestore and UI emulators to `127.0.0.1` explicitly so exported emulator hosts match the strict endpoint guard; `netlify.toml` pins `NODE_VERSION = "22"` to match `engines`.
- **Docs:** README and `docs/LOCAL_EMULATOR_SETUP.md` no longer tell developers to `npm install --save-dev firebase-tools netlify-cli`, which contradicted the pinned-`npx` approach.

### Added
- `scripts/verify-lockfile.mjs` / `npm run verify:lockfile`: offline lockfile completeness check (currently exits 1: `esbuild` and `firebase` entries are missing; it never edits the lockfile).
- Tests: `tests/api/phase7-regressions.test.mjs` (5), `tests/scripts/project-config.test.mjs` (8), `tests/scripts/shell-quote.test.mjs` (3).
- `LOCAL_MACHINE_VERIFICATION_GUIDE.md` and `PHASE7_FINAL_VERIFICATION_REPORT.md`.

### Not changed
- No approved functionality, Firestore rules, role model or architecture was altered. `package-lock.json` was not edited (regeneration requires registry access).

### Verification status
- `npm run check`: exit 0; 362 tests, 346 passed, 0 failed, 16 skipped. Emulator, clean install, build, browser and audit checks are pending. Verdict: **NOT READY FOR PILOT**.

## Phase 6 — Phase 4 (10 November 2026)

### Added
- Student-only `GET /api/attendance/mine`, scoped exclusively to the verified session UID. Returns date, current status, correction count and append-only correction history; supports cursor pagination.
- `public/my-attendance.html` and `public/assets/js/my-attendance.js`: read-only student attendance page with present/absent/late counts, accurate empty state and older-record pagination.
- Student navigation redirects Attendance to My Attendance; staff Attendance remains unchanged and inaccessible to students.
- Firestore composite indexes for student attendance and student correction-history reads.
- Transaction-bound `txAuthorizeScope` authorization and deterministic fake-Firestore race tests plus real-emulator race tests (`tests/api/authorization-transactions.test.mjs`, `tests/api/protected-write-races.test.mjs`, `tests/firebase/authorization-races-emulator.test.mjs`).

### Hardened
- Assignment create/update/publish/close, assessment create/update/publish/close/start/submit, attendance mark/correct and class-notice create/update/deactivate now bind the relevant class, subject, membership and/or teaching-assignment authorization reads to their protected Firestore transactions.
- Assessment start/submit re-read the assessment inside the write transaction so lifecycle changes and scope checks are transaction-bound.
- Existing canonical `classAccessDocumentId` keys, soft-deactivation behavior, membership history and audit records are preserved. No schema migration or production data operation was performed.

### Verification status
- `npm run check`: passed; 306 tests, 295 passed, 0 failed, 11 skipped.
- Focused authorization/attendance/assignment/assessment/notice suites passed during implementation.
- Firebase Emulator execution and authenticated browser walkthroughs remain pending because the Firebase CLI and project dependencies could not be installed in this environment. The emulator race tests are present but skipped without configured emulators. See `docs/PHASE4_TEST_RESULTS.md` and `docs/PHASE4_BROWSER_WALKTHROUGH.md`.

## Phase 6 — Phase 3 (10 November 2026)

### Added
- `GET /api/admin/audit-logs`: administrator-only, read-only, paginated audit log with action, role, category, date and text filters (`netlify/functions/lib/routes/audit-logs.mjs`). Privacy allowlists; no display names, UIDs in metadata, scores or answers.
- `firestore.indexes.json`: `auditLogs` indexes (`action`+`createdAt`, `actorRole`+`createdAt`).
- `docs/ACCOUNT_RECOVERY_PROCEDURE.md`: owner-controlled recovery procedure and review of provisioning/credential issuance (P1-5).
- Tests: `tests/api/audit-logs.test.mjs` (17), `tests/api/account-recovery-policy.test.mjs` (7), `tests/frontend/activity-logs-ui.test.mjs` (4).

### Changed
- Activity Logs page now reads real audit records (replaces six fictional in-memory entries); safe text rendering, filters, "Load more", empty and error states.
- `tests/helpers/fake-firestore.mjs`: additive support for `orderBy`, `startAfter`, `>=`, `<=`.
- `npm run check` also syntax-checks the new route and page script.

### Not changed (by design)
- No password-reset or account-recovery endpoint was added; recovery remains an owner-controlled in-person procedure.
- Firestore browser rules remain deny-all.

## Phase 6 — Phase 1 (9 November 2026)

### Fixed
- Sidebar navigation: 42 fragment links (`#dashboard`, `/#classes`, …) now point to real pages on index, classes, subjects, communication, profile, activity-logs and course-hub. Role policy unchanged; Course Hub still unlinked and denied to all roles.
- Notices: priority dropdowns submit `normal`/`important`; priority filter matches stored values; edit selects the saved priority.
- Notices: editing an existing notice no longer sends `scope`/`classId` (the API rejected every edit).
- Notices: removed the discarded required "Notice date" input.
- Notices: notice list ordering uses real timestamps.
- Notices: removed "TEMPORARY DEMO NOTICE" wording; statistics show "—" until loaded instead of fixed numbers.

### Added
- `public/assets/js/notice-form.js`: pure payload and priority helpers.
- Tests: `tests/frontend/notices-ui.test.mjs`; navigation tests in `tests/frontend/static-assets.test.mjs`; notice API contract tests in `tests/api/notices.test.mjs`.

### Changed
- `communication.js` is an ES module.
- `notices.mjs` exports `NOTICE_PRIORITIES` and `timeKey`.

## Phase 6 — Phase 2 (9 November 2026)

### Added
- `GET /api/classes/{id}/roster`: scoped staff roster (admin any class; teacher assigned classes only).
- `GET /api/dashboard`: role-specific counts.
- `PATCH /api/me`: display-name self-service only.
- Tests: `tests/api/people-scope.test.mjs`, `tests/frontend/people-pages.test.mjs`.

### Changed
- Classes & People: real class, student and teacher data; Students and Teachers tabs work; read-only.
- Dashboard: live counts; sample figures and development-progress panel removed.
- Profile: display name editable; password change documented as not available.

### Fixed
- Teacher dashboard student count excluded deactivated student accounts.


## Phase 6 — Phase 5 (10 November 2026)

### Added
- Separate curriculum chapter/topic collections and admin-only draft, source attribution, verification and publication workflow. No official syllabus content is seeded.
- Student text-only assignment submissions, deterministic per-student/assignment record, append-only revision history, due-date cutoff, teacher feedback and 0–100 grading.
- Curriculum administration/read UI and student submission/teacher review UI.
- Phase 5 fake-Firestore and route-authentication tests.

### Security and policy
- Student UID is always derived from the authenticated session.
- Curriculum and submission mutations use Firestore transactions and append audit records.
- Only verified/published curriculum is student/teacher visible. Topic publication requires its verified/published parent chapter.
- No file upload, external storage, new dependency, production access or deployment.


## Phase 7 remediation — 10 November 2026

- Enforced exact loopback-only Firebase Auth and Firestore emulator endpoints in both emulator tooling and Firebase Admin configuration; added negative tests for remote, public-IP, alias, IPv6 and malformed host values.
- Removed class-scoped notice visibility for student and teacher audiences when the associated class is inactive; added regression coverage while preserving notice history and administrator visibility.
- Pinned Firebase CLI (`firebase-tools@15.35.0`) and Netlify CLI (`netlify-cli@27.16.3`) in the project scripts via `npx`, and raised the documented minimum Node.js version to 22.13.0. The CLI packages are fetched on first use and are not included in the application lockfile. Added a cross-platform emulator command launcher so Windows npm scripts set the demo-only loopback environment correctly.


## Phase 7 continuation — ChitChat and final verification (10 November 2026)

### Added
- Module 7 ChitChat page and authenticated API routes within the existing vanilla JS / Netlify / Firebase architecture.
- Class-scoped messaging, replies, author-only time-limited edits, edit history, soft deletion, per-user read receipts, typing indicators, bounded search, date grouping, HTTPS attachment links, reports and staff moderation.
- DASH-09 unread-message metrics on admin, teacher and student dashboards, scoped to each role's active classes.
- Firestore composite indexes, role-page policy, communication audit-log categorisation, API/data-model documentation and ChitChat regression tests.

### Security and limitations
- All ChitChat operations use authenticated server routes; student membership and teacher assignment are checked server-side. Firestore client rules remain deny-all.
- Edit/delete/moderation and report-review writes include audit records in the same Firestore transaction.
- Near-real-time updates use five-second polling; search is limited to the latest 100 messages; attachments are HTTPS links only; notifications are in-app unread counts only. No paid storage, external notification provider or new dependency was introduced.
- Final emulator, browser and production-dependency verification remains pending; verdict remains NOT READY FOR PILOT.

## Phase 7 — Session 2 verification checkpoint (10 November 2026)

### Verified
- Fresh `npm test` and `npm run check`: 370 tests, 354 passed, 0 failed, 16 emulator-conditional skipped, 0 cancelled.
- All five Firebase project/config JSON files inspected in this session (package manifest, lockfile, firebase config and Firestore indexes) parse successfully.
- Existing static security tests pass for secret-file scanning, deny-all Firestore client rules, demo/loopback emulator settings and absence of production deploy targets.

### Outstanding / blocked
- Lockfile remains inconsistent for `esbuild@0.24.2` and `firebase@10.14.1`; registry DNS `EAI_AGAIN` blocked safe regeneration and clean `npm ci`. No integrity metadata was fabricated.
- Emulator client build blocked because `esbuild` is not installed; Firebase CLI/emulator run did not complete.
- Five route race tests remain skipped until the Auth/Firestore emulators are running; no race pass is claimed.
- Registry-backed npm audit is blocked by registry DNS; dependency advisory status remains unknown.
- Admin/teacher/student browser walkthrough and actual Windows PowerShell/cmd execution remain pending.
- Static Netlify headers include nosniff, frame denial, Referrer-Policy and Permissions-Policy; CSP/HSTS are absent and not live-verified.

**Release verdict remains NOT READY FOR PILOT.** See `TEST_RESULTS.md` and `PENDING_LOCAL_TESTS.txt`.
