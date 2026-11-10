# STEM Academy — Phase 4 Report: Assignment Module (Backend)

**Status:** Backend assignment workflow implemented and unit-tested. Phase 4 is **not complete**: emulator tests were not run, frontend integration is not done, and the remaining Phase 4 items are listed below.
**Safety:** Synthetic data only. No live Firebase project, deployment, or credential was used.

## 1. Starting point

The Phase 3 ZIP did not contain the partial Phase 4 edits described in the earlier log. Those edits existed only in a previous sandbox. They were reconstructed here, reviewed, and corrected rather than trusted as delivered.

Defects found in the partial work and fixed:

1. **Scope bypass on update.** The old PATCH authorized only the classId/subjectId supplied in the request body. A teacher could edit an assignment in a class they do not teach by sending a class they do teach. Scope is now always taken from the stored record.
2. **Mutable scope.** classId and subjectId could be changed after creation. They are now immutable.
3. **Non-atomic audit.** The write and the audit entry were separate calls. Each mutation now commits its record and audit entry in one batch.
4. **Missing composite indexes.** Staff and student list queries combine equality filters with `orderBy` and were not indexed.
5. **Path re-parsing.** The module re-parsed `request.url` instead of using the router's normalized path.
6. **Direct firebase-admin import.** The module imported `firebase-admin/firestore` at module level. It now receives a `serverTimestamp` factory from `api.mjs`, so it can be tested without installed dependencies.
7. **Publish could be repeated.** Publishing an already-published assignment was accepted. Publish is now draft → published only.

## 2. Files changed

| File | Change | Why |
|---|---|---|
| `netlify/functions/lib/routes/assignments.mjs` | New | Assignment list, create, update, publish, and close with server-side validation, scope checks, and audit logging. |
| `netlify/functions/api.mjs` | Added `/assignments` hook | Authenticates first, then delegates to the assignment module with the normalized path. |
| `netlify/functions/lib/errors.mjs` | Added `INVALID_INPUT` (400) and `CONFLICT` (409) | Codes used by the assignment module. |
| `firestore.indexes.json` | Added 2 composite indexes on `assignments` | Required by the list queries (staff: classId, subjectId, createdAt desc; students add publicationState). |
| `package.json` | `check` script also syntax-checks the new module | Keeps the check script complete. |
| `tests/api/assignments.test.mjs` | New, 24 tests | Validation, authorization, visibility, state transitions, audit, index file. |
| `tests/api/assignments-routing.test.mjs` | New, 5 tests | Routing through the real `api.mjs` handler and authentication on every method. |
| `docs/PHASE_4_ASSIGNMENTS_REPORT.md` | New | This report. |

## 3. Assignment endpoints

| Method | Path | Who | Behaviour |
|---|---|---|---|
| GET | `/api/assignments?classId=&subjectId=` | admin, teacher (scoped), student (class members) | Lists assignments. Students receive published and closed (closed = read-only history); drafts are never returned. Up to 100 results. |
| GET | `/api/assignments/:id` | admin, teacher (scoped), student (class members) | Single assignment. Students cannot open drafts by ID. |
| POST | `/api/assignments` | admin, teacher (scoped) | Creates a draft. Audited. |
| PATCH | `/api/assignments/:id` | admin, teacher (scoped to stored record) | Updates title, instructions, type, dueAt. Not classId, subjectId, or publicationState. Refused when closed. Audited with field names only. |
| POST | `/api/assignments/:id/publish` | admin, teacher (scoped) | draft → published. Audited. |
| POST | `/api/assignments/:id/close` | admin, teacher (scoped) | published → closed. Audited. |

Responses use an explicit allowlist. `createdBy` and other staff identifiers are never returned. Audit metadata contains identifiers, field names, and state transitions only, never titles or instructions.

## 3a. Decisions applied (revision 2)

