# STEM Academy — Firestore Data Model Proposal

**Status:** Design proposal only — not deployed and not yet approved for production  
**Baseline:** STEM Academy Master Specification v1.1.0  
**Scope:** AJK Board Physics LMS, one academy, separate administrator and teacher accounts (two staff accounts initially), fewer than 50 students, Grades 9 and 10  
**Architecture:** Firebase Authentication + Cloud Firestore Spark + trusted Node.js serverless API using Firebase Admin SDK

## 1. Non-negotiable design rules

1. Firestore browser rules remain deny-all. The browser must call the server API; it must not read or write application collections directly.
2. Every API route independently authenticates and authorizes the caller. Firebase Admin SDK bypasses Firestore Rules.
3. The Firebase Auth UID is the account identity. The trusted `users/{uid}` document determines the role and active status; client-provided roles are never trusted.
4. Class access comes from trusted class-access records, not from a class ID supplied by the browser.
5. Students may retrieve only their own records and released results. Teachers may retrieve records only for classes and subjects explicitly assigned to them. Admin-only operations require the admin role.
6. Assessment answer keys and unpublished scores must never be returned by student-facing API responses.
7. Keep records small and queryable. Use stable document IDs, server timestamps, bounded queries and cursor pagination.
8. No file uploads, Firebase Storage, Cloud Functions, background jobs, scheduled tasks, realtime listeners or paid services are introduced by this proposal.
9. Do not put passwords, tokens, private keys, home addresses, identity scans, photographs or unnecessary sensitive details in Firestore or audit logs.
10. Archive/deactivate operational records rather than deleting history. No automatic data purge is proposed.

## 2. Proposed collections

| Collection | Document ID | Purpose and key fields |
|---|---|---|
| `users` | Firebase Auth UID | `role`, `active`, `displayName` (student full name), `authEmail` (system-generated alias for students), optional real `contactEmail` only if later approved, `studentId` (academy-generated for students), `createdAt`, `updatedAt`; avoid collecting extra profile fields unless a documented need is approved |
| `classes` | Stable class ID | `name`, `grade`, `academicSessionId`, `active`, timestamps |
| `classAccess` | Deterministic class/user ID | `classId`, `userUid`, `accessType` (teacher or student), `active`, timestamps; teacher access establishes class-level scope only |
| `teachingAssignments` | Deterministic teacher/class/subject ID | `teacherUid`, `classId`, `subjectId`, `active`, `assignedBy`, timestamps; identifies exactly which subjects a teacher may manage in a class |
| `academicSessions` | Stable session ID | `name`, `startsOn`, `endsOn`, `active` |
| `subjects` | Stable subject ID | `name`, `board`, `grade`, `active`, display order |
| `topics` | Stable topic ID | `subjectId`, `chapterName`, `name`, `order`, `active` |
| `assignments` | Stable assignment ID | `classIds`, `type` (physical task or online activity), instructions, due date, publication state, creator UID, timestamps |
| `assignmentRecords` | Deterministic assignment/student ID | `assignmentId`, `studentUid`, `classId`, status, teacher review, feedback, timestamps |
| `assessments` | Stable assessment ID | title, subject/topic references, class IDs, publication state, attempt policy, result-release state, creator UID |
| `assessmentVersions` | Immutable version ID | assessment reference, version number, question content without answer keys, created-by and created-at |
| `assessmentAnswerKeys` | Same immutable version ID | server-only answer key and grading configuration |
| `assessmentAttempts` | Unique attempt ID | assessment/version references, student UID, answers, attempt number, submitted-at, grading state |
| `assessmentResults` | Attempt ID | student UID, assessment ID, score, approval state, approved-by/time, released-at |
| `attendanceRecords` | Deterministic class/date/student ID | `classId`, `studentUid`, local attendance date, status, marked-by, correction history reference |
| `notices` | Stable notice ID | title, body, target class IDs/roles, publication state, creator, timestamps |
| `noticeStates` | Deterministic notice/user ID | `noticeId`, `userUid`, read-at and acknowledgement-at (separate states) |
| `auditLogs` | Generated event ID | actor UID/role, action, target type/ID, timestamp, safe metadata; append-only through application routes |
| `academySettings` | Fixed setting key | approved academy-level configuration only; never store secrets |
| `systemCounters` | Fixed counter key | server-only monotonic counters for student and staff ID issuance; never reset or decrement |

