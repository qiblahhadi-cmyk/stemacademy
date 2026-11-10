> **PRODUCTION SAFETY — NOT PRODUCTION VERIFIED.** This project is **NOT READY FOR REAL-DATA PRODUCTION DEPLOYMENT**. Do not enter real student/staff data or connect production Firebase until every blocker and checklist item in [`PRODUCTION_READINESS_WARNING.md`](PRODUCTION_READINESS_WARNING.md) is resolved with evidence and independently reviewed.

# STEM Academy

A classroom-first learning management system prototype for AJK Board Physics.

## Firebase emulator verification (Phase 3)

The project supports isolated Auth and Firestore emulator testing with a `demo-` project ID. Install the Firebase CLI separately, then run `npm ci` and `npm run test:emulator`. Emulator tests use synthetic accounts only. See [`docs/PHASE_3_FIREBASE_VERIFICATION.md`](docs/PHASE_3_FIREBASE_VERIFICATION.md) for prerequisites, exact commands, verification status, and release blockers. Do not use a live Firebase project for emulator tests.

## Current status

**NOT READY FOR PILOT.** Phase 7 source remediation and offline verification have been continued, including the previously missing ChitChat module and DASH-09. The latest `npm run check` result is recorded in `TEST_RESULTS.md` and `PHASE7_FINAL_VERIFICATION_REPORT.md`. Sixteen emulator-conditional tests remain skipped. Clean dependency installation, lockfile verification, emulator integration/race tests, emulator client build, authenticated browser walkthrough and a registry-backed npm audit remain release gates.

Firestore browser/client access is intentionally denied by `firestore.rules`. All application data access goes through authenticated Netlify API routes using the Firebase Admin SDK. Do not loosen the rules.

## Requirements

- Node.js 22.13.0 or later
- npm
- A JDK (Java 21 or later recommended) for the Firestore emulator. The Firebase CLI is fetched by `npx` at its pinned version; do not install it globally or as a dependency.

## Install and verify

```bash
npm install
npm test
```

`npm test` runs the full suite. Emulator tests are skipped unless the emulators are running; they are reported as skipped, not passed.

## Local development with the emulators

Follow [`docs/LOCAL_EMULATOR_SETUP.md`](docs/LOCAL_EMULATOR_SETUP.md). In short:

```bash
npm run test:emulator                                 # wrapper supplies safe demo emulator settings
npm run emulators                                     # terminal 1
npm run seed:emulator                                 # terminal 2, then copy the printed passwords
npm run dev                                           # terminal 3, open /login.html
```

Environment variables are listed in [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md).

## Scripts

| Script | Purpose |
|---|---|
| `npm test` | Full unit and logic suite. Emulator tests skip without emulators. |
| `npm run test:emulator` | Starts the Auth and Firestore emulators and runs the full suite. |
| `npm run emulators` | Starts the emulators and keeps them running. |
| `npm run seed:emulator` | Seeds the emulators with a demo classroom. Refuses non-emulator setups. |
| `npm run build:client:emulator` | Builds the emulator-only browser bundle (cross-platform; refused on Netlify). |
| `npm run dev` | Builds the emulator browser bundle and starts Netlify Dev. |
| `npm run build:client` | Builds the browser bundle for a live project (needs `PUBLIC_FIREBASE_*`). |
| `npm run check` | Syntax-checks the server modules, then runs the tests. |
| `npm run verify:lockfile` | Offline check that `package-lock.json` records every declared dependency (exit 1 until the lockfile is regenerated with `npm install`). |

## Deployment boundary

Do not deploy this repository as a production LMS or enter real student/staff information until the remaining items in [`docs/PRE_DEPLOYMENT_AUDIT.md`](docs/PRE_DEPLOYMENT_AUDIT.md) have been implemented and independently verified. A static preview deployment is not equivalent to a secure, working LMS deployment.


## Phase 6 continuation status

