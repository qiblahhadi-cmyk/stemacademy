# STEM Academy LMS — Phase 7 Final Audit Report

**Audit date:** 10 November 2026
**Audited artifact:** `STEM_Academy_Phase6_Phase5_Corrected.zip`
**Audit mode:** Read-only source inspection and local automated checks
**Decision:** **NOT READY** for a controlled pilot

---

## 1. Executive summary

The supplied ZIP is a valid, 162-file source snapshot. It includes the application source, Netlify functions, Firebase rules/configuration, documentation, lockfile and automated tests. The archive passes `unzip -t` integrity validation.

The current automated suite was independently executed:

- `npm test`: **329 total, 318 passed, 0 failed, 11 skipped**.
- `npm run check`: **passed**, including its syntax checks and the same full test suite.
- The 11 skipped tests were not counted as passes.

The source contains substantial implemented functionality: server-authoritative role checks, deny-all browser Firestore rules, administrator provisioning, membership history, role-scoped APIs, transaction-bound authorization, assessment answer-key separation, student-only attendance history, curriculum draft/verification/publication states, and text-only assignment submissions.

However, the operational acceptance requirements remain unmet:

1. Firebase Emulator tests did not run: `firebase: not found` (exit 127).
2. The emulator client bundle did not build: `esbuild` is not installed.
3. A clean `npm ci --no-audit --no-fund` attempt timed out in this audit environment. The supplied project documentation also records two previous timed-out attempts.
4. The authenticated administrator/teacher/student browser walkthrough was not run.
5. The online npm advisory audit could not reach `registry.npmjs.org` (`EAI_AGAIN`); dependency vulnerability status is therefore unknown.
6. The emulator safety guard accepts arbitrary non-local hostnames when the project ID starts with `demo-`. This contradicts the documented local-only boundary and requires correction.
7. The lockfile does not include `firebase-tools` or `netlify-cli`, although project scripts require the `firebase` and `netlify` executables. A clean `npm ci` therefore does not install the full documented test/development toolchain.

No production Firebase project was configured or contacted, no deployment was attempted, and no real student/staff data was used.

**Conclusion:** The source and fake/in-process test evidence are encouraging, but the emulator, browser, dependency and isolation acceptance gates are incomplete. The emulator-host guard defect is a release blocker. Do not pilot or deploy this snapshot yet.

## 2. Scope, artifacts and evidence limitations

### Supplied artifacts

- `STEM_Academy_Phase6_Phase5_Corrected.zip`
- Standalone `BROWSER_WALKTHROUGH.md`
- Phase 7 implementation/test summaries supplied in the conversation

### Archive inspection

- ZIP integrity: passed (`unzip -t`, no compressed-data errors).
- Extracted file count: 162.
- Includes: `package.json`, `package-lock.json`, `firestore.rules`, `firebase.json`, `netlify.toml`, Netlify API/routes, browser source/assets, test suites, scripts and project documentation.
- No `node_modules`, built `public/assets/js/bundles/session.js`, `.env`, service-account key or production credential file was present in the archive.

### Missing comparison material

The original baseline ZIP and separate earlier phase ZIPs were not available among the attachments accessible for this audit. Consequently, an actual file-by-file original-versus-final diff cannot be produced. The supplied changelog, phase reports and manifest were read as documentation, not treated as proof that every historical change is correct. No claim is made that no previously working feature was removed.

### Verification labels

- **PASS:** supported by direct source inspection or a successfully executed automated test.
- **PARTIAL:** source implementation/test evidence exists, but required operational or end-to-end proof is incomplete.
- **FAIL:** a concrete defect or unmet required condition was observed.
- **NOT VERIFIED:** the relevant test or evidence could not be obtained.

A source-level PASS is not equivalent to browser or real-emulator verification.

## 3. Test execution and results

### Commands executed