Deterministic IDs should use an unambiguous encoding or a stable hash of the component IDs. Do not build IDs by joining arbitrary user-entered strings. Student IDs (`SA-YYYY-NNN`) and staff IDs (`SA-ADM-NNN`, `SA-TCH-NNN`) are allocated by trusted server code using Firestore transactions against `systemCounters`. Student year is calculated in `Asia/Karachi`. A successful counter increment is never rolled back or reused, even if later account creation fails; gaps are acceptable. Browser clients cannot read or write counters.

## 3. Identity, roles and class authorization

- Firebase Authentication proves who signed in; it does not determine their application role.
- On each protected request, verify the Firebase ID token (including revocation where supported), load `users/{uid}`, and reject missing, inactive or invalid-role accounts.
- For a teacher request scoped to a class, verify an active `classAccess` record with `accessType: "teacher"` for that UID and class. For subject-specific teaching or editing, also verify an active `teachingAssignments` record matching the teacher UID, class ID and subject ID.
- For a student request, verify an active `classAccess` record with `accessType: "student"`; then constrain all student data reads to the authenticated UID.
- Never accept `role`, `studentUid`, `teacherUid`, approval identity or audit actor identity as authoritative from request bodies. Derive them from the verified session.
- Only an admin may create/deactivate users, assign roles, create classes, grant/revoke class access, and create/change/deactivate teacher subject assignments. The last active admin must not be deactivated or demoted.
- **CONFIRMED — Multiple subjects per teacher:** An administrator may assign multiple subjects to the same teacher, including across different classes/grades. Each assignment is a separate `teachingAssignments` record tied to a specific teacher, class and subject. A teacher may act only within the exact active class/subject combinations assigned; assigning one subject does not imply access to other subjects in that class.
- A teacher must not gain access to another class by changing a URL, query parameter or request body.

## 4. Student sign-in identity

- **CONFIRMED — SID-based student login:** Students sign in using their permanent academy-generated Student ID (SID) and password, not a real email address. The administrator creates each student account.
- **CONFIRMED — Internal Firebase email alias:** To use Firebase Authentication email/password accounts without requiring students to own or verify an email address, generate a unique internal alias from the SID. Example: SID `SA-2026-001` maps to `sa-2026-001@stemacademy.edu.pk`. Teacher and administrator aliases use the same domain. Do not use a student's real name in the alias. The alias is an authentication identifier, not a contact address; do not assume mailbox or email-delivery services are configured.
- The student-facing login form accepts SID and password. The frontend converts the normalized SID to the deterministic internal alias before calling Firebase Authentication; the password is passed only to Firebase Authentication over its supported secure SDK/API flow. Never store or log the password.
- The alias is an authentication identifier, not a contact address. Do not send verification, password-reset or other email to it. Do not display it as the student's contact email.
- Store the alias in the trusted user record as `authEmail` (or derive it consistently from the canonical SID); the canonical SID remains the academy-facing identifier. Enforce uniqueness and immutable SID assignment on the server.
- **Pre-implementation compatibility gate:** Before committing to this design in a live Firebase project, test whether Firebase Authentication accepts the approved `stemacademy.edu.pk` domain for email/password account creation and sign-in. Use only a separate test Firebase project and synthetic test accounts. Domain registration alone does not prove Firebase compatibility or email-delivery configuration. If Firebase rejects it, stop and return to design review; do not silently substitute another domain.
- Real contact email is not required for student account creation or login. If the academy later wants to store an optional contact email, approve that as a separate privacy decision; it must not be used for authentication or recovery by default.
- The administrator creates the student account, verifies the student's identity through the academy's in-person process, and activates the account. Student email verification is not required.

## 5. Account password recovery

