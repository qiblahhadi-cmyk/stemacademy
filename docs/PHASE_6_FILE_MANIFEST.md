# Phase 6 File Manifest — current continuation

Compared with the supplied `stemacademy-phase5-final.zip` source archive.

## Created (22)

- `docs/ADMIN_ACCOUNT_PROVISIONING.md`
- `docs/ADMIN_MANAGEMENT_GUIDE.md`
- `docs/API.md`
- `docs/LOGIN_GUIDE.md`
- `docs/MEMBERSHIP_MIGRATION.md`
- `docs/PHASE_6_FILE_MANIFEST.md`
- `docs/PHASE_6_GAP_ANALYSIS.md`
- `docs/PHASE_6_REPORT.md`
- `netlify/functions/lib/routes/account-activation.mjs`
- `netlify/functions/lib/routes/admin.mjs`
- `netlify/functions/lib/routes/memberships.mjs`
- `netlify/functions/lib/routes/notices.mjs`
- `public/activate-account.html`
- `public/admin-management.html`
- `public/assets/js/activate-account.js`
- `public/assets/js/admin-management.js`
- `scripts/issue-initial-credential.mjs`
- `scripts/migrate-class-access.mjs`
- `tests/api/account-activation.test.mjs`
- `tests/api/admin.test.mjs`
- `tests/api/memberships.test.mjs`
- `tests/api/notices.test.mjs`

## Modified (34)

- `README.md`
- `docs/ENVIRONMENT.md`
- `docs/FIRESTORE_DATA_MODEL.md`
- `docs/LOCAL_EMULATOR_SETUP.md`
- `firestore.indexes.json`
- `netlify/functions/api.mjs`
- `netlify/functions/lib/auth-middleware.mjs`
- `netlify/functions/lib/authorization.mjs`
- `netlify/functions/lib/errors.mjs`
- `netlify/functions/lib/routes/assessments.mjs`
- `netlify/functions/lib/routes/attendance.mjs`
- `package.json`
- `public/activity-logs.html`
- `public/assessments.html`
- `public/assets/css/auth.css`
- `public/assets/css/modules.css`
- `public/assets/js/communication.js`
- `public/assignments.html`
- `public/attendance.html`
- `public/classes.html`
- `public/communication.html`
- `public/course-hub.html`
- `public/index.html`
- `public/my-assessments.html`
- `public/profile.html`
- `public/settings.html`
- `public/subjects.html`
- `scripts/seed-emulator.mjs`
- `src/client/nav-policy.js`
- `src/client/session-entry.js`
- `tests/api/assessments.test.mjs`
- `tests/api/attendance.test.mjs`
- `tests/frontend/nav-policy.test.mjs`
- `tests/helpers/fake-firestore.mjs`

## Removed

None.

## Packaging exclusions

The deliverable excludes `node_modules`, `.env` files, Firebase service-account keys, private credentials, generated browser bundles, caches, and temporary test logs. The original `package-lock.json` is retained unchanged; package versions were not upgraded.


## Later continuation changes

The following files received additional changes after the original manifest snapshot:

- `README.md` — current Phase 6 test status and final-stage emulator boundary.
- `docs/LOCAL_EMULATOR_SETUP.md` — current test-count guidance and administrator/account/notice browser walkthrough.
- `docs/PHASE_6_GAP_ANALYSIS.md` — historical/current status reconciliation and updated remaining sequence.
- `docs/PHASE_6_REPORT.md` — latest non-emulator checks and remaining limitations.
- `docs/ADMIN_ACCOUNT_PROVISIONING.md` — one-time credential issuance lock and interrupted-run recovery warning.
- `netlify/functions/lib/routes/admin.mjs` — allow deactivation of teaching assignments after referenced class/subject deactivation.
- `public/assets/js/admin-management.js` — reference dropdowns and multi-field class/subject editing.
- `scripts/issue-initial-credential.mjs` — one-time credential issuance lock and Auth preconditions.
- `tests/api/admin.test.mjs` — regression test for deactivating assignments after class deactivation.
