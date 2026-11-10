# STEM Academy — Phase 6 Initial Gap Analysis

**Source:** `stemacademy-phase5-final.zip` (extracted without replacing the project)
**Review date:** 9 November 2026
**Status:** Historical initial gap analysis with current implementation updates appended; Phase 6 remains in progress.
**Deployment:** Not authorized. No production services or records were accessed.

## 1. Baseline verification

The uploaded Phase 5 report records 165 tests: 159 passed, 0 failed, 6 skipped. A fresh run in this workspace reproduced those results exactly:

- `npm test`: 159 passed, 0 failed, 6 skipped (165 total).
- `npm run check`: 159 passed, 0 failed, 6 skipped; configured syntax checks also completed.
- Runtime: Node.js 22.16.0, npm 10.9.2, Java 21.0.12.1.
- `npm run test:emulator`: blocked; `firebase` executable is not installed (`firebase: not found`, exit 127).
- `npm run build:client:emulator`: blocked; `esbuild` is not installed (`ERR_MODULE_NOT_FOUND`).
- `npm install --save-dev firebase-tools netlify-cli`: did not finish within the 240-second execution limit; no package or lockfile change was produced.
- `netlify` executable is not installed. Chromium exists, but the Netlify development server, browser bundle and Firebase emulators are not available, so an authenticated browser walkthrough cannot yet be run.

The six skipped tests are emulator-gated tests, not passes. The first Phase 6 continuation raised the suite to 180 tests (174 passed, 0 failed, 6 skipped); later admin/account work raised it to 209 tests (203 passed, 0 failed, 6 skipped). The latest current run is recorded in `docs/PHASE_6_REPORT.md`. The transaction tests use the in-memory Firestore test double; emulator suite, real index query validation and browser walkthrough remain unverified. Dependency installation timed out and offline cache did not contain esbuild; package files were preserved.

## 2. Current implementation inventory

| Module | Current evidence | Initial status |
|---|---|---|
| Firebase sign-in/session | Client session modules and API token middleware exist; emulator Auth integration skipped | Implemented but not fully verified |
| Role navigation/page guard | Role policy and frontend tests exist; server remains authoritative | Working in unit tests; browser not verified |
| Classes | Authenticated `/api/classes` listing and read-only page; no create/edit/archive UI or API | Partially implemented |
| Subjects | Authenticated subject listing/scope route; chapter/topic page is illustrative local data | Partially implemented |
| Assignments | API and UI lifecycle (draft/publish/close) with unit tests | Implemented but not fully verified |
| Attendance | API and UI marking/correction; membership check currently occurs before write transaction | Implemented with data-integrity blocker |
| MCQ assessments | API and UI lifecycle, server scoring and release controls; start checks membership before transaction | Implemented but not fully verified; data-integrity blocker |
| Student administration | No CRUD workflow or account provisioning | Not implemented |
| Teacher/staff administration | No CRUD workflow or account provisioning | Not implemented |
| Membership administration | No operational management UI/API; seed-only records | Not implemented |
| Teaching assignments | Used by authorization and seed data; no admin management UI/API | Not implemented |
| Course Hub | Sample resources in browser memory; syllabus not verified | Demo only |
| Communication | Sample notices in browser memory; no persistence or delivery | Demo only |
| Role Preview | Admin-only page policy; local static UI switcher; no role/permission mutation or backend endpoint | Demo only; appears UI-only |
| Dashboard metrics | Greeting and class count live; other figures are sample data | Partially implemented |
| Profile | Page is a preview; no profile editing workflow | Demo only |
| Settings | Preview/coming-soon; no persistence | Demo only |
| Activity logs | Static sample entries; no live audit-log reader | Demo only |
| Firestore client access | Deny-all rules are present and tests assert no browser access | Implemented; emulator confirmation pending |
| ID allocation | Transactional student/staff allocator helper and emulator-gated tests; not connected to provisioning | Implemented helper, not operational |
| Account lockout/recovery | Policies described in data-model documentation; no complete operational flow found in current route inventory | Not implemented |
| Backup/restore | Policy documented; no implemented export/restore workflow found | Not implemented |

