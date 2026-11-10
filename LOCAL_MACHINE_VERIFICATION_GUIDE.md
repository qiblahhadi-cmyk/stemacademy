# STEM Academy LMS — Final Local Verification Guide (Windows PowerShell)

**Applies to:** this Phase 7 source snapshot, including the new ChitChat module and DASH-09.
**Current verdict:** NOT READY FOR PILOT until every required local gate below has real evidence.
**Safety:** use only the `demo-stem-academy` Firebase Auth/Firestore emulators and synthetic accounts. Never configure a production project, deploy, or enter real student/staff data during these tests.

## Before starting — prerequisites

- Windows 10/11, PowerShell, Node.js `22.13.0` or later, npm, Java/JDK 21 or later.
- Internet access to the npm registry for dependency installation and pinned `npx` CLI downloads.
- Chrome or Edge for the browser walkthrough.
- Extract the complete project ZIP and open PowerShell in the project root (the folder containing `package.json`).
- Do not share `.env`, generated passwords, ID tokens, cookies, API keys, private keys, service-account files or screenshots containing them.

Create a local log folder and verify the tools:

```powershell
New-Item -ItemType Directory -Force logs | Out-Null
node -v
npm.cmd -v
java -version
```

**Expected:** Node `v22.13.0` or later, npm available, Java 21+.
**Common failures:** `node`/`npm.cmd` not recognised; old Node; Java missing.
**If it fails, send:** the three version command outputs and the exact error text (no secrets).

## 1. Clean dependency installation

**Prerequisites:** internet access, supported Node/npm, project root. The supplied lockfile is currently known to be incomplete; do not skip the lockfile repair step.

```powershell
npm.cmd install --no-audit --no-fund *> logs\install-lockfile.log
$installExit = $LASTEXITCODE
"install exit=$installExit"
node scripts/verify-lockfile.mjs *> logs\lockfile-after-install.log
$lockExit = $LASTEXITCODE
"lockfile verification exit=$lockExit"
Get-Content logs\lockfile-after-install.log
if ($installExit -ne 0 -or $lockExit -ne 0) { throw "Dependency/lockfile preparation failed. Review logs before continuing." }
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
npm.cmd ci --no-audit --no-fund *> logs\ci-clean.log
$ciExit = $LASTEXITCODE
"clean npm ci exit=$ciExit"
Get-Content logs\ci-clean.log -Tail 30
```

**Expected success:** `npm install` exits 0; lockfile verifier says consistent; clean `npm ci` exits 0 and installs the declared dependencies from the generated lockfile.
**Common failures:** `ERESOLVE`, `ETIMEDOUT`, `EAI_AGAIN`, `ENOTFOUND`, integrity mismatch, missing optional native build, lockfile still missing `esbuild`/`firebase`. Do not manually invent lockfile entries.
**If it fails, send:** `logs\install-lockfile.log`, `logs\lockfile-after-install.log`, `logs\ci-clean.log` (last 40 lines), `node -v`, `npm.cmd -v`. Do not send `.env` or credentials.

## 2. Lockfile verification

**Prerequisites:** step 1 completed and `package-lock.json` saved. This is a separate explicit release gate.

```powershell
npm.cmd run verify:lockfile *> logs\lockfile-final.log
$exit = $LASTEXITCODE
"lockfile verifier exit=$exit"
Get-Content logs\lockfile-final.log
```

**Expected success:** exit 0 and `package-lock.json is consistent with package.json.` Both `esbuild` and `firebase` must have resolved/integrity entries.
**Common failures:** missing root dependency range, missing package entry, absent `resolved` or `integrity`.
**If it fails, send:** full `logs\lockfile-final.log` and the `dependencies`/`devDependencies` sections of `package.json`; do not send `.env`.

## 3. Full offline/unit/static test suite

**Prerequisites:** clean `npm ci` succeeded.

```powershell
npm.cmd test *> logs\unit-tests.log
$testExit = $LASTEXITCODE
npm.cmd run check *> logs\check.log
$checkExit = $LASTEXITCODE
"npm test exit=$testExit; npm run check exit=$checkExit"
Select-String -Path logs\unit-tests.log,logs\check.log -Pattern "^(not ok|# tests |# pass |# fail |# skipped |# cancelled)"
```

**Expected success:** both exit 0; `# fail 0`. Without emulators, 16 emulator-conditional tests may remain skipped; they are not passed. With the emulator suite later enabled, unexplained skips are not acceptable.
**Common failures:** `not ok`, syntax error, missing package, unexpected skip count, or changed test totals.
**If it fails, send:** failing `not ok` blocks, summary lines, and the last 50 lines of the relevant log. Never send tokens/passwords.

## 4. Firebase emulator startup and endpoint verification

**Prerequisites:** Java 21+, step 1 dependencies installed, internet access for the pinned Firebase CLI on first use. Use the project wrapper; do not run a globally installed Firebase CLI against a live project.