- **Closed assignments are read-only history for students.** Students see `published` and `closed`; drafts are never returned. Students cannot edit, publish, or close.
- **Single-assignment GET implemented** for staff and students, with the draft rule above.
- **Uniform not-found.** Missing, out-of-scope, and inactive-scope assignment IDs now return the same 404 response body. Previously an out-of-scope teacher received 403, which revealed that the ID existed. This applies to GET, PATCH, publish, and close. Role-based 403 for students on write routes is returned before any record lookup, so it does not depend on the ID.
- **List endpoints still return 403 for unassigned classes.** This does not reveal existence: a nonexistent class and an existing class without the caller's assignment both return 403.

## 4. Test results (exact)

Command: `npm test`

- **Total: 67**
- **Passed: 61**
- **Failed: 0**
- **Skipped: 6**

The 6 skipped tests are the same emulator-dependent tests skipped in Phase 3. They were **not executed**.

Breakdown of new tests (all executed and passed):
- Assignment module: 29 of 29 passed (includes student read-only visibility, uniform-404 enumeration checks, and the scope-bypass regression).
- API routing: 5 of 5 passed.
- Phase 3 baseline: 28 passed, unchanged.

`npm run check` exit code: 0 (67 total, 61 passed, 6 skipped).

## 5. Not verified in this phase

- **Firebase emulator suite (`npm run test:emulator`) was not run.** Firebase CLI is not installed, `npm ci` could not run (no network in this environment), and `firebase-admin` is not installed. The six emulator tests remain skipped.
- **Real Firestore behaviour was not tested.** The unit tests use an in-memory fake that supports equality filters only and ignores ordering. Query correctness and index requirements are checked by reading the index file, not by running queries.
- **Composite indexes are not proven sufficient.** They match the query shapes in the code. They must be confirmed against the Firestore emulator before a real deployment.
- **Frontend not connected.** `public/assignments.html` and `public/assets/js/assignments.js` remain a demo with hardcoded sample data and no authentication. Connecting them needs a session/token flow in the browser, which is a larger change than this phase and needs a decision on the approach.
- **Transactions not used for state transitions.** Publish and close read then write in a batch. Two simultaneous publish requests could both read `draft`. The result is an extra audit entry, not corrupted state, but a Firestore transaction would make it strict. Recommend adding this during emulator testing.

## 6. Owner decisions (resolved)

1. Students see closed assignments in a read-only view. Implemented (section 3a).
2. Single-assignment GET. Implemented (section 3).
3. Uniform not-found to prevent ID enumeration. Implemented (section 3a).

Still open: none from this round. The frontend connection approach remains to be chosen.

## 7. Remaining Phase 4 work

Completed: items 1 (assignment module backend), 3 (automated tests for assignments and routing), and the server-side authorization portions of item 5 for the assignment routes.

Still outstanding:
- Item 2: review of all Firestore indexes against every query in the project, not only assignments.
- Item 4: review of `authorization.mjs` helpers against the full role matrix (currently verified only by unit tests with the in-memory mock).
- Item 5: review of the remaining routes (`/classes`, `/classes/:id/subjects/:id`) for consistent error handling, and the rest of the matrix (attendance, assessments, notices) which is not implemented.
- Item 6: frontend connection.
- Emulator verification of every item above.

## 8. Instructions for the next phase

1. Install dependencies: `npm ci` (requires network).
2. Install the Firebase CLI: `npm install -g firebase-tools`.
3. Run `npm run check` and confirm 63 tests with 57 passing.
4. Run `npm run test:emulator` with the demo project `demo-stem-academy`. Confirm the 6 emulator tests execute and pass, then add emulator tests for assignment create, publish, student visibility, and cross-class denial.
5. Confirm the composite indexes against the emulator. Add a Firestore transaction to publish and close if the concurrency concern in section 5 is confirmed.
6. Answer the open decisions in section 6 before frontend work begins.
7. Do not deploy and do not connect a live Firebase project until the emulator suite passes and the owner approves.