## 3. Confirmed data-integrity issue

The attendance mark and correction handlers call `confirmStudents()` before entering their Firestore write transaction. Assessment `startAttempt()` similarly checks student class access before opening its transaction. A membership can therefore be revoked after the pre-check and before the protected write.

The `classAccess` collection was queried by `userUid`, `classId`, `accessType`, and `active`, while some seed records used arbitrary IDs. Phase 6 now standardizes the key as `ca_` plus SHA-256 of JSON tuple `[classId, accessType, userUid]`. Attendance mark/correction and assessment attempt-start now read that exact membership, active user and active class inside the protected write transaction. The administrator membership API supports enrollment/reactivation, soft deactivation and listing, with append-only history/audit records. An emulator-only legacy migration script has been added but has not yet been executed. The in-memory regression tests pass; real Firestore concurrency remains unverified.

## 4. Initial recommendations for owner decisions

### Decision A — Course Hub and Communication (APPROVED — FINAL)

- **Course Hub:** removed from V1 navigation and denied by the page policy for all roles until official AJK Board syllabus content is verified.
- **Communication:** persistent academy/class notice board is approved, with no email/SMS/WhatsApp or paid delivery. Firestore-backed routes and a connected page are now implemented; emulator/browser verification remains outstanding.

### Decision B — Role Preview (APPROVED — FINAL)

APPROVED. Retain only as a safe, admin-only, UI-only design preview. It must never change session or actual role/permissions. Backend authorization continues to use the trusted server-side user record. Further explicit UI-only regression verification remains to be recorded.

### Decision C — Membership race condition (APPROVED — FINAL)

APPROVED and first implementation increment completed. Canonical hashed membership IDs, transaction-bound membership/account/class checks, admin membership enrollment/deactivation and test-double race regressions are in place. Firestore emulator execution and migration verification remain outstanding.

## 5. Account provisioning constraints to preserve

- Keep the permanent student/staff academy ID independent from Firebase UID and login alias.
- Use the existing server-side Firebase Admin SDK architecture; service credentials remain Netlify/server environment secrets only and never reach browser code.
- Only an authenticated administrator may provision student/teacher records or assign roles. No self-registration and no client-selected role/ID.
- Allocate IDs server-side using the existing transaction-safe allocator; persist the academy ID immutably.
- Do not store plaintext passwords or write them to logs/audit events. The owner-verified temporary credential handoff and forced first-password-change flow are implemented, but still require emulator and operator rehearsal before real account activation.
- Treat `stemacademy.edu.pk` as an approved alias direction only; Firebase compatibility and domain ownership/configuration are not established by this repository.

## 6. Remaining blockers and next sequence

1. Complete non-emulator code review, UI usability work, documentation reconciliation, static checks and unit regression tests.
2. Install dependencies from the unchanged lockfile when registry access is available; build the browser bundles and complete an authenticated browser walkthrough.
3. At the owner's requested final verification stage, run the canonical membership migration and all Auth/Firestore emulator concurrency, provisioning, notice, index and authorization checks using synthetic data only.
4. Complete the administrator/technical-custodian rehearsal for the first-password process; verify alias compatibility without assuming email delivery or domain ownership.
5. Review dashboard sample metrics, account lockout/recovery policy, activity-log visibility and backup/restore as explicitly out-of-scope or future work; do not imply they are implemented.
6. Update the acceptance matrix and package only after local checks are green and emulator/browser limitations are clearly recorded.

The three owner decisions are approved and final; no further approval is needed for them.

No deployment, production Firebase connection, production rules change, or real student/staff data entry has occurred or is authorized in this phase.


## 7. Phase 6 continuation update (9 November 2026)

### Implemented in this increment

- Transaction-bound membership checks for attendance mark/correction and assessment attempt start.
- Canonical `classAccess` document IDs and emulator-only migration script retaining/deactivating legacy documents.
- Admin-only membership listing, enrollment/reactivation and soft deactivation API, including duplicate/concurrency protection, history and audit records.
- Course Hub links removed from active navigation and direct page policy denied for every role.
- Updated seed data, test-double concurrency hook, regression tests, API notes and provisioning blocker documentation.
- Firestore-backed Communication notice API and connected UI with scope authorization, search/filtering and audit records.

