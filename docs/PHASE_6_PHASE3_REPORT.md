# Phase 6 — Phase 3 Report: Activity Logs and Account Administration

Date: 10 November 2026. Baseline: `STEM_Academy_Phase6_Phase2_Corrected.zip`.

## Scope delivered
- **P1-4 Activity Logs — implemented and unit/integration-tested against the fake Firestore.** See `docs/API.md` for the contract.
- **P1-5 Account recovery — reviewed; deliberately not implemented as an endpoint.** An owner-controlled manual procedure is documented in `docs/ACCOUNT_RECOVERY_PROCEDURE.md` and guarded by tests.

## Files changed
New: `netlify/functions/lib/routes/audit-logs.mjs`, `docs/ACCOUNT_RECOVERY_PROCEDURE.md`, `docs/PHASE_6_PHASE3_REPORT.md`, `tests/api/audit-logs.test.mjs`, `tests/api/account-recovery-policy.test.mjs`, `tests/frontend/activity-logs-ui.test.mjs`.
Modified: `netlify/functions/lib/routes/admin.mjs`, `public/activity-logs.html`, `public/assets/js/activity-logs.js`, `public/assets/css/modules.css`, `firestore.indexes.json`, `package.json` (check script only), `tests/helpers/fake-firestore.mjs`, `docs/API.md`, `docs/FIRESTORE_DATA_MODEL.md`, `CHANGELOG.md`.

## Test results (this environment)
| Command | Result |
|---|---|
| Baseline `npm test` (before changes) | 259 tests, 253 pass, 0 fail, 6 skipped |
| `npm test` (after) | **287 tests, 281 pass, 0 fail, 0 cancelled, 6 skipped** |
| `npm run check` | exit 0 (all `node --check` steps, then the same suite: 287 / 281 / 0 / 6) |
| `npm run test:emulator` | **NOT RUN** |
| Browser walkthrough | **NOT DONE** |

The 6 skipped tests are the emulator-dependent ones (API auth, classes list API, emulator smoke ×3, ID allocation). They are reported as skipped, not passed.

Mutation checks performed on the new tests: leaking `studentUid`/`score` in metadata fails the privacy test; an off-by-one cursor fails the pagination test. Removing only the route-level admin guard does not fail a test because `handleAdmin` enforces the same check (defence in depth).

## Why the emulator and browser checks are missing
The sandbox has no network access: `npm ci` fails (`ENOTFOUND registry.npmjs.org`), so `node_modules` (including `firebase-admin`), the Firebase CLI and Netlify CLI are not available, and the Auth/Firestore emulators and local Netlify dev server could not be started. All new tests run through the existing injected-dependency pattern with the fake Firestore. **The audit log queries (`orderBy`, `startAfter`, range filters and the two new indexes) have not been exercised against the real Firestore emulator**, and the Activity Logs page has not been loaded in a browser as administrator, teacher or student. Run `npm ci`, `npm run test:emulator` and the three-role browser walkthrough locally before accepting this phase.

## Design notes and limitations
- Search and the category filter are evaluated in memory over a bounded scan (500 entries per request); `scanLimited` tells the UI when older entries were not yet searched. Exact `action` and `actorRole` filters and date range are evaluated by Firestore.
- Actors are shown as role + permanent academy ID (read from `users`), never display name. Actors without a profile show role only.
- The audit documents written by older routes have varying metadata; only allowlisted keys are shown. Unknown future actions display a generic description and the category "Other".
- Event categories are derived from the action prefix; new action prefixes need an entry in `CATEGORY_BY_PREFIX` to be categorised.
- Not implemented in this phase: recovery endpoint (by design), export of logs, retention policy, real-time updates.
- Observation for owner decision (unchanged): activation of profiles in `credential_issuing`/`credential_issued` via PATCH is blocked only for `pending_activation` — see recovery document §5.

## Run locally
```
npm ci
npm test
npm run check
npm run emulators            # terminal 1
npm run test:emulator        # or run against the running emulators
npm run seed:emulator && npm run dev
```
Sign in as the seeded synthetic administrator and open `/activity-logs.html`; confirm teacher and student accounts are redirected/denied and `GET /api/admin/audit-logs` returns 403 for them.