| Command | Actual outcome | Evidence |
|---|---|---|
| `npm test` | PASS — 329 total, 318 passed, 0 failed, 11 skipped | Fresh Node test-runner output |
| `npm run check` | PASS — syntax checks and same test suite | Fresh command exit 0 |
| `npm run test:emulator` | FAIL to start — exit 127, `firebase: not found` | Fresh command output |
| `npm run build:client:emulator` | FAIL — `ERR_MODULE_NOT_FOUND: esbuild` | Fresh command output |
| `npm ci --no-audit --no-fund` | Timed out in audit environment | Fresh command exceeded 120-second execution window; earlier project docs record two timeouts |
| `npm audit --json` | NOT VERIFIED — registry DNS `EAI_AGAIN` | Fresh npm error |
| Browser walkthrough | NOT RUN | No emulator, built client bundle or authenticated browser session |

An offline `npm audit --offline --json` returned an empty vulnerability object from the local npm cache. This is not accepted as an authoritative security audit and is not evidence that the dependencies have zero vulnerabilities.

### Test-category breakdown

The directory-level runs below total 329 cases. API/security checks overlap conceptually; security is not an additional count on top of the listed categories.

| Test category | Total | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| API / fake-Firestore logic (`tests/api`) | 239 | 239 | 0 | 0 |
| Firebase integration/config/auth (`tests/firebase`) | 31 | 20 | 0 | 11 |
| Frontend / UI / navigation (`tests/frontend`) | 55 | 55 | 0 | 0 |
| Tooling guards (`tests/scripts`) | 4 | 4 | 0 | 0 |
| **Total** | **329** | **318** | **0** | **11** |

### Skipped tests

The 11 skipped cases are:

1. API authentication against Firebase emulator.
2. Five real Firestore authorization-race tests: teaching-assignment revocation, teacher membership revocation, class deactivation, subject deactivation, and student membership revocation.
3. Classes-list API against Firebase emulator.
4. Firebase Auth/Firestore emulator smoke connection.
5. Auth emulator sign-in and Admin token verification.
6. Firestore emulator denial of direct browser reads/writes.
7. Transaction-safe ID allocation against emulator.

These were skipped because emulator hosts were not configured. They are outstanding, not passing tests.

### Test-count discrepancy: 306 versus 329

The supplied Phase 4 report records 306 total tests, 295 passed and 11 skipped. The current ZIP records 329 total tests, 318 passed and 11 skipped.

The difference is exactly **23 additional tests**, matching the three Phase 5 suites:

- `tests/api/phase5-curriculum.test.mjs`: 8 tests.
- `tests/api/phase5-submissions.test.mjs`: 12 tests.
- `tests/api/phase5-routing.test.mjs`: 3 tests.

Those 23 tests passed in the fresh run. This explains the increase; it is not an unexplained discrepancy. The historical 210/224 figures mentioned in older planning material belong to earlier project snapshots and cannot be compared as if they were the current Phase 4/5 test baseline. The current Phase 4-to-current comparison is 306 to 329.

## 4. Module-by-module verification