### Fresh post-change results

- `npm test`: 174 passed, 0 failed, 6 skipped (180 total).
- `npm run check`: passed with the same test totals.
- `npm run build:client:emulator`: blocked because `esbuild` is unavailable.
- `npm run test:emulator`: blocked because Firebase CLI is unavailable.
- Browser walkthrough and emulator index verification: not executed.

### Owner decisions

All three owner decisions in the handover are final and applied as scope constraints. No further approval is requested.

See `docs/PHASE_6_REPORT.md` for the feature matrix, detailed results and remaining acceptance blockers.

## 7. Continuation update — administrator management and Auth staging

### New findings and implementation

- The previous gap assessment correctly identified no operational administrator management UI/API. Phase 6 continuation has now added `/admin-management.html`, role policy and server-side admin endpoints for student/teacher records, classes, subjects and teaching assignments.
- Membership enrollment/deactivation remains on the separate transactional `/api/memberships` endpoints; membership listing now supports student UID filtering.
- Teaching assignment document IDs are deterministic for `[teacherUid, classId, subjectId]`; active teacher, class and same-grade subject checks are performed inside the Firestore transaction for creation/update.
- `POST /api/admin/accounts` stages student/teacher Firebase Auth accounts using the existing server-side Admin SDK. Permanent academy IDs are allocated server-side and immutable. New Auth users are disabled; Firestore profiles are inactive with `provisioningStatus: "pending_activation"`.
- The account API has no public self-registration, no client-selected UID/ID/alias/password, no administrator role creation, and no credential response. It attempts compensating Auth deletion if profile persistence fails.
- The management UI is a basic operational first pass. It supports search, creation, display-name/name editing, deactivation/reactivation where eligible, membership enrollment and teacher assignment creation. Detailed metadata editing and joined student detail view remain incomplete.

### Current verification

- `npm test`: 203 passed, 0 failed, 6 skipped (209 total).
- `npm run check`: passed with the same result.
- New administrator management tests: 18 passed; membership filtering and page-policy tests also pass.
- `npm run build:client:emulator`: blocked because `esbuild` is not installed.
- `npm run test:emulator`: blocked because Firebase CLI is not installed.
- Browser walkthrough and emulator index/query verification: not executed.

### Security and provisioning blocker

Account staging is not activation. No tested zero-budget credential handoff or forced-password-change flow exists. New accounts remain disabled/inactive; no real accounts should be created. The `stemacademy.edu.pk` alias is not assumed to deliver email. An ordinary administrator cannot activate a pending account by editing its profile. Owner/technical-custodian credential handoff and forced password change must be implemented and emulator-tested first.

### Updated next sequence

1. Complete secure activation/first-password handoff and forced password change without paid messaging or exposing secrets to ordinary administrators.
2. Add joined student detail view and finish multi-field management UI.
3. Install dependencies from the unchanged lockfile in a permitted execution window; run Auth/Firestore emulator tests for membership, management, account staging and alias compatibility.
4. Verify indexes and direct API authorization using synthetic accounts.
5. Complete browser walkthrough and end-to-end tests; do not deploy.


## 8. Secure first-password workflow update

The initial-credential and forced-password-change workflow is now implemented in code: a guarded owner/technical-custodian utility issues a temporary password and the `mustChangePassword` claim; a forced password-change page and server endpoint update Firebase Auth, activate the trusted profile, and clear the claim. Middleware blocks all ordinary APIs until completion. The script requires explicit project confirmation and server-side credentials for any non-emulator invocation and refuses Netlify execution.

Current results: `npm test` and `npm run check` both report 203 passed, 0 failed, 6 skipped (209 total). The ten account-activation tests pass in the unit suite. Firebase CLI and esbuild remain unavailable, so no emulator or browser verification has occurred. The handoff script has only been syntax-checked and has not been executed. Do not create real accounts until the synthetic emulator lifecycle and owner/technical-custodian rehearsal pass.
