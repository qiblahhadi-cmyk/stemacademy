# Phase 4 authorization and transaction review

## Principle

A role or scope check performed before `runTransaction` is not sufficient to authorize a write: a membership, teaching assignment, class or subject can be deactivated after the check. Protected operations now use `txAuthorizeScope` from `netlify/functions/lib/authorization.mjs` inside the same Firestore transaction that performs the write. Firestore retries when a document read by the transaction changes before commit; the retry sees the revoked state and refuses the write.

`txAuthorizeScope` reads the active class, optional active same-grade subject, canonical membership document (`classAccessDocumentId`) for teacher/student users, and active teaching-assignment query for teachers. Callers complete all transaction reads before issuing writes. The helper throws the existing `FORBIDDEN` / `NOT_FOUND` sentinels; route handlers retain their existing response mapping, including same-404 behavior for protected ID-addressed resources.

## Protected write paths reviewed

| Route module | Protected writes | Transaction-bound checks |
|---|---|---|
| `assignments.mjs` | Create, update, publish, close | Create and stored-record scope checks use `txAuthorizeScope`; update/publish/close read the assignment and scope in one transaction |
| `assessments.mjs` | Create, update, publish, close, start, submit | Create and stored-record scope checks use `txAuthorizeScope`; start and submit re-read assessment state and verify class/subject/student membership in the transaction |
| `attendance.mjs` | Mark and correct | Teacher class/assignment scope and target student memberships/accounts are read in the transaction; effective attendance and correction history remain atomic |
| `notices.mjs` | Class notice create, update, deactivate | Class and teacher scope are checked in the transaction; academy-wide notice edits remain admin-only |
| `memberships.mjs` | Enroll/reactivate, deactivate | Existing transactions read canonical membership plus class/student state before writes; history and audit entries are appended, not deleted |
| `admin.mjs` | Teaching assignment create/update/deactivate; account/class/subject changes | Existing transactions re-read teacher/class/subject or target resource before mutation; assignment tuple IDs remain deterministic |
| `authorization.mjs` | Shared authorization | Added transaction-bound scope helper; ordinary helpers remain for read-only operations |

## Concurrency coverage

- Deterministic fake-Firestore tests inject teaching-assignment, teacher-membership, class and subject revocation between transaction callback and commit.
- Protected route tests verify that assignment creation and attendance marking leave no record after a revocation conflict.
- Existing tests cover concurrent assignment lifecycle changes, assessment starts and attendance corrections; the suite also verifies existing duplicate-mark conflict behavior.
- Real Firebase Emulator race tests use synthetic documents and pause a transaction after authorization reads while a separate client operation deactivates the relevant record. They assert that the retried transaction does not write.

## Limitations

- Emulator tests are authored but not executed in this environment; they must pass against Firebase Auth and Firestore emulators before claiming real-emulator race verification.
- Read-only listing endpoints continue to use ordinary reads, because they do not commit protected writes.
- The canonical membership migration remains a separately documented emulator-only operation; this Phase 4 work does not rewrite or delete existing membership records.
