# STEM Academy API Notes — Phase 6

All protected endpoints require a Firebase ID token in the bearer authorization header. The API verifies the token and loads the trusted `users/{uid}` record; client-supplied role values are not authoritative. Firestore browser rules remain deny-all; clients use the server API.

## Existing routes

| Route | Methods | Scope |
|---|---|---|
| `/api/health` | GET | Public health check |
| `/api/me` | GET | Authenticated user's server-derived UID, role, display name and forced-password-change state; pending accounts are admitted only for this bootstrap response |
| `/api/auth/complete-password-change` | POST | Only a verified `mustChangePassword` account; updates the password server-side, activates the profile and clears the claim |
| `/api/classes` | GET | Role-scoped active class listing |
| `/api/classes/:classId/subjects/:subjectId` | GET | Authorized class/subject scope |
| `/api/subjects` | GET | Authorized subject listing |
| `/api/assignments` and `/api/assignments/:id...` | GET, POST, PATCH as implemented | Existing assignment lifecycle; route-level scope checks |
| `/api/attendance` | GET | Teacher/admin roster in an authorized class |
| `/api/attendance/mine` | GET | Student-only attendance history for the authenticated UID; optional opaque `cursor` for older records |
| `/api/attendance/mark` | POST | Teacher/admin attendance marking; transaction-bound student membership |
| `/api/attendance/correct` | POST | Teacher/admin correction with reason and append-only history |
| `/api/attendance/corrections` | GET | Authorized staff correction history; student history is included only in `/api/attendance/mine` and contains no other student's data |
| `/api/assessments` and `/api/assessments/:id...` | GET, POST, PATCH as implemented | Existing MCQ lifecycle, attempt and result routes |
| `/api/memberships` | GET | Administrator-only membership listing |
| `/api/memberships` | POST | Administrator-only enrollment/reactivation |
| `/api/memberships/:classId/:studentUid/deactivate` | POST | Administrator-only soft deactivation |
| `/api/admin/students` | GET | Administrator-only student list; supports `q` and `active` filters |
| `/api/admin/students/:uid` | GET | Administrator-only student profile, membership history and effective class-grade subject access |
| `/api/admin/staff` | GET | Administrator-only teacher/staff list; supports `q` and `active` filters |
| `/api/admin/classes` | GET, POST | Administrator-only class listing and creation |
| `/api/admin/classes/:id` | PATCH | Administrator-only class update; active=false is soft deactivation |
| `/api/admin/subjects` | GET, POST | Administrator-only AJK subject listing and creation |
| `/api/admin/subjects/:id` | PATCH | Administrator-only subject update/deactivation |
| `/api/admin/teaching-assignments` | GET, POST | Administrator-only assignment listing and idempotent assignment creation |
| `/api/admin/teaching-assignments/:id` | PATCH | Administrator-only assignment update/deactivation |
| `/api/admin/accounts` | POST | Administrator-only student/teacher Firebase Auth account staging; account remains disabled |
| `/api/admin/students/:uid` and `/api/admin/staff/:uid` | PATCH | Update display name or active state; permanent IDs and roles are immutable |
| `/api/notices` | GET | Authenticated academy-wide and relevant class notices for the caller |
| `/api/notices` | POST | Admin academy/class notices; teacher class notices only for assigned classes |
| `/api/notices/:id` | PATCH | Admin or authorized class teacher edits; academy-wide edits are admin-only |
| `/api/notices/:id` | POST | Soft deactivation with the same scope authorization |

The assignments and assessments route modules contain additional action subpaths. Consult their route handlers for the exact current methods and request schemas; do not assume CRUD operations exist merely because a collection is present.

## Membership request examples

Enroll/reactivate:

```http
POST /api/memberships
Authorization: Bearer <Firebase ID token>
Content-Type: application/json

{"classId":"class-9","studentUid":"<Firebase UID>"}
```

