# Local Firebase emulator setup

Everything here runs on your own machine against the Firebase emulators. No live Firebase project is used, and no credentials are needed.

## One-time setup

1. Install dependencies and commit the updated lockfile if it changes:
   ```
   npm install
   ```
2. The Firebase and Netlify CLIs are **not** installed into the project. The npm scripts run the pinned
   versions through `npx` (`firebase-tools@15.35.0`, `netlify-cli@27.16.3`), so the first run needs registry
   access. A JDK is required by the Firestore emulator (Java 21 or newer recommended). Do not add the CLIs
   with `npm install --save-dev`; that would change the audited dependency set.
3. Do **not** create a repository-root `.env` for emulator variables. The supported
   `npm run test:emulator`, `npm run emulators`, `npm run seed:emulator`, and
   `npm run build:client:emulator` commands use `scripts/run-emulator-command.mjs`,
   which injects the two loopback emulator hosts and `demo-stem-academy` project ID
   into the child process and validates them before launch. Keep any real credentials
   out of this workflow.

## Run the automated tests against the emulators

```
npm run test:emulator
```

This starts the Auth and Firestore emulators, runs the full suite (including all currently registered emulator-gated tests), and stops the emulators. The test count changes as the project evolves; use the actual TAP summary as the source of truth. A successful final emulator run should execute the emulator-gated tests rather than skip them.

## Browser walkthrough

Terminal 1, start the emulators and keep them running:
```
npm run emulators
```

Terminal 2, seed the emulators (run once after each emulator start, because the emulators start empty):
```
npm run seed:emulator
```
The script prints one generated password per account. They are not saved to disk; copy them before closing the terminal. Accounts: `SA-ADM-001` (administrator), `SA-TCH-001` (teacher), `SA-2026-001` and `SA-2026-002` (students).

Terminal 3, build the browser code against the emulator and start the site:
```
npm run dev
```
Open the URL that Netlify Dev prints (usually http://localhost:8888), then go to `/login.html`.

The Emulator UI is at http://127.0.0.1:4000 and shows the accounts, users and records as they change.

### Walkthrough checklist

1. **Sign-in and sign-out.** Sign in as the teacher, check the dashboard greeting, then sign out. Confirm you return to the login page.
2. **Blocked pages.** As a student, open `/attendance.html` directly. Expect the forbidden page. Sign in as a student and confirm Assessments in the sidebar opens `/my-assessments.html`.
3. **Attendance.** As the teacher, choose Grade 9 A and today's date, mark both students, then refresh the page. The statuses should persist. Correct one student with a reason and confirm the history shows the change.
4. **Assessment cycle.** As the teacher, open Assessments, choose Grade 9 A and Physics, create a quiz with two questions, and publish it. Sign in as a student, open the assessment, start it, and submit. Sign in as the teacher, open Results, review the answers, approve, and release. Sign in as the student and confirm the marks are visible.
5. **Administrator management.** As the seeded administrator, create a synthetic student and teacher, confirm both remain disabled/pending, create a class and same-grade subject, assign the teacher, enroll the student, then verify search, details, soft deactivation and reactivation.
6. **Account activation.** Using only the documented emulator-only owner handoff command and synthetic identity, issue a temporary credential, sign in, complete the forced password change, and confirm normal access is restored. Also confirm a pending account cannot use normal APIs before activation.
7. **Communication.** Create an academy-wide notice and a class notice as authorized staff; verify student scope, search/filter, edit and deactivation. Confirm no external messaging is triggered.

Report any step that fails with the page, the step number, and the message shown.

## Troubleshooting

- **"Set FIREBASE_AUTH_EMULATOR_HOST..."**: invoke the documented `npm run` wrapper
  rather than launching the underlying Firebase or Node command directly; the wrapper
  supplies and validates the local emulator environment.
- **Tests time out**: the emulators are not running. Start them with `npm run emulators` first, or use `npm run test:emulator`, which starts them for you.
- **Sign-in fails**: run `npm run seed:emulator` after the emulators start. A fresh emulator has no accounts.
- **Build error about configuration**: `npm run build:client` needs the four `PUBLIC_FIREBASE_*` values for a live build. For local work use `npm run dev`, which builds the emulator bundle instead.


## Phase 6 membership key migration

New synthetic seed memberships use the canonical SHA-256 document ID. For an emulator containing older arbitrary `classAccess` IDs, review and run `node scripts/migrate-class-access.mjs` only with the demo Auth and Firestore emulator hosts configured. See `docs/MEMBERSHIP_MIGRATION.md`. The migration has not been executed/verified in this workspace. Never run it against production during Phase 6.
