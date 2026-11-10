# Phase 6 — Phase 1 Report (Critical UI corrections)

Date: 9 November 2026. Scope: P0-1 (navigation) and P0-2 (communication/notices) from `PHASE_6_ASSESSMENT.md`.
Status: **Code and automated tests complete. Emulator and browser walkthrough NOT run in this environment** (no Firebase CLI, no browser, no network). Phase 1 is not signed off until those are run.

## P0-1 Navigation

Cause: sidebar links used `#hash` destinations (42 across 7 pages). `session-entry.js` only rewrites links ending in `.html`, so clicks stayed on the current page.

Fix: every fragment link now points to its real page. `#dashboard` (and brand links) become `/`. The role policy in `session-entry.js` is unchanged, so students still get `assessments.html` redirected to `my-assessments.html`, and links to pages a role may not open are still hidden. Course Hub is linked from no page and its policy stays `[]`.

Tests added in `tests/frontend/static-assets.test.mjs`: no fragment-only links remain; every local page link targets an existing page with a role policy (login and forbidden pages exempt); every sidebar destination resolves for every role; Course Hub is not linked.

## P0-2 Communication / Notices

Defects fixed:
1. Priority dropdowns had no `value` attributes, so they submitted "Normal"/"Important". Now `normal`/`important`.
2. Priority filter compared against capitalised text and never matched. Now lowercase values.
3. Edit dialog could not select the saved priority. Fixed by (1).
4. **Found beyond the assessment:** editing sent `scope` and `classId`, which the API refuses on PATCH, so every edit failed. The edit payload now carries only title, body and priority. The audience selector is disabled while editing, since the API cannot change it.
5. `noticeDate` was a required input that was never read. Removed, since scheduling is not supported and no input is discarded.
6. "TEMPORARY DEMO NOTICE" eyebrow replaced with "NOTICE".
7. Stat cards showed hardcoded 4/1/3/1 before data loaded. They now show "—" until real data arrives.
8. **Found beyond the assessment:** notices were sorted with `String(createdAt)`, which does not order Firestore Timestamps. A `timeKey` helper now handles Timestamps, serialised `{_seconds}` values, and ISO strings.

Structure: the form logic moved to `public/assets/js/notice-form.js` (pure ES module). `communication.js` is now `type="module"` so it can import it. The API priority enum is exported from `notices.mjs` and tests compare it to the page's dropdowns.

Tests: `tests/frontend/notices-ui.test.mjs` (new, 12 tests) covers dropdown values against the API enum, filter values, removal of `noticeDate` and demo wording, blank initial stats, payload shape for create and edit, and selected-priority fallback. `tests/api/notices.test.mjs` gains 7 tests: edit refuses scope and classId, priority must be lowercase, teacher and student edit limits, deactivated notices hidden, timestamp ordering, `timeKey`, and named audit entries.

## Results

| Run | Total | Pass | Fail | Skipped |
|---|---|---|---|---|
| Baseline (uploaded zip) `node --test` | 210 | 204 | 0 | 6 |
| After Phase 1 `node --test` | 231 | 225 | 0 | 6 |
| After Phase 1 `npm run check` | 231 | 225 | 0 | 6 |

The 6 skipped tests are emulator-gated (`tests/firebase/emulator-smoke` and similar). They were not run and are not counted as passed. `npm run test:emulator` was not run.

## Not verified in this phase

- Emulator integration tests (`npm run test:emulator`).
- Browser click-through of every sidebar link as admin, teacher and student (P0-1 acceptance). The link targets are verified statically only.
- Create, edit, deactivate and filter against the running API and emulator (P0-2 acceptance).
- Notice ordering on real Firestore Timestamps.

## How to run locally

    npm install
    npm test
    npm run check
    npm run emulators          # separate terminal, needs Firebase CLI
    npm run test:emulator
    npm run seed:emulator
    npm run dev                # then browse to the local Netlify URL and walk through each role