Deactivate without deleting historical records:

```http
POST /api/memberships/class-9/<Firebase UID>/deactivate
Authorization: Bearer <Firebase ID token>
```

## Administrator management notes

- The `admin-management.html` page is restricted by the browser page policy to administrators. This is a navigation convenience only; every `/api/admin/*` request independently verifies the Firebase token and trusted `users/{uid}.role === "admin"` record.
- Student and teacher creation uses `/api/admin/accounts`. The server allocates the permanent academy ID, derives the internal alias, creates the Firebase Auth user as `disabled: true`, and writes a trusted `users/{uid}` profile with `active: false` and `provisioningStatus: "pending_activation"`. The API never accepts a client-supplied UID, role other than student/teacher, academy ID, email alias or password.
- Account staging is not account activation. A separate owner-verified local credential handoff issues a temporary password and the `mustChangePassword` claim; the user must complete `/api/auth/complete-password-change` before ordinary API access is permitted. Ordinary administrator profile edits cannot activate a pending account. The alias `stemacademy.edu.pk` is an authentication identifier only and is not assumed to receive email.
- Class, subject, student and teacher records support list/create/update/soft-deactivate operations. Student enrollment remains on `/api/memberships`, preserving canonical membership IDs and append-only history.
- Teaching assignment document IDs are deterministic for the `(teacherUid, classId, subjectId)` tuple. Creation checks active teacher, class and same-grade subject inside the Firestore transaction and creates the teacher's class-access record in the same transaction.
- Account deactivation updates the trusted profile first and disables Firebase Auth as defense in depth. If Auth synchronization fails, the API reports an operational error; server middleware still rejects the inactive profile.
- `GET /api/admin/students` and `GET /api/admin/staff` return records with academy IDs, display names, role and status. They do not return passwords or Firebase service credentials.

## Not yet complete

- The owner-verified handoff and forced-password-change code exists, but it has not been run against Auth/Firestore emulators in this environment. Do not create real users until emulator verification and an owner/technical-custodian rehearsal are complete.
- End-to-end Firebase Emulator tests, Auth alias compatibility verification, browser walkthrough and production-hosting compatibility remain outstanding.

## Notices — update contract (Phase 6 Phase 1)

`PATCH /notices/{id}` accepts only `title`, `body` and `priority`. `scope` and `classId` are fixed at creation and are refused with 400 on update. `priority` must be `normal` or `important` (lowercase).

## People, roster, dashboard and profile (Phase 6 Phase 2)

### GET /classes/{classId}/roster
Administrators: any active class. Teachers: only a class with an active teaching assignment; any other class returns 404 (the same as a missing class). Students: 403.
Returns the class summary, `counts` (active students and teachers), and two arrays. Each row has only `academyId` and `displayName`. No UIDs, email addresses or timestamps are returned. Students must have an active account, and teachers must have an active teaching assignment, to appear.

### GET /dashboard
Role-specific counts only.
- Administrator: `activeClasses`, `activeStudents`, `activeTeachers`, `activeNotices`.
- Teacher: `assignedClasses`, `studentsInMyClasses` (distinct students with an active membership and an active account), `myTeachingAssignments`, `visibleNotices`.
- Student: `enrolledClasses`, `visibleNotices`.

### PATCH /me
Changes the caller's own `displayName` only: 2 to 60 characters after trimming, no control characters. Any other field returns 400. The user ID comes from the verified token. Writes an audit entry `profile.displayName.updated` that records the field name, not the value. Pending-password accounts are refused (the normal password-change gate applies).

## Activity Logs (Phase 6 Phase 3)

### GET /admin/audit-logs
Administrator-only, read-only view of the append-only `auditLogs` collection. Teachers, students and unauthenticated callers receive 403/401. Any other method returns 405; no route can create, change or delete audit entries.