Phase 6 is in progress and is **not complete**. Emulator testing is intentionally reserved for the final pre-production verification stage; no emulator result is claimed in the current report. The current progress report, test results and remaining blockers are in [`docs/PHASE_6_REPORT.md`](docs/PHASE_6_REPORT.md). The approved Course Hub V1 restriction and transactional membership work are documented in [`docs/MEMBERSHIP_MIGRATION.md`](docs/MEMBERSHIP_MIGRATION.md). Administrator management API and UI are now implemented for students, teachers, classes, subjects, memberships and teaching assignments. Firebase Auth provisioning stages disabled accounts and includes an owner-verified one-time credential handoff plus forced first-password-change flow. Emulator verification and owner/technical-custodian rehearsal remain mandatory before real accounts are created. See [`docs/ADMIN_ACCOUNT_PROVISIONING.md`](docs/ADMIN_ACCOUNT_PROVISIONING.md). API routes currently implemented are listed in [`docs/API.md`](docs/API.md). No deployment or production data access is authorized.

## Phase 5 features

- Curriculum records are stored separately from subject metadata. No official AJK Board syllabus is preloaded; administrators must supply and attest source title, publisher and edition before publishing content. See [`docs/CURRICULUM_DATA_MODEL.md`](docs/CURRICULUM_DATA_MODEL.md).
- Assignment submissions are text-only. Students may submit/resubmit while an assignment is published and before its deadline; teachers can provide feedback and a percentage grade. File uploads are not supported. See [`docs/ASSIGNMENT_SUBMISSIONS.md`](docs/ASSIGNMENT_SUBMISSIONS.md).


## Local CLI versions

The local emulator and Netlify development scripts invoke pinned CLI package versions through `npx`. Emulator commands use `scripts/run-emulator-command.mjs` to set demo-only, exact loopback environment variables in a cross-platform way (including Windows PowerShell / `npm.cmd`):

- Firebase CLI: `firebase-tools@15.35.0`
- Netlify CLI: `netlify-cli@27.16.3`
- Node.js: `>=22.13.0` (required by the pinned Netlify CLI)

**Windows PowerShell:** use `npm.cmd` / `npx.cmd`. The emulator wrapper quotes arguments for `cmd.exe` (see `scripts/shell-quote.mjs`).

The first run downloads the exact CLI package version and therefore requires npm registry access. The CLI packages are intentionally not installed globally. The repository lockfile continues to lock the application dependencies; because the CLI packages are fetched through `npx`, their complete transitive dependency trees are not part of `package-lock.json`. For an offline or fully hermetic build, vendor a separately generated CLI lockfile in a future maintenance change.

## Module 7 — ChitChat

ChitChat is a class-scoped authenticated messaging module. It supports messages, replies, time-limited author edits, edit history, soft deletion/moderation, individual read receipts, typing indicators, bounded search, reports and DASH-09 unread counts. It uses five-second API polling, searches the latest 100 messages and accepts HTTPS attachment links only; it does not upload files or send email/SMS/push notifications. See [`docs/CHITCHAT_DATA_MODEL.md`](docs/CHITCHAT_DATA_MODEL.md). Emulator and browser verification are still pending.

## Session 2 verification checkpoint — 10 November 2026

**Current verdict: NOT READY FOR PILOT.** Fresh `npm test` and `npm run check` both pass with 370 tests (354 passed, 0 failed, 16 emulator-conditional skipped). The lockfile remains inconsistent: the declared `esbuild@0.24.2` and `firebase@10.14.1` dependencies are missing from the lockfile root and package entries. Registry DNS (`EAI_AGAIN registry.npmjs.org`) prevented lockfile regeneration, clean install and a registry-backed dependency audit. The emulator client build is blocked by missing `esbuild`; the Firebase CLI/emulator suite and five route race tests have not passed. See `TEST_RESULTS.md` and `PENDING_LOCAL_TESTS.txt` for exact evidence and commands.

The static review confirms deny-all Firestore client rules and the existing emulator demo/loopback guards. `netlify.toml` currently has X-Content-Type-Options, X-Frame-Options, Referrer-Policy and Permissions-Policy; CSP and HSTS are not configured or live-verified. No production deployment or Firebase change was made.