- **CONFIRMED — Recovery method:** Password recovery is admin-assisted. A student contacts the teacher/admin, who verifies the student's identity through an appropriate in-person or otherwise pre-established trusted process before initiating recovery.
- Recovery must use a secure, admin-only Firebase Authentication recovery flow. Do not ask an admin to view, choose, or store a student's permanent password; do not store passwords or reset secrets in Firestore, application logs or audit metadata.
- Because email delivery is excluded from the current scope, the exact secure hand-off of a Firebase-generated password-reset action link/code must be designed and tested before implementation. Do not send it through an unapproved channel or expose it in logs.
- Record the recovery action, initiating admin and timestamp in the audit log, without recording the reset link/code or password.

## 6. Sensitive assessment workflow

1. An assessment version is immutable once used by an attempt. Changes create a new version.
2. Answer keys are stored separately from student-visible question content.
3. The API returns only the version fields needed by the student. It never serializes answer-key documents into student responses.
4. A student can submit only an attempt belonging to their own UID and an assessment assigned to their active class.
5. **CONFIRMED — Retake policy:** A student receives one initial attempt. Every additional attempt requires explicit teacher/admin approval before it is available. Store the approval actor and timestamp for each approved retake.
6. Teacher/admin approval of a calculated result and publication to students are separate actions. Approval alone does not make marks visible.
7. Results remain hidden until an authorized teacher/admin performs the separate publish/release action. Student result endpoints return only the authenticated student's published results.
8. Never trust a score, pass/fail flag, approval state or answer key sent by the browser; calculate and approve on the server.

The attempt count, retake approval details and result-release workflow must be covered by automated tests before real use.

## 7. Assignment workflow

- Physical task assignments record teacher review/completion; students do not upload files.
- Online activity assignments may reference a short assessment (maximum 10 questions). **CONFIRMED — Passing threshold:** The default passing mark is 70%. The teacher may adjust the passing threshold for each individual activity. Store the effective threshold with the activity/version so later changes do not silently alter the interpretation of an existing attempt.
- **CONFIRMED — Completion approval:** Passing an online activity does not automatically complete the assignment. A teacher/admin must review and explicitly approve completion before the assignment is marked complete. This decision was confirmed by the project owner on 8 November 2026.
- Opening an external resource is not proof that it was read or watched.
- Assignment records are per student, even when the assignment is distributed to a whole class.

## 8. Attendance and dates

- Store the attendance date as a date-only value in the academy's approved timezone, not as a browser-local timestamp.
- Store server-generated `createdAt`/`updatedAt` timestamps separately from the attendance date.
- One student should have at most one effective attendance record per class/date. Corrections update the current value and preserve who changed it, when, and the prior value.
- Attendance calculations must exclude non-attendance days.
- **CONFIRMED — Academy timezone:** Use Pakistan Standard Time, IANA timezone `Asia/Karachi` (UTC+05:00), for attendance dates, assignment deadlines and assessment schedules. Store absolute event timestamps consistently (UTC/server timestamps) and interpret/display academy calendar dates and times in `Asia/Karachi`.

## 9. Audit and privacy

Audit critical account, class, attendance, assignment, assessment, result-release and settings changes. Logs must be append-only through application code and must not contain passwords, bearer tokens, private keys, full assessment answer payloads or unnecessary personal details. Record enough safe metadata to identify the actor, action, target and time. Define retention and backup procedures before production; do not configure automatic deletion.

## 10. Indexes and query strategy

The current `firestore.indexes.json` is intentionally empty. Add composite indexes only when implemented API queries require them. Likely query patterns include:
- active class access by `userUid + accessType + active`;
- teacher teaching assignments by `teacherUid + classId + subjectId + active`;
- class assignments by `classId + publicationState + dueDate`;
- student assignment records by `studentUid + status + updatedAt`;
- attendance by `classId + attendanceDate` and by `studentUid + attendanceDate`;
- assessments by `classId + publicationState + scheduledAt`;
- released results by `studentUid + releasedAt`;
- audit logs by `targetType + targetId + createdAt` or `actorUid + createdAt`.

These are candidate query patterns, not a final index list. Validate each index against actual queries and Firestore emulator tests. Keep result sets bounded and paginate.

## 11. API authorization checklist

Every endpoint must specify:
- authentication required or public;
- allowed role(s);
- class-scope check where applicable;
- ownership check for student records;
- allowed fields and validation limits;
- whether the operation writes an audit event;
- whether the response contains private, unpublished or answer-key data.