Query parameters (all optional): `limit` (1–100, default 25), `cursor` (opaque value from `nextCursor`), `action` (exact action, e.g. `notice.created`), `actorRole` (`admin|teacher|student`), `category` (`Classes|Assignments|Assessments|Attendance|Communication|Account|Other`), `from` / `to` (inclusive `YYYY-MM-DD`, academy calendar day in Asia/Karachi), `q` (case-insensitive text, max 100 characters; matches action, description, target type/ID, actor role, and class/subject/academy IDs in allowlisted metadata). Invalid values return 400 `INVALID_INPUT`.

Response `data`: `records[]`, `nextCursor`, `hasMore`, `scanLimited`, `limit`. Each record: `id`, `action`, `category`, `description`, `actorRole`, `actorAcademyId`, `targetType`, `targetId`, `metadata` (allowlist: `classId`, `subjectId`, `scope`, `fields`, `attendanceDate`, `count`, `role`, `academyId`), `createdAt` (ISO 8601 UTC). Display names, e-mail aliases, actor/student/teacher UIDs in metadata, scores, answers and any other metadata keys are never returned.

Pagination is newest-first with a stable document-ID tiebreak. At most one equality filter (`action`, else `actorRole`) plus the date range is evaluated by Firestore; the remaining filters and `q` are applied in memory while scanning up to 500 entries per request. If that window is exhausted before `limit` matches are found, `scanLimited: true` and `hasMore: true` are returned with a `nextCursor` to continue from. Required indexes are in `firestore.indexes.json` (`auditLogs`: `action`+`createdAt desc`, `actorRole`+`createdAt desc`) and must be deployed to a real project before use.


## Phase 5 endpoints

### Curriculum

- `GET /api/curriculum/chapters?classId=...&subjectId=...` — scoped chapter list.
- `GET /api/curriculum/topics?classId=...&subjectId=...` — scoped topic/objective list.
- `POST /api/curriculum/chapters`, `PATCH /api/curriculum/chapters/:id`, `POST /api/curriculum/chapters/:id/verify`, `POST /api/curriculum/chapters/:id/publish` — administrator draft and publication workflow.
- Equivalent endpoints under `/api/curriculum/topics`.

### Assignment submissions

- `POST /api/assignment-submissions` — student text submission `{ assignmentId, text }`.
- `GET /api/assignment-submissions?assignmentId=...` — student's own submission or scoped staff list.
- `PATCH /api/assignment-submissions/:submissionId/review` — teacher/admin feedback and optional 0–100 grade.

See `docs/CURRICULUM_DATA_MODEL.md` and `docs/ASSIGNMENT_SUBMISSIONS.md` for lifecycle, validation and access rules.


## Module 7 — ChitChat (Phase 7 continuation)

| Route | Methods | Scope |
|---|---|---|
| `/api/chitchat?classId=...` | GET | Active class member; latest 100 messages and caller's read states |
| `/api/chitchat/messages` | POST | Active class member; send text, reply and optional HTTPS link |
| `/api/chitchat/messages/:id` | PATCH, DELETE | Author edit (10-minute window); author/staff soft-delete |
| `/api/chitchat/messages/:id/history` | GET | Active class member; edit history |
| `/api/chitchat/messages/:id/read` | POST | Individual read receipt for authenticated UID |
| `/api/chitchat/messages/:id/moderate` | POST | Staff-only message moderation/hide |
| `/api/chitchat/typing` | GET, POST | Active class member; expiring typing state |
| `/api/chitchat/reports` | GET, POST | Staff reads scoped queue; class members submit reports |
| `/api/chitchat/reports/:id` | PATCH | Staff-only resolve/dismiss in assigned class scope |

The server derives sender identity and role from authentication. Teachers must hold an active teaching assignment for the class. Students must hold active membership. Administrators may act in active classes. Details and known bounded/polling limitations are in [`CHITCHAT_DATA_MODEL.md`](CHITCHAT_DATA_MODEL.md).
