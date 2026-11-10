# STEM Academy LMS — Phase 7 Issue Register

**Updated:** 10 November 2026
**Release verdict:** NOT READY FOR PILOT

## Resolved / source and offline regression verified

| ID | Finding | Resolution / evidence |
|---|---|---|
| F-01 | Emulator host guard | Exact local loopback + demo project enforcement; negative host tests pass. |
| F-03 | Inactive-class notice visibility | Student/teacher visibility filtered by active class; admin history retained; regression passes. |
| F-04 | Stale in-progress assessment after timeout | Transaction clears `openAttemptId`; regression passes. |
| F-05 | Activation bypass before first password change | Admin activation rejected for pending/credential-issued states; regression passes. |
| F-06 | Draft assignment submission listing disclosed state | Student receives same 404 as missing assignment; regression passes. |
| F-07 | Missing attempt on reopen caused 500 | Controlled 409; regression passes. |
| F-08 | POSIX-only emulator build flag | Cross-platform Node wrapper + `--emulator`; source/unit verified. |
| F-10 | Node/emulator host configuration unpinned | Netlify Node 22 and exact emulator hosts pinned in config. |
| CH-01 | ChitChat module missing | Core module/API/UI and eight offline regression tests implemented. |
| CH-02 | DASH-09 unread integration missing | Role-scoped unread metrics and dashboard display implemented; bounded to latest 500 messages/read receipts per class. |

## Partial / release blockers

| ID | Finding | Remaining work |
|---|---|---|
| F-02 | Dependency reproducibility | `package-lock.json` lacks declared `esbuild@0.24.2` and `firebase@10.14.1` entries; regenerate in registry-enabled environment, then clean `npm ci`. |
| F-09 | Windows `cmd.exe` quoting | Unit tests pass; execute the npm scripts on actual Windows PowerShell/cmd. |
| CH-03 | Real-time chat | Current five-second polling; true WebSocket/native realtime not implemented. |
| CH-04 | Historical search | Current search limited to latest 100 messages. |
| CH-05 | Notifications | DASH-09 in-app unread counts only; no email/SMS/push. |
| CH-06 | Attachments | HTTPS links only; no binary upload/storage. |
| CH-07 | Unread count completeness | Dashboard scan bounded to latest 500 messages/read receipts per class. |
| CH-08 | Browser/performance/accessibility | Three-role browser walkthrough and load/accessibility verification pending. |

## Pending owner policy decisions (only if behaviour should change)

| ID | Current behaviour | Decision required only if changing it |
|---|---|---|
| O-2 | Admin can view inactive-class notices but cannot edit/deactivate them via the active-class-scoped route. | Allow post-deactivation management or retain current behaviour? |
| O-3 | Already-started assessment attempts can submit until their own deadlines after manual assessment closure. | Should manual closure immediately expire all open attempts? |

## Pending technical verification

| ID | Item | Required evidence |
|---|---|---|
| V-01 | Clean dependency install | `npm ci` succeeds from clean checkout after lockfile repair. |
| V-02 | Emulator integration | Full Auth/Firestore emulator suite passes with zero unexplained skips. |
| V-03 | Production-route races | Five route-level race tests pass on Firestore emulator. |
| V-04 | Emulator client build | `npm run build:client:emulator` succeeds and outputs bundles. |
| V-05 | Firestore indexes | New ChitChat indexes accepted by emulator/deployment validation. |
| V-06 | Browser walkthrough | Admin, teacher and student flows, including ChitChat/DASH-09, recorded with actual outcomes. |
| V-07 | Security audit | Registry-backed `npm audit` reviewed for production and development dependencies. |
| V-08 | Security headers | CSP/HSTS reviewed after HTTPS browser verification; no restrictive policy added prematurely. |

## Not executed / blocked in the sandbox

- `npm ci --offline ...`: BLOCKED (`ENOTCACHED` for esbuild).
- `npm run verify:lockfile`: FAILED with the known F-02 gaps.
- `npm run build:client:emulator`: BLOCKED (`ERR_MODULE_NOT_FOUND: esbuild`).
- `npm run test:emulator`: NOT EXECUTED (Firebase CLI unavailable; registry access unavailable).
- 16 emulator-conditional tests: SKIPPED (five race tests + 11 existing emulator tests).
- Windows PowerShell/cmd execution: NOT EXECUTED.
- Authenticated browser walkthrough: NOT EXECUTED.
- Registry-backed npm audit: NOT EXECUTED; offline audit output is not vulnerability evidence.

The current source test suite is 370 total: 354 passed, 0 failed, 16 skipped. See `TEST_RESULTS.md` and `PHASE7_FINAL_VERIFICATION_REPORT.md`.

## Session 2 execution update — 10 November 2026

- F-02 remains **OPEN / FAILED**: `npm run verify:lockfile` exit 1, four missing root/package entries for `esbuild@0.24.2` and `firebase@10.14.1`. `npm install --package-lock-only` and `npm ci` were attempted but blocked by registry DNS `EAI_AGAIN`; lockfile was not hand-edited.
- Fresh `npm test` and `npm run check`: **PASSED**, 370 total, 354 passed, 0 failed, 16 skipped, 0 cancelled.
- Five route race tests: **SKIPPED**, all five skipped without emulator endpoints. Prior 5-cancelled run remains historical.
- Emulator suite: **BLOCKED** (pinned Firebase CLI unavailable; invocation hit the 60-second timeout).
- Emulator client build: **BLOCKED** (`ERR_MODULE_NOT_FOUND: esbuild`).
- Registry-backed dependency audit: **BLOCKED** (npm audit endpoint DNS `EAI_AGAIN`); vulnerability status unknown.
- Static security suite: **PASSED** as included in `npm run check`; Firestore client rules remain deny-all and emulator endpoints are demo/loopback guarded.
- Header review: CSP and HSTS are not configured in `netlify.toml`; no live HTTPS headers were checked.
- Browser walkthrough and Windows PowerShell/cmd execution: **NOT EXECUTED**.

See `TEST_RESULTS.md` and `PENDING_LOCAL_TESTS.txt` for exact commands, results and evidence requirements. **NOT READY FOR PILOT** remains the release verdict.
