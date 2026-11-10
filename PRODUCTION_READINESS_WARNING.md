# PRODUCTION READINESS WARNING — NOT PRODUCTION VERIFIED

**Release status: NOT READY FOR REAL-DATA PRODUCTION DEPLOYMENT.**

This archive is a complete Phase 7 source/checkpoint package for continued verification. Creating or downloading this ZIP does **not** certify the application as secure, operationally complete, production-ready, or safe for real academy/student data.

Do not enter real student, parent, teacher, staff, attendance, assessment, grade, identity, or other personal data; do not provision real accounts; and do not connect this package to a production Firebase project until every critical gate below has been completed, documented, and independently reviewed.

## Verification evidence currently available

The latest Session 2 recorded results are:

- `npm test`: **PASS**, exit 0 — 370 tests total; 354 passed, 0 failed, 16 skipped, 0 cancelled.
- `npm run check`: **PASS**, exit 0 — same test totals; includes source syntax checks.
- Static security/configuration checks included in the suite: **PASS**. These include the deny-all Firestore browser/client rules, emulator demo/loopback guards, and checks for prohibited secret files in the source tree.
- JSON parsing for `package.json`, `package-lock.json`, `firebase.json`, and `firestore.indexes.json`: **PASS**.

These are source/offline checks only. They do not establish that the complete system works against Firebase, in a browser, or in production.

## Critical unresolved verification issues

1. **Dependency lockfile — FAILED / BLOCKER.** `package-lock.json` is inconsistent with `package.json`: root dependency ranges and package entries are missing for `esbuild@0.24.2` and `firebase@10.14.1`. Do not hand-insert package records or invent integrity hashes. Session 2 could not regenerate it because npm registry DNS failed (`EAI_AGAIN registry.npmjs.org`).
2. **Clean dependency installation — BLOCKED.** `npm ci` did not complete because the registry was unreachable. A reproducible clean install has not been demonstrated.
3. **Five membership-revocation route race tests — SKIPPED / NOT VERIFIED.** All five tests are present and registered, but the Session 2 direct invocation skipped all five because the Auth/Firestore emulator endpoints were unavailable. No passing race-test evidence exists in Session 2.
4. **Firebase Auth/Firestore emulator integration — BLOCKED.** The pinned Firebase CLI could not be fetched/launched in the available environment; the emulator suite did not complete. Firestore rules/index behaviour and transactional race behaviour therefore remain unverified against a real emulator.
5. **Emulator client build — BLOCKED.** `npm run build:client:emulator` failed because `esbuild` was not installed (`ERR_MODULE_NOT_FOUND`).
6. **Dependency vulnerability audit — BLOCKED / UNKNOWN.** Registry-backed `npm audit` could not reach the npm audit endpoint. Dependency vulnerability status is unknown; an empty/offline advisory response is not audit evidence.
7. **Authenticated browser walkthroughs — NOT EXECUTED.** Admin, teacher and student end-to-end flows, class isolation, account activation, assessments, attendance, ChitChat and DASH-09 have not been demonstrated in an authenticated browser session.
8. **Windows execution — NOT EXECUTED.** PowerShell and `cmd.exe` execution has not been verified on the target Windows environment. Unit tests for argument quoting are not a substitute for Windows execution.
9. **Security headers — PARTIAL.** Static Netlify configuration includes `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`. CSP and HSTS are not configured in `netlify.toml`; no live HTTPS headers have been verified. Do not add a restrictive CSP without reviewing actual script/style/connect requirements.
10. **Feature and operational limits remain.** ChitChat uses five-second polling, searches only the latest 100 messages, supports HTTPS attachment links rather than uploads, and has in-app unread counts but no push/email/SMS notifications. DASH-09 counts are bounded to recent records. Other scope gaps and pilot limitations are recorded in `PHASE7_FINAL_VERIFICATION_REPORT.md`, `ISSUE_REGISTER.md`, and the documentation under `docs/`.

The historical emulator result of 379 passed / 5 cancelled is historical only. It is not a current pass. The 16 skipped tests in the latest Session 2 suite must not be counted as passed.

## Required checklist before any real student data is entered

- [ ] Repair `package-lock.json` using a registry-enabled environment; inspect the diff and confirm `node scripts/verify-lockfile.mjs` exits 0.
- [ ] Prove a clean install with `npm ci --no-audit --no-fund` from a clean working tree.
- [ ] Run `npm test` and `npm run check`; investigate every failure and explain every skip.
- [ ] Run Firebase Auth and Firestore emulators only with the `demo-stem-academy` project and loopback hosts.
- [ ] Obtain five actual passing production-route membership-revocation race tests: attendance mark, attendance correction, assignment create, assignment publish, and assessment start. Zero skips, cancellations, or weakened assertions.
- [ ] Complete the full emulator suite, Firestore rules/permission checks, ChitChat query/index validation, and emulator client build.
- [ ] Complete authenticated admin, teacher, and student browser walkthroughs using synthetic data; verify role/class isolation and all critical workflows.
- [ ] Execute the supported npm scripts on the actual target Windows PowerShell/cmd environment and retain command output/exit codes.
- [ ] Run registry-backed full and production-only dependency audits; review and remediate or formally accept every advisory.
- [ ] Review CSP requirements; verify HTTPS security headers, HSTS and deployment configuration in an explicitly authorized non-production HTTPS preview.
- [ ] Complete a security/privacy review for real student data, account provisioning, access revocation, backups, retention, audit logging, incident response, and recovery.
- [ ] Obtain independent technical review and explicit owner approval before production Firebase setup, real account provisioning, real-data import, or deployment.

## Safe handling and deployment boundary

- Use synthetic data and the isolated `demo-stem-academy` emulators for testing.
- Never create a repository-root `.env` for emulator variables; use the project's guarded emulator scripts.
- Never commit or distribute credentials, tokens, service-account files, private keys, production `.env` files, or real student records.
- Do not run `firebase deploy`, change production Firebase rules/indexes/data, or deploy this project as part of this verification package.
- Do not push this package to GitHub without separate authorization.

**Final verdict: NOT READY FOR REAL-DATA PRODUCTION DEPLOYMENT.**
