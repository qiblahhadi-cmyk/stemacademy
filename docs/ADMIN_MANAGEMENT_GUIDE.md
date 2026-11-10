# Administrator Management Guide — Phase 6

## Access

Open `/admin-management.html` after signing in with an account whose trusted Firestore `users/{uid}` profile has `role: "admin"` and `active: true`. The browser page policy hides/blocks the page for other roles, and every API endpoint independently checks the server-verified role. Do not treat a hidden link as authorization.

## Available areas

| Area | API | Operations |
|---|---|---|
| Students | `/api/admin/students` | List/search, provision disabled account, edit display name, deactivate/reactivate eligible existing account |
| Teachers | `/api/admin/staff` | List/search, provision disabled account, edit display name, deactivate/reactivate eligible existing account |
| Classes | `/api/admin/classes` | List, create, edit, soft deactivate |
| Subjects | `/api/admin/subjects` | List, create, edit, soft deactivate |
| Memberships | `/api/memberships` | List, filter by class/student UID, enroll/reactivate, soft deactivate |
| Teaching assignments | `/api/admin/teaching-assignments` | List, create, update and deactivate |

The student list includes a Details view joining the profile, active/inactive enrollment records, append-only membership history and effective subject access for each active class. The UI also shows Firebase UIDs and class/subject document IDs needed for enrollment and assignment forms. These are technical identifiers, not the permanent academy ID. The permanent academy ID remains separate and immutable.

## Creating a student or teacher account

1. Open Students or Teachers.
2. Enter the person's display name.
3. Submit the form.
4. The server allocates the academy ID and creates a Firebase Auth account in the disabled state.
5. The trusted user profile is saved with `active: false` and `provisioningStatus: "pending_activation"`.
6. The UI displays the academy ID and clearly reports that activation is pending.

This is account staging, not yet a working login. The owner/technical custodian must complete the verified in-person credential handoff using the controlled utility; the user then signs in and is forced to set a private password at `/activate-account.html`. The utility has not yet been emulator-verified in this environment. Do not enter real student/staff details until that verification and rehearsal are complete.

## Classes and subjects

- Only grades 9 and 10 are accepted.
- Academic session must be a four-digit year.
- Subjects are currently constrained to board `AJK` and grade 9 or 10.
- Class/subject grade is immutable after creation to protect historical and teaching-assignment consistency. Teaching assignment tuple (teacher/class/subject) is also immutable; deactivate the old assignment and create a new one when the tuple changes.
- Teaching assignment creation validates that teacher, class and subject exist, are active, and that class and subject grades match.
- Class/subject deactivation is soft; related historical academic data is not deleted.

## Memberships

1. Select Memberships.
2. Enter the class document ID and student's Firebase UID.
3. Submit to enroll. An active duplicate conflicts; an inactive historical membership is reactivated using its canonical document ID.
4. Deactivate from the record list to preserve history.

Membership documents use the canonical hash-based key for `[classId, "student", userUid]`. Membership changes write append-only history and audit records. See `MEMBERSHIP_MIGRATION.md`.

## Teaching assignments

Use the Firebase UID of an active teacher, a class document ID and a subject document ID. The backend enforces active teacher/class/subject state and same-grade compatibility inside the Firestore transaction. Repeating the same tuple is idempotent and does not create a second assignment document.

## Current limitations

- Account activation and first-password handoff are not implemented. Pending accounts remain disabled and cannot be activated by ordinary profile edits.
- The browser page has not been walked through with a running Netlify Dev server and Firebase emulators in this environment.
- The in-memory test suite is not a substitute for Firestore emulator transaction verification.
- UI currently provides basic record editing for display names and names. Detailed multi-field editing for class/subject metadata and assignment tuples can be expanded after emulator verification.
- No bulk import, real student entry, production Firebase connection or deployment is authorized.