The current API contains only health and authenticated-session routes. This document does not imply that the collections, workflows or endpoint authorization have been implemented.

## 12. Decisions still required before database setup

The following must be confirmed or explicitly accepted as launch blockers:
1. **CONFIRMED — Staff accounts and subject permissions:** Use separate administrator and teacher accounts for two different staff members. The admin has academy-wide administration permissions; each teacher is limited to explicitly assigned classes and subjects. The administrator may assign multiple subjects to one teacher, including across grades/classes; permissions are granted and checked per teacher/class/subject combination.
2. **CONFIRMED — Result visibility:** Students may see assessment marks only after a teacher/admin separately publishes/releases the result. Teacher approval alone is not sufficient. This decision was confirmed by the project owner on 8 November 2026.
3. **CONFIRMED — Assignment completion:** Passing an online activity does not automatically change the assignment to complete; teacher/admin review and explicit approval are required.
4. **CONFIRMED — Assessment retakes:** One initial attempt is allowed; every additional attempt requires explicit teacher/admin approval.
5. **CONFIRMED — Online activity passing threshold:** The default passing mark is 70%, and the teacher may adjust it for each individual activity. The effective threshold must be recorded with the activity/version and applied consistently to attempts.
6. **CONFIRMED — Student password policy:** Passwords must contain at least 10 characters. Do not impose arbitrary periodic password expiry. Students may change their own password after signing in; an administrator may reset it after in-person identity verification using the approved temporary-password process. Enforce password changes server-side and never log passwords.
- **CONFIRMED — Password recovery:** Admin-assisted recovery. The student contacts the teacher/admin, who verifies identity and initiates a secure admin-only recovery process. The no-email constraint means the safe reset-link/code hand-off still needs to be designed and tested before implementation.
7. **CONFIRMED — Academy timezone:** Pakistan Standard Time (`Asia/Karachi`, UTC+05:00). Calendar dates and scheduled times use this academy timezone; store absolute timestamps consistently using UTC/server timestamps.
8. **CONFIRMED — Academic sessions and rollover:** Annual sessions are named by calendar year (for example, `2026`, `2027`), with separate Grade 9 and Grade 10 classes in each session. At the start of a new session, the administrator manually reviews and confirms each student's placement: Grade 9 students who pass move to Grade 10; Grade 9 students who repeat remain in Grade 9; Grade 10 students who complete the year are archived; transferred students are marked inactive. No automatic promotion or archival is permitted. The permanent Student ID never changes. Historical class membership, attendance, assignments and results remain preserved.
9. **CONFIRMED — Student identifier:** Generate a permanent academy ID in the format `SA-YYYY-NNN` (for example, `SA-2026-001`) on the trusted server, where `YYYY` is the student's first enrollment/ID-issuance year. IDs must be unique academy-wide, non-editable by students and must not be based on national identity numbers.
10. **CONFIRMED — Minimum student profile:** Full name, academy-generated Student ID, internal Firebase authentication alias, grade/class association and active/inactive status only. A real contact email is not required. If later approved, an optional contact email is stored separately and is not used for login or recovery by default. Grade/class association is maintained through trusted class records/access. No guardian details, phone numbers, home addresses, identity numbers, photographs or other extra personal fields by default.
11. **CONFIRMED — Student login:** Students sign in using their SID and password. The administrator creates and activates accounts after in-person identity verification. The frontend maps the SID to a deterministic internal Firebase alias such as `sa-2026-001@stemacademy.edu.pk`; no email verification or email delivery is assumed. Firebase acceptance of the approved domain must be proven with synthetic accounts in a separate test project before implementation. If rejected, pause for design review.
12. **CONFIRMED — Email verification:** Student email verification is not required. The internal alias is not a real contact address. Password recovery remains admin-assisted.
13. **CONFIRMED — Backup approach:** The administrator may export a backup on demand; the system should remind the administrator to perform one at least weekly. Backups include student records, class/session data, attendance, assignments, assessments, results and necessary academic history. Exclude passwords, authentication tokens, reset links, private keys and service credentials. Export format, secure storage/access protection and restore procedure must be defined, and restoration must be successfully tested before real student data is introduced.
14. **CONFIRMED — Retention policy:** Retain records indefinitely by default; archive inactive students and preserve historical attendance, assignments and results with access restricted to authorized staff. This remains subject to applicable privacy/legal requirements and approved deletion requests.
15. **PROVISIONALLY SELECTED — Hosting provider:** Netlify Free, subject to account eligibility, current 300-credit usage model, supported Node.js runtime, deployed test, Firebase integration and realistic usage verification before production.
16. **CONFIRMED — Student performance indicators:** Teachers define the attendance and assessment thresholds used to flag students who may need additional academic support. Flags are advisory prompts for teacher review only; they must not trigger automatic disciplinary action, student restrictions, or consequential decisions. Thresholds must be visible, editable by authorized teachers/admins, and documented with their effective dates.