| Area | Status | Findings |
|---|---|---|
| Authentication and token validation | PARTIAL | Middleware verifies Firebase ID tokens with revocation checking and reads trusted role/active state from `users/{uid}`. Automated auth tests pass. Emulator token verification and browser login remain unverified. |
| Logout and session handling | PARTIAL | Session code uses browser-session persistence, token refresh on 401, sign-out and session redirect logic. UI/browser execution not performed. |
| Role-based navigation and protected pages | PARTIAL | `nav-policy.js` defines role policies; session entry fetches the server role and blocks disallowed pages. Frontend tests pass. A browser walkthrough is still required. |
| Academy ID/login aliases | PARTIAL | Alias handling and ID allocation source/tests are present. Emulator compatibility and end-to-end login were not verified. |
| Inactive accounts | PASS (source/tests) | Middleware rejects inactive profiles; deactivation attempts to disable Firebase Auth as defense in depth. Live emulator workflow not verified. |
| Forced password change | PARTIAL | Owner-issued custom claim, bootstrap-only route and password update flow are implemented and unit-tested. Actual Auth emulator/owner handoff was not tested. |
| Dashboard | PARTIAL | Role-specific backend metrics are derived from Firestore, not fixed sample figures. Browser loading, empty states and real data presentation were not tested. Several queries have fixed result limits, so larger datasets require pagination/aggregation review. |
| Classes and People | PARTIAL | Backend roster and people-management routes use active records and role/scope checks. UI tests detect removal of fabricated teacher panels and fixed counts. Real roster/browser behavior remains unverified. |
| Membership administration | PARTIAL | Canonical membership IDs, transaction-based enrollment/deactivation/reactivation, history and audit writes are implemented. No real-emulator concurrency or browser test ran. |
| Teacher assignment management | PARTIAL | Active teacher/class/subject checks and deterministic assignment IDs are present. Revocation logic is covered by fake tests and generic emulator helper tests, but not by route-level emulator tests. |
| Subjects and curriculum | PARTIAL | Separate chapter/topic records, draft/unverified defaults, source attribution, verification and publication gates exist. No official AJK syllabus was supplied or seeded. The verification action records an administrator attestation; it does not independently authenticate the source document. |
| Course Hub restriction | PARTIAL | `course-hub.html` is excluded for all roles in `PAGE_POLICY` and the protected page loads the session bundle. Its contents remain illustrative/sample data. Browser enforcement was not exercised. |
| Assignments lifecycle | PARTIAL | Draft → published → closed, immutable scope, teacher assignment checks and audit writes are implemented. Fake-Firestore tests pass; emulator/browser lifecycle not verified. |
| Assignment submissions | PARTIAL | Text-only student submissions, revision history, resubmission cutoff, teacher review and percentage grading are implemented and Phase 5 tests pass. File uploads and per-assignment rubrics/max-score configuration are not implemented, as documented. |
| Assessments | PARTIAL | MCQ question/answer separation, server-side scoring, one initial attempt, teacher-approved retake, reopen, approval and release states are present in source. Emulator transaction and browser flows remain unverified. |
| Attendance | PARTIAL | Staff roster/mark/correct routes and student-only `/attendance/mine` derive student identity from the verified session. Cursor ownership checks and correction history exist. Emulator and browser checks remain pending. |
| Communication/notices | PARTIAL | Academy/class scope, priority values, edit and soft deactivation with audit writes are implemented. A source-level stale-scope issue is detailed in Finding F-03 below. Browser visibility/filtering remains unverified. |
| Activity logs | PARTIAL | Admin-only API reads persistent `auditLogs`, with pagination/filtering and allowlisted output. Browser behavior and real dataset pagination were not exercised. |
| Profile | PASS (source/tests) | Self-service update accepts only `displayName`; UID comes from the authenticated session and the mutation is audited. |
| Settings / Role Preview | PARTIAL | Role Preview is a design preview, not a permission-changing control; the page is admin-only. Actual browser behavior not verified. |

## 5. Security audit

### Protections confirmed by source inspection

| Security requirement | Status | Evidence / limitation |
|---|---|---|
| Browser Firestore reads/writes denied | PASS (source) | `firestore.rules` denies all reads and writes. Emulator rule test is skipped, so deployed/emulator enforcement was not exercised. |
| API authentication required | PASS (source/tests) | Protected API routes call `authenticate`; token verification uses Firebase Admin. Emulator token test skipped. |
| Server-side roles | PASS (source/tests) | Role comes from trusted Firestore profile, not request payload. |
| Inactive-account restriction | PASS (source/tests) | Middleware requires `active === true`, except the constrained password-change bootstrap state. |
| Student record ownership | PASS (source/tests) | Student attendance UID comes from session; submission IDs derive from assignment ID and authenticated UID. |
| Teacher class/subject scope | PASS (source/tests) | Exact active teaching assignments and membership are checked. Real-emulator route behavior remains unverified. |
| Administrator access | PARTIAL | Admin routes enforce `role === admin`; no authenticated browser walkthrough. |
| Protected identity fields | PASS (source/tests) | Self-profile route only allows `displayName`; admin validation protects role and permanent Academy ID from ordinary edits. |
| Same-404 protections | PARTIAL | Assignment and selected scoped routes map missing/out-of-scope records to the same not-found response. This behavior is not proven consistently for every route/resource. |
| Audit record integrity | PARTIAL | Browser Firestore writes are denied and API writes are append-only in reviewed routes. Admin SDK credentials inherently bypass rules; there is no emulator proof or independent immutable storage control. |
| Secret exposure | PASS (static scan) | No `.env`, private key or service-account credential found in the ZIP. Password-like literals found were test/demo values or variable names. |
| Course Hub blocked | PARTIAL | Role policy denies all roles and the page loads session guard; not browser-tested. |
| Emulator-only boundary | FAIL | Emulator guard accepts non-loopback hosts; see F-01. |

