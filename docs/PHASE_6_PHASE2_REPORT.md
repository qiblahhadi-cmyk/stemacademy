# Phase 6 — Phase 2 Report (Real data and interface integrity)

Date: 9 November 2026. Scope: P1-1 Classes and People, P1-2 Dashboard, P1-3 Profile.
Status: **code and automated tests complete. Emulator and browser walkthrough NOT run** (no Firebase CLI, browser or network here). Not signed off until those are run.

## P1-1 Classes and People

- New `GET /api/classes/{id}/roster` (`lib/routes/roster.mjs`). Administrators see any active class. Teachers see only classes with an active teaching assignment, and anything else returns the same 404 as a missing class. Students are refused (403). Rows carry only `academyId` and `displayName`.
- `classes.html` and `classes.js` were rewritten to use real data. Grade, class, student and teacher figures come from the API, and they show "—" until every roster loads. The Students and Teachers tabs now switch and filter the table. Removed: the fictional Sample Teacher panel, the "demo workspace" notice, the add-class dialog (class records are managed in Academy Management, so there are no duplicate entry points), and the fixed 6/1 counts.

## P1-2 Dashboard

- New `GET /api/dashboard` (`lib/routes/dashboard.mjs`) returning role-specific counts (listed in `docs/API.md`).
- Bug found by a test and fixed before delivery: the teacher student count included students whose accounts were deactivated while their membership stayed active. A student is now counted only when both the membership and the account are active.
- `index.html` and `dashboard.js` were rewritten. Removed: the sample stat cards, "Pending work", "Today's attendance", the development-progress card and the demo notices. The greeting date is live in the academy time zone. Zero counts show an explanatory empty-state message.

## P1-3 Profile

- `PATCH /api/me` changes only `displayName` (`lib/routes/profile.mjs`). The allowlist refuses role, active, academyId, uid, provisioning and email fields with 400. The UID comes from the verified token, so a user cannot target another account. The change is audited without the value.
- `profile.html` and `profile.js` were rewritten. Removed: the fictional admin, the fake email, "Preview profile update", and the "demo workspace" notice.
- **Password change: left disabled, deliberately.** Firebase Auth password changes need client-side reauthentication with the current password, followed by a verified update. That flow cannot be tested here without the emulator and browser, and it touches the forced-password-change gate. The page says so and points to the administrator. Documented as a limitation.

## Results

| Run | Total | Pass | Fail | Skipped |
|---|---|---|---|---|
| Phase 1 baseline | 231 | 225 | 0 | 6 |
| After Phase 2 `node --test` | 259 | 253 | 0 | 6 |
| After Phase 2 `npm run check` | 259 | 253 | 0 | 6 |

New tests: `tests/api/people-scope.test.mjs` (18: roster scope and privacy, dashboard scope and zero-data, profile allowlist and audit) and `tests/frontend/people-pages.test.mjs` (10: no placeholder wording, blank statistics, single editable profile field, endpoint usage, session bundle loading).

## Known limitations

- Roster and dashboard queries use equality filters only. Firestore should serve them from merged single-field indexes, but this has not been checked against the emulator. Confirm during `npm run test:emulator`.
- Dashboard counts read up to 500–1000 documents per query. This is fine for a pilot under 50 students and would need counters or pagination at scale.
- Teachers can see the co-teachers of their own classes (display name and academy ID). Confirm this is acceptable.
- After a display-name change, the top-bar avatar updates on this page only. Other open pages update on reload.
- `[hidden]` handling: a scoped rule was added for the dashboard stats grid only. Other pages were not changed.

## How to verify

    npm test
    npm run check
    npm run emulators
    npm run seed:emulator
    npm run dev   # walk through classes, dashboard and profile as admin, teacher and student
