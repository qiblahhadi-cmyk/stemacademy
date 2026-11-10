# Pre-deployment audit and repair log

**Audit date:** 9 November 2026
**Scope:** Uploaded `stemacademy-main.zip` repository
**Result:** Not production-ready; Phases 1 and 2 core hardening completed, feature implementation and emulator verification remain.

## Phase 1 — Repository integrity and safe preview repairs

Completed in this repair pass:

- Restored the documented Firestore deny-all browser policy. The previous rules allowed authenticated users to create arbitrary user profiles, change their own role fields, and read/write ID counters. That was an account-escalation and data-integrity risk. Browser SDK reads and writes are now denied for every collection; server Admin SDK access must be protected by API authorization.
- Replaced the login-alias file's demo credentials and unrelated role-preview behavior with a pure, validated academy-ID-to-alias helper using the approved `stemacademy.edu.pk` domain. It does not create users, authenticate anyone, or prove live Firebase domain compatibility.
- Reconciled the API handler export and path normalization so the handler can be imported by tests and both `/api/...` and `/api/v1/...` route prefixes are normalized consistently.
- Replaced the stale API authorization test with tests for the authorization helpers that actually exist in the current backend.
- Replaced stale assessments, assignments and attendance controllers that targeted nonexistent legacy DOM IDs and API routes with browser-only preview controllers matching the current HTML. Entries remain temporary; these changes do not add database persistence.
- Removed the unused legacy `app.js` controller from the dashboard page rather than presenting its local-storage session behavior as real authentication; also removed its local-storage identity/token fallbacks and changed dynamic error rendering to safe `textContent`.
- Added baseline static-site security headers in `netlify.toml` (MIME sniffing, framing, referrer and browser-permission controls).
- Updated the README with the actual implementation/deployment boundary.

### Phase 1 checks

- `npm run check`: passed.
- Targeted tests for Firestore config, login alias conversion, current API authorization helpers and frontend static assets: 13 passed, 0 failed.
- JavaScript syntax checks covered by the frontend test: passed.

### Verification limitation

A clean `npm ci` could not complete in this environment before timeout. The installed dependency tree was incomplete, so the complete `npm test` suite could not be run reliably: Firebase Admin imports and `@firebase/rules-unit-testing` were unavailable. This is an environment/dependency-verification blocker, not a passing test result. Re-run `npm ci` in the project environment with working npm registry access, then run the full suite and Firebase emulator tests.

## Phase 2 — Backend and authentication core

Core hardening completed in this pass:

- Kept the active API contract explicit: public `GET /api/health`; protected `GET /api/me`; scoped `GET /api/classes`; and scoped `GET /api/classes/{classId}/subjects/{subjectId}`. Both `/api` and `/api/v1` prefixes are supported.
- Made Firebase Admin SDK loading lazy. Public health and unknown-route checks no longer require Firebase packages or secrets just to import the API handler.
- Added `405 METHOD_NOT_ALLOWED` for unsupported methods on `/api/me`.
- Confirmed that protected requests verify Firebase ID tokens with revocation checking, then trust only the active `users/{uid}` Firestore record for role and display name.
- Removed five disconnected legacy route modules that imported nonexistent exports and a missing audit module. They were not registered in the active API and could not work. Their features must be reimplemented against the current API contract rather than patched into an incompatible router.
- Replaced outdated Firestore authorization tests that contradicted the approved deny-all client-rules architecture with tests that enforce deny-all rules.
- Added a phase-specific backend audit at `docs/PHASE_2_BACKEND_AUDIT.md`.

### Phase 2 checks

- `npm test`: 19 passed, 0 failed, 4 skipped. The skipped tests require running Firebase Auth and Firestore emulators.
- `npm run check`: passed (4 frontend/static checks plus configured syntax checks).
- Relative-import audit across `.mjs` files: passed; no missing local imports remain.
- `npm ci` timed out in this environment. The above non-emulator tests pass because Firebase Admin is now loaded only when a protected Firebase operation is actually invoked. Emulator integration remains unverified.

### Phase 2 still outstanding

1. Implement account provisioning and Firebase Authentication integration for admin, teacher and student roles. No self-registration; no client-controlled role assignment.
2. Implement the complete server API for subjects, teaching assignments, assignments, submissions, assessments, results, attendance, notices, profiles, settings and audit records according to the approved role/permission matrix.
3. Implement account lockout after five failed attempts for 15 minutes, administrator unlock workflow, rate limiting, secure password reset and account recovery.
4. Connect permanent ID allocation to protected account-creation transactions and test concurrent allocation.
5. Validate all request bodies and identifiers; add request-size limits and append-only audit logging. Do not trust arbitrary object spreads from request bodies.
6. Add automated tests for each endpoint's allowed and denied roles, ownership boundaries, inactive users, malformed input and failure paths.

## Phase 3 — Firebase test-stage proof

Not completed. Use only `demo-stem-academy`, local emulators and synthetic data first. Then, only if authorized, use a separate non-production Firebase project for the synthetic `stemacademy.edu.pk` alias compatibility check. Keep browser Firestore rules deny-all. Verify Admin SDK configuration, indexes, Auth account creation/sign-in, and all authorization tests. No production Firebase project or real learner data is authorized by this audit.

## Phase 4 — Approved academic workflows and data safety

Not completed. Implement and test the approved policies for deadline enforcement in `Asia/Karachi`, assessment open/close windows, retake approvals, attendance correction history, class-scoped notices, technical-issue exceptions, append-only audit events, and encrypted backup/restore. Confirm restoration using synthetic records. Verify the AJK Board Physics curriculum against authoritative materials; current page examples are illustrative only.

## Phase 5 — Deployment readiness

Not completed. Before even a non-production deployment, verify the exact Node runtime, Netlify function bundling and routing, Firebase Admin secrets, environment separation, headers, logs, cold starts, quotas and rollback. Test a non-production Netlify site against a separate test Firebase project. Do not add billing or permit automatic paid upgrades. Confirm free-tier limits and safe behavior at quota exhaustion.

## Final decision

**Do not deploy this ZIP as a production LMS.** Phase 1 repairs improve the safety and consistency of the preview and repository foundation, but the application is still not a complete authenticated, persistent LMS. Proceed to Phase 3 using the local Firebase emulators and synthetic data. Do not connect production Firebase or real learner records yet.