### Finding F-01 — Emulator safety guard accepts remote endpoints

**Severity: HIGH — release blocker**
**Status: FAIL**

` scripts/emulator-guard.mjs` defines `EMULATOR_AUTH_HOST = "127.0.0.1:9099"` and `EMULATOR_FIRESTORE_HOST = "127.0.0.1:8080"`, but `assertEmulatorEnv()` does not compare configured hosts with those loopback addresses. It checks only that both variables are non-empty and the project ID starts with `demo-`.

I directly invoked the function with:

- `FIREBASE_AUTH_EMULATOR_HOST=auth.example.net:9099`
- `FIRESTORE_EMULATOR_HOST=firestore.example.net:8080`
- `FIREBASE_ADMIN_PROJECT_ID=demo-stem-academy`

The guard accepted the configuration. `resolveFirebaseConfig()` also returned emulator mode for the same non-local hosts.

This does not prove a production Firebase connection occurred. It proves that the code does not enforce the documented local-only host requirement. A remote endpoint could be contacted if such values are configured, contrary to the strict local-emulator boundary.

**Required remediation:** enforce loopback-only hostnames/addresses (including an explicit policy for `localhost` if desired), reject all other hosts, and add negative tests for remote hostnames, public IPs, IPv6/non-loopback addresses and malformed host values. Run those tests before any emulator workflow.

### Finding F-02 — Emulator and local development CLIs are not pinned dependencies

**Severity: HIGH for reproducibility / MEDIUM operational risk**
**Status: FAIL**

`package.json` and `package-lock.json` include `firebase-admin`, `firebase` and `esbuild`, but do not include `firebase-tools` or `netlify-cli`. The scripts `test:emulator`, `emulators` and `dev` invoke `firebase` and `netlify` executables. A clean `npm ci` from the committed lockfile will not install those CLIs.

The docs explain a manual one-time install, but that install is not captured in the supplied lockfile. This makes the documented emulator and browser workflow non-reproducible from the delivered dependency manifest alone.

**Required remediation:** add approved/pinned CLI dev dependencies and update the lockfile, or provide a reproducible external tool installation step with explicit versions and verify it on a clean machine.

### Finding F-03 — Class notices can remain visible after class deactivation

**Severity: MEDIUM — scope correctness/privacy**
**Status: PARTIAL / defect identified by source inspection**

`visibleClassIds()` in `netlify/functions/lib/routes/notices.mjs` derives visible class IDs from active `classAccess` records. For students it does not confirm that the corresponding class is still active. For teachers it checks active class membership and teaching assignment, but `requireClassTeachingAssignment()` does not itself read the class record's active state. `visibleNotices()` then includes class notices based on those IDs without checking class activity.

The admin class deactivation path updates the class record but does not, in the reviewed code, cascade-deactivate all class memberships/teaching assignments. As a result, a user whose membership/assignment records remain active may continue seeing notices scoped to a deactivated class.

**Required remediation:** filter class visibility against active class records (and retain teacher assignment checks), or atomically deactivate/cascade the relevant access records with a carefully audited policy. Add student and teacher regression tests for deactivated classes.

### Additional security observations

- The API uses Firebase Admin SDK, which bypasses Firestore rules; correctness therefore depends on the route authorization layer. This architecture is documented and consistently used in the reviewed entry point.
- The audit log collection is protected from browser clients by deny-all rules. The application code writes append-only audit entries, but Admin SDK credentials remain privileged and are not constrained by Firestore rules.
- No CSP or HSTS header was observed in `netlify.toml`. This is a hardening recommendation, not the primary release blocker for the local pilot.
- Account deactivation and Auth disablement are separate operations; the code reports a synchronization failure if Auth status cannot be updated after the Firestore profile change. This requires an operational recovery procedure and emulator rehearsal.

