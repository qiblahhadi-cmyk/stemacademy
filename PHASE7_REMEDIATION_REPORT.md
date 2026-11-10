# STEM Academy LMS — Phase 7 Remediation Report

**Date:** 10 November 2026
**Baseline:** supplied `PHASE7_FINAL_VERIFICATION_REPORT.md` and existing Phase 7 source.
**Verdict:** **NOT READY FOR PILOT**.

## 1. Remediation summary

The original Phase 7 fixes F-01 through F-10 were inspected against the supplied source, configuration and tests. F-01, F-03, F-04, F-05, F-06, F-07, F-08 and F-10 are implemented with offline source/test evidence. F-02 remains partial because the lockfile omits the declared `esbuild` and `firebase` development dependencies. F-09's quoting function has unit tests, but `cmd.exe` execution has not been run on Windows.

The separately approved ChitChat scope was recovered from the project owner's earlier handover document. The module and DASH-09 have now been implemented in the existing architecture; no additional owner decision was required.

## 2. Findings F-01 through F-10

| ID | Status | Evidence / remaining limit |
|---|---|---|
| F-01 | FIXED — offline verified | Exact loopback-only Auth/Firestore host guard; demo project requirement; rejects remote, aliases, IPv6 and malformed hosts. Emulator itself not run. |
| F-02 | PARTIAL — release blocker | Firebase/Netlify CLI versions pinned through `npx`; lockfile completeness script added. `package-lock.json` still has no `esbuild` or `firebase` entries. Offline `npm ci` fails `ENOTCACHED`. |
| F-03 | FIXED — offline verified | Student/teacher class notices hidden after class deactivation; admin visibility and historical notice records preserved. Regression test exists. |
| F-04 | FIXED — offline verified | Timed-out unsubmitted attempt clears stale `openAttemptId` in the transaction; regression test verifies state and retake approval. |
| F-05 | FIXED — offline verified | Admin activation refuses `pending_activation` and `credential_issued` with 409; Auth is not re-enabled; regression test. |
| F-06 | FIXED — offline verified | Student draft-assignment submission listing returns same 404 as missing; regression test. |
| F-07 | FIXED — offline verified | Reopen with dangling attempt document returns controlled 409; regression test. |
| F-08 | FIXED — source/unit verified | Emulator client build uses `--emulator` through cross-platform Node wrapper; actual build blocked by missing esbuild. |
| F-09 | PARTIAL — Windows pending | `shell-quote.mjs` handles spaces/metacharacters/quotes/trailing backslashes; unit tests pass. Actual `cmd.exe` invocation not run. |
| F-10 | FIXED — source/config verified | Netlify Node 22 and Firebase emulator hosts `127.0.0.1` explicitly pinned. Emulator launch not executed. |

## 3. ChitChat — approved scope recovered and implementation status

The approved 16-item list is reproduced in `docs/CHITCHAT_DATA_MODEL.md`. Current status:

| # | Approved upgrade | Status |
|---:|---|---|
| 1 | Modern chat interface | IMPLEMENTED — requires browser usability/accessibility walkthrough |
| 2 | Real-time messaging | PARTIAL — five-second authenticated polling; no WebSocket/live listener |
| 3 | Message replies | IMPLEMENTED |
| 4 | Controlled message editing | IMPLEMENTED — author only, within 10 minutes |
| 5 | Edit history | IMPLEMENTED — stored and class-authorised retrieval |
| 6 | Deletion with audit records | IMPLEMENTED — soft deletion; atomic audit transaction |
| 7 | Individual read tracking | IMPLEMENTED — one receipt per message/user; counts are independent |
| 8 | Typing indicators | IMPLEMENTED — 15-second expiry |
| 9 | Message search | PARTIAL — latest 100 loaded messages only |
| 10 | Date separators | IMPLEMENTED |
| 11 | Notifications | PARTIAL — in-app DASH-09 unread counts only; no push/email/SMS |
| 12 | Attachments within approved free-service limits | PARTIAL — HTTPS links only; binary upload/storage not enabled |
| 13 | Moderation tools | IMPLEMENTED — staff hide action and report review workflow |
| 14 | Class permissions | IMPLEMENTED — active membership / active teaching assignment enforced server-side |
| 15 | Reporting | IMPLEMENTED — class-scoped reports; staff resolve/dismiss |
| 16 | Dashboard integration and performance/security optimisation | PARTIAL — DASH-09 role counts, bounded query and server checks implemented; browser/emulator/performance load verification pending |

No paid service, new package, Firebase Storage, client-side Firestore access, or architecture change was introduced. ChitChat and DASH-09 are not yet emulator- or browser-verified.

## 4. Outstanding policy observations (unchanged)

### O-1 — CSP and HSTS

No restrictive CSP or HSTS policy was added. A CSP may break the existing Firebase Auth/client bundle or Netlify function routes if its sources are incomplete. HSTS depends on confirmed HTTPS/custom-domain deployment. Both remain pending a real HTTPS browser walkthrough and deployment-header review. Existing safe headers remain in `netlify.toml`.

### O-2 — Inactive classes and notices

After class deactivation, administrators can still see existing notices, but the notice update/deactivation route requires an active class scope. Consequence: historical notices remain visible to administrators but cannot currently be edited/deactivated through the normal notice route once their class is inactive. This preserves the existing approved behaviour and records. No policy change was made; owner decision is still required if post-deactivation notice management is desired.

### O-3 — Manual assessment closure

Closing an assessment prevents new attempts and prevents reopening an attempt after closure. An already-started attempt may still be submitted until its own per-attempt deadline, provided that deadline has not passed. Consequence: a manual close is not an immediate kill-switch for in-progress students; it does not invalidate work already underway. This is consistent with the current attempt deadline rule. No change made; owner decision required if closure should immediately expire all open attempts.

### O-4 — Other observations

Notice listing remains bounded to 200 active notices and has no explicit ordering guarantee. ChitChat listing/search is bounded to the latest 100 messages. The current project is under 50 students, but pagination/retention/load behaviour should be revisited before scale increases.

## 5. Additional ChitChat regression tests

`tests/api/chitchat.test.mjs` covers active-class membership, sending/listing, per-user read receipts and unread counts, edit validation/history, cross-user edit/delete denial, student moderation denial, staff moderation and audit, inactive class denial, report submission and staff review, and typing visibility/access control.

## 6. Remaining release gates

1. Regenerate the package lock in a registry-enabled environment; confirm `npm ci` from a clean checkout.
2. Run the full Auth/Firestore emulator suite and the five transaction race tests.
3. Run the emulator client build and local Netlify development server.
4. Complete admin, teacher and student browser walkthroughs, including ChitChat and DASH-09.
5. Run a registry-backed `npm audit` and review current production/development advisories.
6. Execute PowerShell and `cmd.exe` workflows on Windows.
7. Review CSP/HSTS after actual HTTPS browser verification.

No test that needs these systems is reported as passed.
