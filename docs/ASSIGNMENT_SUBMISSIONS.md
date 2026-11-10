# Assignment submissions — Phase 5

## Existing assignment lifecycle reviewed

Assignments retain the existing `draft → published → closed` lifecycle. Drafts are not student-visible. Published assignments accept submissions. Closing an assignment prevents new submissions and resubmissions while retaining read-only history. The assignment's existing `dueAt` is enforced as a server-clock cutoff; no submission is accepted after it. A null due date means no deadline cutoff.

## Text-only workflow

No file upload, object storage, paid storage product, or external file service is introduced. A student submits a plain-text answer (1–20,000 characters) for an existing published assignment. This is intentionally the first safe submission workflow; physical assignments may still need paper/in-person work and should not be represented as file-upload capable.

### Collections

`assignmentSubmissions/{deterministicId}` stores the latest submission for one assignment/student pair. The document ID is a SHA-256-derived key of `[assignmentId, studentUid]`, preventing duplicate canonical submissions for that pair. It stores assignment/class/subject scope, authenticated student UID, text, revision number, submission/update timestamps, status (`submitted` or `graded`), optional feedback, grade (0–100), and review metadata.

`assignmentSubmissionRevisions/{autoId}` is append-only per submission event and preserves the text, revision number, actor UID, and timestamp for each initial submission/resubmission. It is never overwritten by a later revision.

Audit events are written in the same transaction as the submission/review mutation. They record actor, target and changed fields/assignment ID, not the answer or feedback text.

## Resubmission and grading policy

- Students may resubmit while the assignment remains published and before its due date (or indefinitely before closure if no due date exists).
- Resubmission increments `revision` and appends a revision snapshot.
- Once a teacher enters a grade, the submission becomes `graded`; the student cannot resubmit it. Teachers/admins may still update feedback or grade, with each review audited.
- A feedback-only review leaves the submission status as `submitted`; entering a numeric grade sets `graded`.
- Grades are numeric percentages from 0 through 100. Per-assignment maximum scores and rubric grading are not part of this phase.

## Access control

- The server derives student UID from the authenticated user. The client cannot submit on behalf of another student.
- Students can retrieve only their own submission for an assignment.
- Teachers can list/review submissions only for a class/subject where their active membership and teaching assignment remain valid. The review transaction rechecks scope.
- Administrators can inspect/review across active scope.
- Submission creation and review use transaction-bound scope reads, including active class, subject, membership and teaching assignment as applicable.
- Missing/out-of-scope assignment or submission lookups use the existing not-found response pattern.

## API

- `POST /api/assignment-submissions` with `{ assignmentId, text }` (student)
- `GET /api/assignment-submissions?assignmentId=...` (student's own submission; teacher/admin scoped list)
- `PATCH /api/assignment-submissions/:submissionId/review` with optional `{ feedback, grade }` (teacher/admin)

The browser UI is connected on the Assignments page. It uses the existing authenticated `StemSession.apiFetch` wrapper and inserts server-provided text with DOM text nodes/textContent.