## 6. Transaction and concurrency findings

### Implemented transaction pattern

`txAuthorizeScope()` reads the class, optional subject, canonical class membership and (for teachers) active teaching-assignment query through the Firestore transaction. The reviewed assignment create/update/publish/close, assessment create/update/transition/attempt, attendance mark/correct and notice create/update/deactivate paths use transaction-bound authorization or equivalent transaction reads.

The fake-Firestore protected-write tests pass. Five real-emulator tests are present, but were skipped.

### Coverage gaps

The five emulator race tests exercise `txAuthorizeScope()` followed by a synthetic write to `_authorizationRaceWrites`; they do not invoke each production route handler. The fake route-level race tests cover assignment creation and attendance marking for selected revocation cases.

| Requested race | Current evidence | Status |
|---|---|---|
| Membership deactivation during attendance marking | Fake test coverage is partial; generic emulator membership race only tests helper + dummy write | PARTIAL |
| Teaching assignment revocation during assignment creation/publication | Fake creation test and generic emulator helper test; no route-level emulator publication test | PARTIAL |
| Class deactivation during protected writes | Fake assignment creation tests and generic emulator helper test | PARTIAL |
| Subject deactivation during protected writes | Fake assignment creation tests and generic emulator helper test | PARTIAL |
| Membership deactivation during assessment attempts | Generic emulator student-membership helper test; no assessment route-level race | PARTIAL |
| Concurrent membership enrollment/deactivation | No dedicated race test identified | NOT VERIFIED |
| Concurrent attendance corrections | Transaction exists, but no dedicated concurrent-correction test identified | NOT VERIFIED |
| Concurrent assignment state transitions | Transaction reads stored assignment state, but no dedicated competing publish/close test identified | NOT VERIFIED |

**Required remediation/verification:** after fixing F-01 and installing the CLI, add route-level emulator tests for the listed operations. Assert both the returned response and final Firestore state. Include concurrent correction and publish/close cases. Do not infer route correctness solely from the generic helper test.

## 7. Browser walkthrough

**Status: NOT VERIFIED — not run.**

The standalone `BROWSER_WALKTHROUGH.md` explicitly says the walkthrough is pending and instructs use of Auth/Firestore emulators, `demo-stem-academy` and synthetic accounts. The in-ZIP checklist also remains unchecked.

No authenticated browser session was started, no administrator/teacher/student account was seeded, and no screenshots or PASS/FAIL interaction evidence were produced.

| Role | Required browser workflow | Status |
|---|---|---|
| Administrator | Login/logout, management, membership, class/subject, attendance, notices, logs, account activation | NOT VERIFIED |
| Teacher | Assigned class/subject access, roster, assignment/assessment, attendance, notices, submission review | NOT VERIFIED |
| Student | Own attendance, own assessments/attempts/results, own submissions, curriculum visibility, forbidden staff routes | NOT VERIFIED |

Automated frontend tests verify markup, link targets, navigation policy and selected UI logic. They are not a substitute for the requested authenticated browser walkthrough.

## 8. Dependencies, build and deployment review

| Item | Status | Finding |
|---|---|---|
| Node/npm compatibility | PASS | Audit runtime Node `v22.16.0`, npm `10.9.2`; project requires Node `>=22`. |
| `package.json` / lockfile | PARTIAL | Lockfile exists and is lockfile v3, but Firebase CLI and Netlify CLI are absent. |
| Clean dependency install | NOT VERIFIED | `npm ci` timed out; no complete `node_modules` installation resulted. |
| Emulator client build | FAIL in this environment | `esbuild` missing (`ERR_MODULE_NOT_FOUND`). |
| Firebase emulator runner | FAIL in this environment | `firebase` executable missing (exit 127). |
| Netlify local dev | NOT VERIFIED | `netlify-cli` is absent from lockfile; no local server started. |
| npm vulnerability audit | NOT VERIFIED | Registry DNS lookup failed; no current advisory report obtained. |
| Netlify config | PASS (inspection) | Build/publish/functions paths and API redirect are present. No deployment attempted. |
| Firebase config/rules | PARTIAL | Demo emulator ports and deny-all rules are configured. Loopback-only host enforcement is defective (F-01). |
| Production environment | NOT USED | No production variables, credentials or deployment used. |

