# Phase 4 Restart Baseline

This package is a clean extraction of the supplied `STEM_Academy_Phase6_Phase3_Corrected.zip`.

## Reset decision

The previous Phase 4 working directory is not used as the source of truth. Its attempted authorization-race patch set is excluded because the supplied working log records that the added fake-Firestore race suite failed (44 of 53 tests) and then stopped with a top-level test failure. The patch set also does not establish real Firebase Emulator race safety.

Phase 4 must restart from this Phase 3 snapshot. No Phase 4 implementation is claimed by this baseline package.

## Baseline verification in this environment

- Node.js: v22.16.0
- `npm test`: 287 tests; 281 passed; 0 failed; 6 skipped.
- `npm run check`: passed; its embedded `npm test` repeated the same 287-test result (281 passed, 0 failed, 6 skipped).
- Firebase Emulator integration: not run. No emulator result is claimed.
- Browser walkthrough: not run. No browser result is claimed.
- Production Firebase and hosting: not contacted; no deployment performed.

## Restart order

1. Treat this source snapshot as immutable baseline.
2. Implement student-only attendance read endpoint and student UI with ownership enforced server-side.
3. Add targeted unit tests and run the complete baseline suite.
4. Review each protected write path for transaction-bound authorization.
5. Add fake-Firestore concurrency tests, then run the same scenarios against Firebase Auth/Firestore emulators before claiming race safety.