**Do not create a repository-root `.env` for emulator variables.** The supported `npm.cmd run` emulator commands use `scripts/run-emulator-command.mjs`, which injects `127.0.0.1:9099`, `127.0.0.1:8080`, and `demo-stem-academy`, then validates the local-only configuration before launching the child process. Do not invoke the underlying Firebase CLI directly.

Terminal 1 — start emulators and leave this terminal open:

```powershell
npm.cmd run emulators
```

Terminal 2 — verify the configured loopback ports:

```powershell
Test-NetConnection -ComputerName 127.0.0.1 -Port 9099
Test-NetConnection -ComputerName 127.0.0.1 -Port 8080
Test-NetConnection -ComputerName 127.0.0.1 -Port 4000
```

**Expected:** Auth `9099` and Firestore `8080` report `TcpTestSucceeded : True`; emulator UI `4000` should be true when enabled. Firebase Emulator UI is normally at `http://127.0.0.1:4000`.
**Common failures:** Java runtime error, port already in use, Firebase CLI download error, guard rejection for non-loopback host or non-demo project. Do not change the guard to accept a remote host.
**If it fails, send:** emulator terminal error text, `Test-NetConnection` results, Node/npm/Java versions. Do not send `.env` contents.

## 5. Emulator-specific test suite

**Prerequisites:** terminal 1 emulators running and step 1 clean install complete. The command wrapper supplies the local emulator environment; no root `.env` file is required.

In another terminal:

```powershell
npm.cmd run test:emulator *> logs\emulator-suite.log
$exit = $LASTEXITCODE
"emulator suite exit=$exit"
Select-String -Path logs\emulator-suite.log -Pattern "^(not ok|# tests |# pass |# fail |# skipped |# cancelled)"
```

**Expected:** exit 0, `# fail 0`, and no unexplained skipped emulator tests. The emulator suite must not contact production Firebase.
**Common failures:** Firebase CLI download/launch error, Auth/Firestore connection refused, index-required error, transaction race failure, `not ok`, or tests still skipped because emulator variables were not passed.
**If it fails, send:** `not ok` blocks, test summary, first 40 and last 60 lines of `logs\emulator-suite.log`. Do not share passwords or tokens.

## 6. Production-route race tests (emulator only)

**Prerequisites:** emulators running and step 5 dependencies available. The word “production-route” means the real application route handlers, not production services; the test must use only the `demo-stem-academy` emulators.

```powershell
node scripts/run-emulator-command.mjs firebase emulators:exec --project demo-stem-academy --only auth,firestore "node --test tests/firebase/production-route-races-emulator.test.mjs" *> logs\route-races.log
$exit = $LASTEXITCODE
"race test exit=$exit"
Select-String -Path logs\route-races.log -Pattern "^(not )?ok|# tests |# pass |# fail |# skipped"
```

**Expected:** five passing route-level race tests: attendance mark, attendance correction, assignment create, assignment publish, assessment attempt start. No skipped race test.
**Common failures:** `not ok`, `# SKIP`, a non-demo project, emulator connection failure or a final Firestore state that contradicts the denied response.
**If it fails, send:** complete `logs\route-races.log` (redact any accidental credentials; do not send tokens).

## 7. Emulator client build

**Prerequisites:** step 1 succeeded and `esbuild` is installed. The command wrapper supplies the local emulator environment; no root `.env` file is required.

```powershell
npm.cmd run build:client:emulator *> logs\client-build.log
$exit = $LASTEXITCODE
"emulator client build exit=$exit"
Get-ChildItem public\assets\js\bundles
```

**Expected:** exit 0; `login.js` and `session.js` exist in `public\assets\js\bundles`. This bundle must point only to the demo emulator configuration.
**Common failures:** `ERR_MODULE_NOT_FOUND: esbuild`, emulator guard rejection, build syntax error.
**If it fails, send:** `logs\client-build.log` and the filenames in `public\assets\js\bundles` (never `.env`).

## 8. Authenticated browser walkthrough (admin, teacher, student)

**Prerequisites:** steps 4 and 7 succeeded; Chrome/Edge installed. Use synthetic data only.

Terminal 2 — seed the emulator:

```powershell
npm.cmd run seed:emulator *> logs\seed.log
$seedExit = $LASTEXITCODE
"seed exit=$seedExit"
Get-Content logs\seed.log
```

The seed script creates synthetic roles for `SA-ADM-001`, `SA-TCH-001`, `SA-2026-001` and `SA-2026-002`, plus Grade 9 A and AJK Physics. Passwords are generated per run and printed once. Use them locally; never paste them into chat or save them in a report.

Terminal 3 — start local Netlify development:

```powershell
npm.cmd run dev *> logs\netlify-dev.log
```

Open `http://localhost:8888/login.html`. Complete the walkthrough and record PASS/FAIL in a local copy of `BROWSER_WALKTHROUGH.md`.

