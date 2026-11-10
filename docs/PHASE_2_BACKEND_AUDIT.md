# STEM Academy — Phase 2 Backend and Authentication Audit

**Status:** Core API hardening completed; feature APIs remain unimplemented.

## Active API contract

The active Netlify function is `netlify/functions/api.mjs`. It currently exposes:

- `GET /api/health` — public health check; does not initialize Firebase.
- `GET /api/me` — verifies a Firebase ID token (including revocation check), then loads the trusted `users/{uid}` record and requires `active: true` and a supported role.
- `GET /api/classes` — returns active classes scoped to the authenticated role.
- `GET /api/classes/{classId}/subjects/{subjectId}` — checks exact teacher/class/subject assignment or student class access before returning an allowlisted response.

The `/api/v1/...` prefix is accepted as an alias.

## Phase 2 changes

1. Firebase Admin SDK initialization is lazy for protected requests. Public health checks and unknown-route tests do not need Firebase credentials or the Admin SDK installed at module-load time.
2. `/api/me` now returns `405 METHOD_NOT_ALLOWED` for methods other than GET.
3. Removed five disconnected legacy route modules. They imported missing exports (`db`, `sendSuccess`, `requirePermission`, `allocateId`) and a nonexistent `audit.mjs`, and were not registered by the active API. Keeping them in the deployed source tree would falsely imply those features worked. Their feature APIs must be implemented against the active Request/Response API and role-scope model in later phases.
4. The trusted Firestore user record, not Firebase custom claims or browser input, remains the source of application role and active status.

## Important remaining gaps

- No server-side account provisioning endpoint exists. The ID allocator is not connected to account creation.
- No password reset or account recovery workflow has been implemented.
- Classes are the only implemented academic data API. Assignments, assessments, attendance, subjects, communication, audit logging, profile/settings, and student submissions are not production APIs yet.
- Emulator integration tests have not run in this environment.
- Firestore browser rules intentionally deny all direct client access. All data access must go through reviewed server endpoints.

## Deployment decision

**Not ready for production.** Do not create real student/staff accounts or connect real student data until account provisioning, feature APIs, emulator security tests, and recovery/backup workflows are implemented and verified.
