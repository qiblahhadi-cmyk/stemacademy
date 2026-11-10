# STEM Academy — Session 1 Work Log

**Date:** 10 November 2026
**Status:** Session 1 checkpoint prepared; project is **not finished** and is **not ready for pilot**.

## 1. Source and working baseline

- Primary source: `STEM_Academy_Phase7_Final_Verification_Pending_Local_Tests(1).zip`.
- Reference source: `STEM_Academy_Documentation_and_Reference_Pack.zip`.
- Working project: `STEM_Academy_Phase6_Phase5_Corrected/` extracted under `/mnt/data/stem_session1/project/`.
- The original uploaded ZIPs remain untouched. The user's Windows project folder was not directly accessible and was not modified.
- Historical emulator baseline supplied in Session 1 prompt: 384 tests, 379 passed, 0 failed, 5 cancelled, exit code 1. The five cancellations were the production-route membership race tests.
- The supplied Phase 7 `TEST_RESULTS.md` records a later non-emulator `npm run check` result of 370 tests: 354 passed, 0 failed, 16 skipped. This is inherited report evidence, not a result rerun during this session.

## 2. Work completed

### Race-test recovery

- Current Phase 7 race file already contained all five required test registrations and imports for `authorization.mjs`, attendance, assignments and assessments handlers.
- Compared it with the 10,966-byte reconstructed reference `production-route-races-emulator-restored.mjs` in the documentation pack.
- The substantive discrepancy was `raceAndAssert()`: the Phase 7 file awaited `paused.entered` unconditionally. If a handler returned or rejected before the intercepted transaction write, that promise remained pending and Node cancelled the test with `ERR_TEST_FAILURE` / `cancelledByParent`.
- Restored the reference helper's `Promise.race` between transaction entry and handler completion/rejection. It now reports an actionable error including HTTP status/body when the route completes before the first intercepted write. It still performs the revocation during the paused transaction and awaits the state assertion.
- The race-test file is now 10,966 bytes and matches the recovered reference after whitespace normalization. All five registrations remain present.
- This repairs the test harness's indefinite wait; it does **not** prove the five route races pass. The emulator run is still required and may now expose a specific route/transaction failure instead of a cancelled test.

### Emulator configuration documentation

- Updated `README.md`, `LOCAL_MACHINE_VERIFICATION_GUIDE.md`, and `docs/LOCAL_EMULATOR_SETUP.md` to remove contradictory instructions to create a repository-root `.env` for emulator variables.
- The supported `scripts/run-emulator-command.mjs` wrapper injects `FIREBASE_ADMIN_PROJECT_ID=demo-stem-academy`, Auth emulator `127.0.0.1:9099`, and Firestore emulator `127.0.0.1:8080`, then validates the configuration. No root `.env` is required for the documented emulator commands.
- This aligns the operational docs with the supplied instruction not to create a root `.env` for emulator variables and avoids the previously observed secret/config-test interaction.

## 3. Modified files

1. `tests/firebase/production-route-races-emulator.test.mjs` — restored guarded race orchestration from the supplied reference.
2. `README.md` — removed obsolete `.env` creation step.
3. `LOCAL_MACHINE_VERIFICATION_GUIDE.md` — documents wrapper-injected emulator environment; no root `.env` step.
4. `docs/LOCAL_EMULATOR_SETUP.md` — same correction and removed stale hard-coded emulator test count.
5. `SESSION_1_WORK_LOG.md` — this checkpoint.
6. `SESSION_2_HANDOFF.md` — continuation instructions.

No route implementation, Firestore rules, data model, dependencies, package manifest or lockfile was changed.

## 4. Checks run in this session

| Check | Command / method | Result |
|---|---|---|
| JavaScript syntax | `node --check` on all `.js` and `.mjs` files under `netlify`, `scripts`, `public`, `tests` | PASS — 99 files, 0 syntax failures |
| Emulator guard + project config | `node --test tests/scripts/emulator-guard.test.mjs tests/scripts/project-config.test.mjs` | PASS — 18 passed, 0 failed, 0 skipped |
| Lockfile consistency | `npm run verify:lockfile` | FAIL — 4 reported issues: missing root ranges and package entries for `esbuild@0.24.2` and `firebase@10.14.1` |
| Secret/config presence | checked root `.env`, `.env.local`, `service-account.json`, `firebase-service-account.json`; reviewed `.gitignore` | PASS — none of those files present; `.env` and `.env.*` are ignored except `.env.example` |
| Firestore/emulator configuration | inspected rules, `firebase.json`, Netlify config; config tests included | PASS as static evidence — Firestore rules deny direct client access; emulator endpoints are loopback; no production deploy target configured in `firebase.json` |
| Recovered race helper | compared normalized race file with supplied reconstructed reference | PASS — identical after whitespace normalization; five tests registered |

## 5. Checks not run

- Full `npm test` / `npm run check` not rerun: no `node_modules` directory was present, and the lockfile is incomplete. The inherited Phase 7 report's 370-test result is not represented as a fresh run.
- Firebase Auth/Firestore emulator suite and five race tests not run: Firebase CLI is not installed locally in this workspace and dependencies are not installed. Java 21 is present, but that alone is insufficient.
- `npm ci`, browser build, Netlify local server, authenticated browser walkthrough, Windows PowerShell/cmd execution, registry-backed `npm audit`, real Firestore index validation and membership migration not run.
- No production Firebase, production data, deployment, GitHub push, or secrets were accessed.

## 6. Unresolved issues / release gates

1. **Lockfile blocker:** `package-lock.json` is inconsistent with `package.json`; `esbuild@0.24.2` and `firebase@10.14.1` are absent from the lockfile root and package entries. Regenerate only with registry access, inspect the diff, then prove clean `npm ci`.
2. **Race behavior unverified:** run the five targeted tests on local Auth/Firestore emulators. If the helper reports early completion, diagnose the route/transaction path; do not weaken assertions.
3. **Full emulator verification pending:** run all emulator-gated tests, check indexes and membership migration only against the `demo-stem-academy` emulators.
4. **Build/browser pending:** emulator client build and authenticated admin/teacher/student walkthrough remain unverified.
5. **Windows pending:** run documented PowerShell/cmd workflows on the owner's Windows machine.
6. **Dependency audit pending:** current registry-backed `npm audit` has not been completed; offline audit output is not evidence of zero vulnerabilities.
7. **Additional documented release gates remain:** ChitChat/DASH-09 browser checks, final security review and any unresolved items in the Phase 7 reports.

## 7. Safety notes

- Do not create a repository-root `.env` for emulator variables. Use the supported npm wrapper scripts, which inject and validate demo/loopback settings.
- Do not use production Firebase, real student/staff data, live credentials, deployment commands, or force-push GitHub.
- Keep generated passwords, tokens, `.env`, service-account files, `node_modules`, emulator exports and sensitive logs out of the delivery ZIP.
- The final delivery ZIP is intentionally not created in Session 1.
