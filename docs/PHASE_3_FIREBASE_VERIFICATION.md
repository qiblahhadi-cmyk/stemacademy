# STEM Academy — Phase 3 Firebase Verification

**Status:** Partially completed; emulator execution and live-project compatibility checks remain blocked.
**Scope:** Firebase configuration, authentication, Firestore browser-rule boundary, role/class/subject authorization, and permanent ID allocation.
**Safety:** Synthetic identities only. No live Firebase project was connected, changed, or deployed.

## Work completed in this phase

1. Extracted and reviewed the Phase 2 project and its Firebase/data-model/role documentation before editing.
2. Split Firebase Admin environment resolution into `lib/firebase-config.mjs`, which can be tested without importing the Admin SDK.
3. Made emulator configuration fail closed: if either emulator host is set, both Auth and Firestore hosts are required and the project ID must begin with `demo-`. Emulator mode never falls back to service-account credentials.
4. Preserved service-account mode and escaped-newline normalization for the private key.
5. Added deterministic unit tests for configuration selection and incomplete/unsafe environment combinations.
6. Added unit tests for exact user/class/access-type matching, active teaching assignments, subject-level isolation, class-level teacher scope, and admin access.
7. Added emulator integration checks for synthetic Auth password sign-in, Admin ID-token verification with revocation checking, Firestore Admin SDK connectivity, and unauthenticated direct Firestore read/write denial.
8. Added `npm run emulators` and `npm run test:emulator` scripts. These require the Firebase CLI (`firebase-tools`) to be installed separately.
9. Documented emulator setup and manual release gates. Firestore browser rules remain deny-all as required by the server-only data access architecture.

## Verification results in this environment

Command: `npm test`

- **28 passed**
- **0 failed**
- **6 skipped** (all six require running Firebase Auth/Firestore emulators and the Firebase Admin SDK)
- **34 total tests**

Command: `npm run check`

- JavaScript syntax checks passed for the active API and Firebase/auth/authorization modules.
- The full test suite completed with the same **28 passed / 0 failed / 6 skipped** result.

Additional environment checks:

- Node.js available: `v22.16.0`.
- Java available: OpenJDK `21.0.12.1`.
- Firebase CLI (`firebase`) was not installed.
- `npm ci` did not complete within the execution window. The existing `node_modules` directory is incomplete and `firebase-admin` is missing (`npm ls` reports an invalid/missing installation). Therefore no Admin SDK or emulator integration test was executed.
- No live Firebase credentials were supplied or used.

## Passed versus not yet verified

### Passed

- Static Firebase emulator configuration and rules-path checks.
- Static deny-all Firestore rule assertions.
- Firebase environment resolver tests, including partial emulator-host rejection and refusal to use a non-`demo-` project in emulator mode.
- Pure authorization-helper tests for admin, teacher, and student class boundaries and exact teacher subject assignments.
- Existing API, login-alias, and frontend static checks.

### Skipped / blocked

- Firebase Auth emulator account creation and password sign-in.
- Server-side verification of real emulator-issued Firebase ID tokens and revocation checks.
- Firestore emulator connection and actual unauthenticated client read/write denial against the deployed rules emulator.
- End-to-end `/api/me` and `/api/classes` integration tests with synthetic Firebase users.
- Firestore transaction-based ID allocation, including concurrency and uniqueness under the emulator.
- Clean dependency installation and Firebase Admin SDK import/runtime validation.

The six skipped test groups are not considered passed. The emulator suite must be run before Phase 3 can be marked fully verified.

## How to run the blocked emulator checks

Prerequisites: Node.js 22+, Java 21+, npm dependencies installed, and Firebase CLI installed (`firebase-tools`). Use only the demo project ID below; never substitute a live project ID.

```bash
npm ci
firebase --version
npm run test:emulator
```

The script runs only Auth and Firestore emulators using `demo-stem-academy`. Emulator integration tests use generated synthetic accounts and clean them up after each test. Firestore counters used by ID-allocation tests are synthetic test data and may remain in the local emulator database; do not export that emulator database as academy production data.

For interactive emulator startup instead:

```bash
npm run emulators
```

Then in another terminal:

```bash
FIREBASE_ADMIN_PROJECT_ID=demo-stem-academy \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
npm test
```

## Manual Firebase compatibility gate — not performed

The approved login alias domain is `stemacademy.edu.pk`. Emulator acceptance does not prove that a real Firebase Authentication project accepts this domain for email/password account creation. Before real account provisioning, perform a separate test in a dedicated non-production Firebase project using a synthetic test account only. Confirm create, password sign-in, token verification, and deletion. Do not send email to the alias and do not treat it as a mailbox. If Firebase rejects the domain, stop for owner review; do not silently substitute a different domain.

## Existing implementation limits

- The permanent ID allocator uses Firestore transactions, but it is not connected to a trusted account-provisioning workflow yet.
- The live feature API remains incomplete: assignments, assessments, attendance, communication, account provisioning/recovery, audit logging, backups, and restore are not production-ready.
- Firestore browser rules deny all direct client access. Firebase Admin SDK bypasses those rules, so every future API endpoint must authenticate, authorize, validate fields, constrain records to the caller's class/subject/ownership scope, and return allowlisted data.
- The current unit tests for authorization helpers use an in-memory query mock; they do not replace emulator-backed API tests.

## Deployment decision

**Not ready for production. Do not deploy or create real academy accounts/data.** First complete dependency installation and run the emulator suite, resolve any failures, verify the approved alias domain in a separate test Firebase project, then implement and test account provisioning and the remaining LMS feature APIs. Production Firebase setup, rules/index deployment, backups, restore, and operational review remain separate release gates.
