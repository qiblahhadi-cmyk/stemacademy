# Phase 4 test results

Date: 10 November 2026

## Baseline

The clean Phase 3 restart baseline was previously verified at 281 passed, 0 failed and 6 skipped. Phase 4 work was applied to that clean source snapshot, not to the failed experimental Phase 4 tree.

## Current automated results

Command: `npm run check`

- Syntax checks: passed.
- Test files: 304 subtests reported (306 tests including nested cases).
- Passed: 295.
- Failed: 0.
- Skipped: 11.
- Cancelled: 0.

The 11 skips include the existing 6 emulator-conditional skips and 5 new real-emulator authorization-race tests. Fake-Firestore protected-write race tests are included in the passing tests.

Focused test groups also passed during implementation:

- Attendance API and student page navigation tests.
- Assignment, assessment, attendance and notice API suites.
- Transaction-bound authorization and protected-write race suites.

## Emulator execution

Command attempted: `npm run test:emulator`

Result: not executed. The script stopped with `firebase: not found` (exit 127). `npm ci --no-audit --no-fund` was attempted twice but timed out, and the environment has no installed `firebase`, `firebase-admin`, or `esbuild` packages. No emulator connection was made. The new emulator race tests therefore remain skipped and unverified.

## Browser verification

Not run. An authenticated walkthrough requires the emulator services, installed project dependencies, a local client bundle and synthetic accounts. These prerequisites were unavailable. The checklist and expected outcomes are in `docs/PHASE4_BROWSER_WALKTHROUGH.md`.

## Production safety

No production Firebase project was configured or contacted. No deployment was attempted. No real student or staff records were used. No `.env`, private key or service-account file was included in the deliverable.