Do not create a production Firebase project, enable student access, import real records or deploy this schema until the relevant decisions and provider constraints are reviewed.

## 13. Hosting decision — provisional

- **PROVISIONALLY SELECTED — Netlify Free:** The project owner selected Netlify Free as the preferred hosting option on 8 November 2026, subject to verification before any production deployment.
- Netlify currently advertises its Free plan at $0 with a 300-credit monthly limit. Current credit documentation lists 15 credits per production deploy, 20 credits per GB of bandwidth, 10 credits per GB-hour of compute, and 2 credits per 10,000 web requests. Web requests include pages, assets and API/function requests. When the monthly limit is reached, sites are paused until the next billing cycle; the Free plan has hard limits and cannot incur overage charges. This means production deployments and normal traffic consume the same finite monthly allowance, so usage must be monitored.
- Netlify's Functions documentation currently lists a 60-second synchronous execution limit, 1 GB default memory, 6 MB buffered request/response payload, and a Node.js runtime based on the build Node version when that version is a supported AWS Lambda runtime. Netlify announced Node.js 24 as the default for new sites created from 7 July 2026. The repository currently declares `node >=22`; the exact build/runtime version must be pinned and verified with a deployed test function before production.
- The current repository configuration (`netlify.toml`) publishes `public`, builds functions from `netlify/functions`, and routes `/api/*` to the API function. This is structurally aligned with Netlify's static hosting plus Functions model, but deployment, Firebase Admin credentials, cold-start behavior, limits and end-to-end authentication have not been tested on Netlify.
- **Before approval:** verify account/team eligibility and current dashboard terms; pin a supported Node runtime; deploy only a non-production test site; test the API and Firebase Admin initialization using a separate test Firebase project; measure realistic usage; confirm the site pauses safely at the free limit; and document a no-cost rollback/hosting alternative. Do not enable real student access or deploy production data until these checks pass.
- Official references checked 8 November 2026: [Netlify pricing](https://www.netlify.com/pricing/), [How credits work](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/), [Functions configuration and Node.js runtime](https://docs.netlify.com/build/functions/configuration/), [Node.js 24 default announcement](https://www.netlify.com/changelog/2026-07-07-nodejs-24-default-new-sites/).

## 14. Student performance indicators

- **CONFIRMED — Teacher-defined support indicators:** Authorized teachers define attendance and assessment warning thresholds. The initial recommended examples are attendance below 75% and assessment performance below 40%; these are configurable examples, not universal defaults. Teachers may set the review period, with the current academic month as the recommended starting period. The system may flag students for teacher review when the configured thresholds are met.
- **CONFIRMED — Minimum evidence before flagging:** Do not calculate/show an attendance warning until at least 5 attendance days are recorded in the selected period. Do not calculate/show an assessment warning until at least 2 graded assessments are recorded in the selected period. If the minimum is not met, show that there is insufficient data rather than a warning.
- A flag is an advisory support signal, not a diagnosis, grade, disciplinary finding or automatic decision. The flag should show the selected observation period and the underlying attendance/assessment values. A teacher must review the underlying records and decide whether any supportive action is appropriate.
- Do not automatically penalize students, change marks, restrict access, notify guardians or label students as failing/risk categories solely because a threshold was crossed.
- Store the threshold settings, who changed them and when. Show the underlying attendance/assessment period and values alongside each flag so staff can interpret it fairly.
- **CONFIRMED — Recalculation timing:** Recalculate support indicators whenever a relevant attendance or assessment record changes, and whenever a teacher changes the applicable threshold or review period. Recalculation is request/event-driven within normal API operations; do not introduce cron jobs, scheduled functions, polling or background workers.

## 15. Academic-session rollover procedure

1. The administrator creates the next calendar-year academic session and its Grade 9 and Grade 10 classes.
2. The administrator reviews each current student's year-end outcome and selects the next placement: Grade 9 to Grade 10 (pass), Grade 9 repeat, Grade 10 completion/archive, or transfer/inactive.
3. The system must show a review/confirmation summary before applying any changes. The administrator confirms the batch explicitly; no placement is applied automatically based only on marks or attendance.
4. Promotion/repetition creates the student's new active class association for the new session. It must not overwrite or delete the previous session's class membership or records.
5. Grade 10 completion archives the student's active academy status while preserving all historical records. A transferred student is marked inactive and likewise retains historical records.
6. The permanent academy SID remains unchanged for promotion, repetition, transfer and archival. An archived or inactive SID is never recycled.
7. The operation must be auditable, idempotent or safely resumable, and tested for partial failures before production use.

## 16. Implementation sequence after approval

1. Confirm the open decisions and finalize this model.
2. Add schema validation helpers and role/class authorization helpers.
3. Add API routes one module at a time, with tests for allowed and denied cases.
4. Add Firestore Emulator configuration and rules/API integration tests.
5. Add indexes only for verified query patterns.
6. Review privacy, backup, retention and recovery procedures.
7. Only then configure a separate test Firebase project; production setup remains a later, explicit milestone.


## Login protection

**CONFIRMED — Login protection:** After 5 consecutive failed sign-in attempts, temporarily lock the student account for 15 minutes. An administrator may unlock it earlier only after verifying the student's identity in person. Track failed attempts and lockout state securely on the server; do not trust client-side counters, expose account-sensitive details in login errors, or log passwords. Apply rate limiting to reduce automated guessing and test lockout, expiry and admin-unlock behaviour.


## Staff password policy

**CONFIRMED — Staff password policy:** Administrator and teacher passwords must contain at least 12 characters. Do not impose arbitrary periodic password expiry. Only the administrator may reset a teacher's password; staff reset procedures must use a secure, verified administrative handoff and must never expose or log passwords. Staff must be required to change any temporary password at next sign-in. The administrator's own recovery must use a separately documented owner-verification/recovery procedure to avoid lockout of the academy.


## Administrator account recovery

**CONFIRMED — Owner-verified administrator recovery:** If the administrator is locked out or loses access, recovery must be handled through an in-person identity check by the academy's designated owner/authority, using a documented identity-verification procedure independent of the locked administrator account. After verification, an authorized project owner/technical custodian uses the official Firebase project administration interface to reset or restore access to the administrator account. The administrator must set a new password at next sign-in where the chosen reset method supports that control. Do not send recovery secrets through email or ordinary messaging, and never record passwords, reset links, recovery codes or provider credentials in application data or audit logs. Maintain any provider/project-owner recovery credentials outside the LMS in a separately secured, access-controlled offline recovery record. Record only the recovery event, verifier, authorized operator and timestamp. The exact operational steps and access-control arrangement must be rehearsed with synthetic accounts in the test environment before production; ensure the academy is not dependent on the single administrator account for Firebase project ownership.


## Staff account identifiers and provisioning

**CONFIRMED — Staff sign-in and account creation policy:** Each staff member has a separate account and a unique academy-issued Staff ID. Administrator and teacher sign in using Staff ID and password; no shared staff credentials and no self-registration. The academy owner/designated authority provisions the first administrator account. The administrator creates, assigns the role to, and activates teacher accounts. Staff Firebase Authentication may use a deterministic internal email alias derived from the Staff ID, subject to a separate synthetic-account compatibility test in the test Firebase project. The alias is an authentication identifier only, not a contact address; no email verification or email delivery is required. Do not invent a deliverable address or silently change the alias design if Firebase rejects the reserved domain; pause for review. Only the administrator may reset a teacher password under the approved in-person/verified process. The administrator's own recovery follows the separately approved owner-verified recovery procedure. Staff IDs must be unique, immutable after issuance, and must not contain sensitive personal information.


## Staff login protection

**CONFIRMED — Staff login protection:** Apply the same threshold to administrator and teacher accounts: after 5 consecutive failed sign-in attempts, temporarily lock the account for 15 minutes. The academy owner/designated authority may restore a locked administrator account after independent identity verification. Only the administrator may unlock a teacher account after verifying the teacher's identity. Enforce attempt counting, lockout and unlock authorization on the trusted server; do not rely on browser counters or reveal account existence in login errors. Apply additional rate limiting against automated guessing and test lockout, expiry, administrator unlock and owner-authorized administrator recovery with synthetic accounts. Record security events without logging passwords or recovery secrets.


## Staff ID format

**CONFIRMED — Staff ID format:** The administrator receives a system-generated ID in the format `SA-ADM-001`. Teachers receive system-generated IDs in the format `SA-TCH-001`, `SA-TCH-002`, and so on. Staff IDs are unique across the academy, permanent, immutable after issuance and never reused. The server must allocate IDs safely under concurrent account creation; clients must never choose or edit an ID. Keep the staff ID separate from the Firebase Auth UID and internal authentication alias. The transaction-safe allocator is implemented in `netlify/functions/lib/id-allocator.mjs`; emulator tests cover concurrent issuance, prefixes, timezone year boundaries and invalid staff roles. Account-creation workflows must call this allocator server-side and must not accept a client-supplied ID.


## 13. Newly approved operating policies

**POLICY APPROVED — 8 November 2026.** The project owner approved all seven remaining policy proposals exactly as presented.

### 13.1 Assignment deadlines
- Teachers set assignment deadlines in the academy timezone, `Asia/Karachi`.
- Students may submit up to and including the stated deadline. The server clock, not the student's device clock, determines whether a submission is on time.
- Late submissions are blocked by default.
- A teacher may extend a deadline for an individual student or the whole class.
- Every deadline change is recorded in the audit log.

### 13.2 Assessment opening, closing and duration
- Teachers may set an opening date/time and a closing date/time in `Asia/Karachi`.
- Students cannot start before opening or after closing.
- If an assessment has a time limit, the server enforces it.
- An attempt ends at whichever comes first: the student's time limit or the assessment closing time.
- Every additional attempt remains subject to the approved teacher/admin approval policy.

### 13.3 Attendance corrections
- Teachers may mark and correct attendance for their assigned classes; administrators may do so for any class.
- A correction requires a reason.
- Preserve the previous value, corrected value, actor and timestamp in the correction history/audit trail.
- Students cannot edit attendance.

### 13.4 Communication and notices
- Communication is through notices inside the LMS only.
- Teachers may publish notices to their assigned classes; administrators may publish academy-wide notices.
- Students may read notices and mark them as read.
- Excluded: email, SMS, WhatsApp integration, private chat, file attachments and external notification services.

### 13.5 Exceptional technical problems
- If the LMS or internet connection prevents a student from submitting work, the teacher may grant an extension or reopen the activity.
- The teacher records the reason.
- Preserve the original attempt and its history.
- A technical problem must not automatically change marks or attendance.

### 13.6 Backup protection
- The system generates a downloadable backup of academic records and excludes passwords, tokens, authentication credentials and private keys.
- Encrypt the backup before download. The academy controls the encryption passphrase and stores it separately from the backup.
- Store backups in an academy-controlled, access-restricted location.
- Only the administrator may initiate restoration.
- Test restoration using synthetic records before introducing real student data.
- This policy does not assume that a provider-managed backup/export feature is available on a free plan; the technical implementation must be verified.

### 13.7 Zero-cost service limits
- Use Firebase Spark and Netlify Free only.
- Never automatically upgrade to a paid plan.
- Do not add a billing account or paid API without the project owner's explicit approval.
- If a free-tier limit is reached, warn the administrator and safely stop or restrict affected operations rather than silently losing records.
- Do not promise unlimited availability, capacity or storage.

These policies are approved for implementation planning. They do not mean the corresponding features have already been implemented or tested.