**Existing LMS checks:** login/logout, role navigation, class scope, admin account staging and first-password gate, assignment publish/submission privacy, quiz answer-key isolation, single attempt/approved retake, assessment result release, attendance marking/correction/history, notice visibility after class deactivation and activity-log restrictions.

**ChitChat checks:**

1. Admin: select Grade 9 A, send a message, reply, edit within 10 minutes, inspect history, soft-delete, review a report, resolve/dismiss it.
2. Teacher: confirm only assigned active classes are selectable; send/reply; review reports and moderate in assigned scope; attempt another class URL and confirm denial.
3. Student Amina: send/reply, edit own message, report a message; confirm there is no staff report/moderation control.
4. Student Bilal: confirm he cannot edit/delete/moderate Amina's message; read the conversation and verify his read receipt does not alter Amina's state.
5. Read isolation: send a message from one account; confirm each other class member has their own unread state; read it on one account and verify only that account's unread count changes.
6. Typing: type from one account and confirm another member sees a temporary typing indicator that expires.
7. Search/date/attachment: search within the latest 100 messages, check date separators and open a trusted HTTPS link; confirm no binary file-upload control exists.
8. DASH-09: confirm admin/teacher/student dashboard unread metrics are scoped to their active classes and are bounded to the latest 500 messages/read receipts per class.
9. Polling: confirm messages refresh within the polling interval (about five seconds); do not report this as WebSocket/push real-time.

**Expected:** no console errors or 5xx responses; each role sees only authorised classes/messages; all expected controls work; no production Firebase network calls.
**Common failures:** blank page, missing bundles, failed login, permission denied in an allowed case, unauthorised data visible, console errors, 404/500 on ChitChat APIs, unread counts inconsistent.
**If it fails, send:** completed PASS/FAIL table, console/network error text, screenshots with tokens/credentials redacted. Never send the generated passwords, cookies, bearer tokens, `.env` or private keys.

## 9. Security and dependency audit

**Prerequisites:** internet access and successful dependency installation. Offline `npm audit` output is not acceptable evidence.

```powershell
npm.cmd audit *> logs\npm-audit.log
$auditExit = $LASTEXITCODE
npm.cmd audit --omit=dev --json > logs\npm-audit-production.json
$prodAuditExit = $LASTEXITCODE
"full audit exit=$auditExit; production audit exit=$prodAuditExit"
Get-Content logs\npm-audit.log -Tail 60
```

Also verify the static security/configuration suite:

```powershell
npm.cmd run check *> logs\security-static-check.log
$staticExit = $LASTEXITCODE
"static security check exit=$staticExit"
Get-Content logs\security-static-check.log -Tail 16
```

**Expected:** audit output is retrieved from the registry and reviewed by severity/package/path; `npm run check` exit 0. A non-zero npm audit due to advisories is a finding to triage, not a reason to force major upgrades. Confirm Firestore rules remain deny-all, emulator guard rejects remote hosts, and no secrets are committed.
**Common failures:** registry DNS/timeout, advisory output missing, `not ok`, secret-scan failure, rule/config test failure.
**If it fails, send:** audit severity summary, affected package names and dependency paths, static-check failure blocks. Do not send full environment dumps or secrets.

## 10. Final verification and hand-back

**Prerequisites:** steps 1–9 completed or each remaining blocker explicitly recorded.

```powershell
npm.cmd run verify:lockfile *> logs\final-lockfile.log
$lockExit = $LASTEXITCODE
npm.cmd run check *> logs\final-check.log
$checkExit = $LASTEXITCODE
npm.cmd run test:emulator *> logs\final-emulator.log
$emulatorExit = $LASTEXITCODE
"lockfile=$lockExit; check=$checkExit; emulator=$emulatorExit"
Select-String -Path logs\final-check.log,logs\final-emulator.log -Pattern "^(not ok|# tests |# pass |# fail |# skipped |# cancelled)"
```

Then confirm the browser walkthrough and audit results are recorded, and inspect the final issue register. Do not run deployment commands. Do not point the emulator wrapper at a live Firebase project. Keep `.env`, `node_modules`, emulator exports, generated passwords and logs containing sensitive data out of the project ZIP.

**Expected for pilot consideration:** lockfile verifier exit 0; clean `npm ci`; unit/static suite and emulator suite exit 0; no unexplained skips/failures; all five route race tests pass; emulator build succeeds; admin/teacher/student browser walkthroughs pass including ChitChat/DASH-09; registry-backed npm audit reviewed; no unresolved critical/high issues; index validation complete. Only then may the project be reassessed. This guide alone does not confer pilot readiness.

**If anything fails, send:** the relevant non-sensitive logs named above, exact command and exit code, and the PASS/FAIL checklist. Never share passwords, tokens, cookies, private keys, service-account JSON or `.env` contents.