No force upgrades or dependency changes were made.

## 9. Original-versus-final comparison

**Status: NOT VERIFIED.** The original baseline ZIP and prior phase ZIPs were not attached in the available materials. A reliable diff of added/removed/modified files, regression detection and proof that all previously working features were preserved is therefore unavailable.

The final archive itself contains the 162-file project snapshot and a Phase 6 file manifest. The manifest and changelog are useful navigation/evidence documents, but do not replace comparison against the actual baseline archive.

## 10. Remaining defects and remediation priorities

### P0 — Before any pilot or emulator execution

1. Fix emulator guard host validation (F-01). Reject all non-loopback emulator endpoints in both guard and server configuration; add negative tests.
2. Add/pin `firebase-tools` and `netlify-cli` (F-02), or document and lock exact external CLI versions. Ensure a clean install provisions every executable referenced by project scripts.
3. Re-run clean dependency install and inspect the resulting dependency tree. Obtain an online `npm audit` advisory report; investigate all high/critical findings before pilot.

### P1 — Before controlled pilot acceptance

4. Fix class notice visibility after class deactivation (F-03); add student and teacher regression tests.
5. Run Firebase Auth/Firestore emulators under the validated local-only configuration.
6. Add route-level emulator race tests for attendance marking/correction, assignment creation/publication, assessment attempts, membership changes and class/subject/assignment revocation.
7. Complete authenticated administrator, teacher and student browser walkthroughs. Record browser version, emulator project ID, each action, expected/actual result and screenshots.
8. Verify account provisioning, owner credential handoff, forced password change, deactivation and recovery entirely against synthetic emulator accounts.
9. Verify required Firestore composite indexes by executing the actual emulator-backed queries.

### P2 — Hardening and operational readiness

10. Add CSP and HSTS where appropriate for the eventual hosting environment.
11. Review pagination/limit behavior for dashboards, rosters, notices, memberships and audit logs under the expected growth profile.
12. Reconcile old membership records only through the documented demo-only migration procedure; do not run migration against production during this audit.
13. Supply and independently validate official AJK Board syllabus source material before any curriculum is marked verified/published. The current administrator attestation is not independent source authentication.

## 11. Pilot readiness decision

# NOT READY

The project is **not ready for a controlled pilot** based on the supplied acceptance criteria.

Reasons:

- A high-severity emulator isolation guard defect was demonstrated: non-local endpoints are accepted.
- Emulator tests and real transaction race tests did not execute.
- The authenticated three-role browser walkthrough did not execute.
- The emulator client bundle could not build because dependencies were not installed.
- The clean project lockfile omits required Firebase/Netlify CLI tools.
- Current dependency vulnerabilities could not be established because the online npm advisory endpoint was unreachable.
- A class-notice visibility issue remains when a class is deactivated without corresponding access records being deactivated.

This is not a statement that the entire application is defective. The source and automated test results show substantial progress. It is a statement that the required security and operational acceptance evidence is incomplete and at least one isolation control is demonstrably inadequate.

## 12. Audit safety statement

- Audit was read-only with respect to project source files.
- No source code, lockfile, Firebase rules or project configuration was changed.
- The audit report is a separate deliverable.
- No production Firebase project was configured or contacted.
- No live deployment was attempted.
- No real student/staff records or credentials were used.
- No destructive database operations were performed.
- No remediation has been implemented.

**Next authorization required:** approve a separate remediation stage for F-01 through F-03 and the missing reproducibility/test coverage work. The current report should remain the baseline audit record; fixes should be made in small, reviewable groups and retested before a new release ZIP is produced.
