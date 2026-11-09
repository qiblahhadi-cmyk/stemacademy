# STEM Academy — Firebase Test-Stage Plan

**Status:** Test-stage preparation only  
**Owner policy approval:** Consolidated remaining policies approved 8 November 2026  
**Working branch:** `build/frontend-foundation`  
**Production status:** Not approved; do not enter real student or staff records

## 1. Purpose and safety boundary

Prepare a local Firebase Authentication + Cloud Firestore emulator environment first. Use only synthetic test accounts and fictional data. Do not connect the current application to a live Firebase project yet.

Firebase's official documentation recommends demo project IDs for emulator work where possible. A demo project ID begins with `demo-`; emulator-only calls cannot affect live resources, and attempts to use a product without a running emulator fail. The initial local project ID for this repository is:

```
demo-stem-academy
```

The emulator suite will include only Authentication and Firestore. Do not configure Cloud Functions, Storage, Hosting or paid products.

## 2. Repository configuration

- `firebase.json` points the Firestore emulator to the existing `firestore.rules` file.
- Authentication emulator: `127.0.0.1:9099`.
- Firestore emulator: `127.0.0.1:8080`.
- Emulator UI: `127.0.0.1:4000`.
- Firestore browser rules remain deny-all. The emulator must load the same rules.
- Do not commit `.env`, service-account JSON, private keys, passwords, emulator exports containing personal data, or real project credentials.

## 3. Local machine prerequisites

Use the project's supported Node.js 22 runtime. Install a current Java JDK (Java 21 is the chosen baseline for the current Firestore emulator compatibility path) and the Firebase CLI. Verify versions before running emulators:

```powershell
node --version
java -version
npx firebase-tools --version
```

The Firebase CLI downloads emulator binaries on first run. This is a local development download, not a paid Firebase service.

## 4. Start the local emulators

From the repository root:

```powershell
npx firebase-tools emulators:start --only auth,firestore --project demo-stem-academy
```

Open the Emulator UI at `http://127.0.0.1:4000`. Authentication and Firestore data created in this demo project are local test data only. Stop the emulators with Ctrl+C.

Do not use a real project ID for this first emulator stage. Do not set production Firebase credentials or service-account keys.

## 5. Test sequence

1. Confirm that both emulators start and the UI reports Authentication and Firestore running.
2. Confirm Firestore client reads and writes are denied by the deny-all rules.
3. Test synthetic email/password account creation and sign-in against the Auth emulator.
4. Test the SID/staff-ID-to-internal-alias normalization helper with synthetic IDs.
5. Test server-side Firebase Admin SDK connectivity to the emulators using `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, and the matching demo project ID.
6. Add API authorization tests for roles, active status, class/subject scope, student ownership, lockout, result release, retakes and audit events.
7. Test ID allocation under concurrent requests; IDs must never duplicate or be reused.
8. Test deadline/assessment time-window calculations in `Asia/Karachi`.
9. Test attendance correction history, notice permissions and technical exception audit history.
10. Test encrypted backup/restore with synthetic records only.

The emulator is a development/test tool. Passing emulator tests does not by itself prove behaviour or limits in a live Firebase project.

## 6. Separate live test-project compatibility check

A separate Firebase test project will be needed only for checks that the emulator cannot prove, especially whether live Firebase Authentication accepts the approved `stemacademy.edu.pk` domain for email/password account creation and sign-in.

Before creating that project:
- use a clearly named non-production project;
- use no real student or staff data;
- do not add billing or upgrade from Spark;
- enable only Authentication email/password and Cloud Firestore if/when needed;
- do not deploy the application or publish real user access;
- never share service-account private keys or passwords in chat or GitHub.

Test at least one synthetic student alias such as `sa-2026-001@stemacademy.edu.pk` and a synthetic staff alias such as `sa-tch-001@stemacademy.edu.pk`. Record the exact outcome. If Firebase rejects the domain, stop and return to design review. Do not assume that domain registration or local emulator acceptance proves live Firebase acceptance. Do not assume that email delivery or mailbox services are configured.

## 7. Current blockers before real student data

- Prove live Firebase `stemacademy.edu.pk` alias compatibility with synthetic accounts.
- Implement and test server-side role/scope/ownership authorization.
- Implement lockout and a practical no-cost rate-limiting strategy.
- Implement transaction-safe permanent student and staff ID allocation.
- Complete secure temporary-password handoff and owner-verified administrator recovery rehearsal.
- Complete assessment timing, assignment deadlines and technical-exception handling.
- Complete encrypted export and successful restore rehearsal.
- Verify Firestore queries/indexes against actual API use.
- Verify AJK Board Physics syllabus content against an authoritative curriculum source.
- Verify Netlify Free eligibility, Node runtime and current limits before any non-production hosting deployment.

## 8. Explicit exclusions

No production Firebase project, production database, real student accounts, real student records, billing account, paid upgrade, Cloud Functions, scheduled jobs, background workers, email delivery, SMS, WhatsApp, file uploads or public deployment is authorized by this test-stage plan.

**Next milestone:** run the local Authentication and Firestore emulators using the demo project ID, then implement and test the first isolated Firebase integration against synthetic data.


## 5A. Firebase Admin emulator smoke test

The backend now supports an explicit, isolated emulator configuration. When either emulator host variable is set, both Auth and Firestore hosts must be present and the project ID must begin with `demo-`. In this mode the Admin SDK initializes without a service-account key. It does not fall back to live credentials.

After the emulators are running in one PowerShell window, open a second PowerShell window in the project root. Install the project dependencies if they are not already installed:

```powershell
npm install
```

Then configure only the local demo project in that second window:

```powershell
$env:FIREBASE_ADMIN_PROJECT_ID = "demo-stem-academy"
$env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
node --test tests/firebase/emulator-smoke.test.mjs
```

The smoke test creates one synthetic Auth user and one temporary Firestore document, verifies both, then deletes them. It uses a reserved example.test address, not a real person or a student alias. The test is skipped when the three emulator environment settings are not present. Do not add these local environment variables or any credentials to GitHub.
