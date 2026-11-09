# STEM Academy — Pre-Firebase Design Review

**Review date:** 8 November 2026  
**Branch:** `build/frontend-foundation`  
**Reviewed artifacts:** `docs/FIRESTORE_DATA_MODEL.md`, `docs/ROLE_PERMISSION_MATRIX.md` and the currently approved project scope/decisions  
**Status:** Review findings only — no Firebase project, production data or deployment was changed.

## 1. Executive assessment

The data model is a useful starting proposal and the owner has confirmed the main operating policies. It is **not yet ready to be treated as an implementation-ready or production-approved schema**.

The current application is still a frontend demonstration plus a small API foundation. The only API routes are health and authenticated-session inspection; Firestore collections and workflows have not been implemented. Firestore rules remain deny-all. The successful GitHub Actions run verifies the checks that were configured, not Firebase integration, browser behaviour, role security or production readiness.

**Recommendation:** Keep working on the development branch. Resolve the launch blockers in Section 4, then implement against a separate test Firebase project and emulator before any real student accounts or records are introduced.

## 2. Confirmed owner decisions

The following are confirmed and should be treated as requirements, not suggestions:

| Area | Confirmed rule |
|---|---|
| Staff accounts and permissions | Separate administrator and teacher accounts. The administrator may assign multiple subjects to the same teacher, across classes/grades if needed; each teacher's access is limited to the exact assigned class/subject combinations. |
| Result visibility | Marks remain hidden until a teacher/admin separately publishes/releases them. |
| Online assignment completion | Passing does not complete the assignment; teacher/admin approval is required. |
| Assessment retakes | One initial attempt; every additional attempt requires teacher/admin approval. |
| Password recovery | Admin-assisted; identity must be checked before recovery. |
| Timezone | `Asia/Karachi` (UTC+05:00). |
| Academic sessions and rollover | Annual sessions named by calendar year, with separate Grade 9 and Grade 10 classes. The administrator manually confirms promotion, repetition, Grade 10 completion/archive or transfer/inactive status; no automatic rollover. Permanent SIDs and historical records are preserved. |
| Student ID | Permanent server-generated `SA-YYYY-NNN`; year is first enrollment/ID-issuance year. |
| Student profile and login | Full name, permanent SID, internal Firebase alias, grade/class association and active/inactive status only. A real contact email is not required. Students sign in with SID and password. |
| Staff login and provisioning | Separate administrator/teacher accounts; unique academy-issued Staff IDs and Staff ID/password login; no self-registration or shared accounts. Owner/designated authority provisions the first admin; admin creates and activates teacher accounts. Internal Firebase aliases require synthetic-account compatibility testing. |
| Backups | Administrator can export on demand; weekly backup reminder; include academic records and exclude credentials/secrets; secure storage and successful test restoration required before real data. |
| Retention | Retain records indefinitely by default; archive inactive students and preserve history, subject to applicable privacy/legal requirements. |
| Hosting | Netlify Free is provisionally selected, not yet approved for production. |
| Student support indicators | Teachers define attendance/assessment warning thresholds and review periods. Suggested examples: attendance below 75%, assessment below 40%, reviewed over the current academic month. Configurable; flags are advisory only and require teacher review. |

## 3. Review findings and design corrections

### 3.1 The current document had a numbering defect

The decisions list repeated item number 8. This has been corrected in the data-model document. The student ID definition has also been clarified: the year component is the student's first enrollment/ID-issuance year, not a fresh identifier each academic session.

### 3.2 Separate academic thresholds

The model currently mentions a proposed 70% online-activity passing threshold. This must not be confused with the teacher-defined assessment threshold used to flag a student for additional support.

- **Passing threshold:** determines whether an online activity meets its completion criterion.
- **Support-indicator threshold:** prompts a teacher to review attendance or assessment evidence.

The 70% default remains unconfirmed and must not be hard-coded until approved.

### 3.3 Student ID allocation

The ID must be allocated only by trusted server code using a Firestore transaction or another concurrency-safe allocator. A simple read-then-increment operation is unsafe if two students are registered simultaneously. Enforce a unique academy-wide ID and never recycle an issued ID.

### 3.4 Student SID login and internal Firebase alias

**RESOLVED — SID login without real email verification:** The owner approved student sign-in using the permanent academy-generated SID and password. The administrator creates the account and verifies identity in person. To satisfy Firebase Authentication's email/password identity model without requiring a student's real email, the design uses a deterministic internal alias derived from SID, e.g. `sa-2026-001@stemacademy.edu.pk`. The approved alias domain is `stemacademy.edu.pk`. The alias contains no student name and is an authentication identifier, not a contact address. Do not assume that mailbox or email-delivery services are configured. Student email verification is not required. A real contact email is not required; if collected later, it must be optional and stored separately from the authentication alias.

**Technical proof still required:** Test account creation and sign-in using the approved `stemacademy.edu.pk` alias domain in a separate Firebase test project with synthetic accounts. Domain registration alone does not prove Firebase compatibility or email-delivery configuration. If Firebase rejects the alias, pause and return to design review rather than silently substituting another domain. The student login screen accepts SID and password and deterministically converts SID to the alias before Firebase Authentication sign-in. Passwords are sent only through Firebase's supported secure authentication flow and are never stored or logged.

### 3.5 Admin/teacher role model

**RESOLVED — Separate staff accounts and multi-subject assignment:** The owner confirmed two different staff accounts: one administrator and one teacher. The administrator has academy-wide user, class, settings and permission management, including the ability to assign multiple subjects to the same teacher, across different classes/grades where needed. The teacher has teaching permissions only for the exact class/subject combinations assigned by the administrator. The server must check both class access and subject-specific teaching assignments for teacher actions. Keep the roles separate; do not share credentials or grant teacher access to admin-only operations.

### 3.6 Password recovery without email delivery

The policy is approved, but the actual recovery mechanism is not. A Firebase password-reset link is useful only if there is a safe way to hand it to the student. Do not expose reset links in logs, browser history shared with other users, or an unapproved messaging channel. Before implementation, choose and test a controlled in-person/admin-assisted hand-off or a temporary-password flow with a forced password-change gate. The admin must never learn or retain a student's permanent password.

### 3.7 Academic-session rollover

**RESOLVED — Manual, administrator-controlled rollover:** The owner approved a manual process. At the start of a new annual session, the administrator reviews and confirms each student's placement: Grade 9 students who pass move to Grade 10; Grade 9 students who repeat remain in Grade 9; Grade 10 students who complete the year are archived; transferred students are marked inactive. There is no automatic promotion or archival. Student IDs remain permanent and unchanged. Prior class memberships and all historical attendance, assignments and results must remain preserved.

The implementation must provide a review/confirmation summary, safely handle partial failures, prevent duplicate processing, and write audit events. A new session's class association is added without overwriting the previous session's records.

### 3.8 Manual backup and restoration

**RESOLVED — Backup policy:** The administrator may export a backup on demand and should receive a reminder to perform one at least weekly. Include student records, class/session data, attendance, assignments, assessments, results and necessary academic history. Exclude passwords, authentication tokens, reset links, private keys and service credentials. The export format, secure storage location, access protection and restore procedure still need technical design. Do not assume a provider-managed backup/export feature is available on the free plan. Test a full restoration successfully before introducing real student data; a backup that has never been restored in a test is not a verified recovery plan.

### 3.9 Netlify Free remains conditional

The repository configuration is structurally compatible with static hosting plus Netlify Functions, but it has not been deployed or tested there. Pin an exact supported Node.js runtime rather than relying on `node >=22`; test Firebase Admin initialization, function limits, authentication, cold starts, usage and monthly credit consumption on a non-production site. Do not treat the free tier as unlimited or guaranteed uptime.

### 3.10 AJK Board curriculum accuracy

The current Subjects & Topics interface contains illustrative syllabus content. It has not been validated against the official AJK Board Physics syllabus. Do not present it as authoritative curriculum until each class/grade chapter and topic is checked against an approved source.

### 3.11 Authorization and abuse controls

Because the API uses Firebase Admin SDK, Firestore rules do not protect API operations. Every endpoint must check the caller's trusted account status, role, class membership and record ownership. Also define request-size limits, validation, safe error responses and a practical rate-limiting strategy that does not introduce paid services. In-memory per-function rate limiting alone is not a reliable global control across serverless instances.

### 3.12 Audit and privacy

Audit records should be append-only through application code, but the model should also define who can read them, which events are mandatory, how metadata is minimized, and how audit exports are protected. The indefinite-retention policy must remain subject to applicable privacy/legal requirements and a controlled correction/deletion request process.

## 4. Launch blockers to resolve before Firebase setup

These are the remaining questions or technical proofs. They are not reasons to stop development of the static interface, but they must be resolved before real student access or production data.

| # | Blocker | Required resolution |
|---|---|---|
| 1 | Firebase alias compatibility | Test whether Firebase Authentication accepts the approved `stemacademy.edu.pk` domain for email/password account creation and sign-in using synthetic accounts in a separate test project. If rejected, pause for a revised design. |
| 2 | Password recovery hand-off | **POLICY APPROVED:** student resets are handled by the administrator in person using a temporary password and forced change at next sign-in. Administrator-account recovery requires owner/authority identity verification and a separately secured project-owner/technical-custodian procedure through the official Firebase project administration interface. Implement and rehearse both procedures with synthetic accounts; keep recovery secrets outside the LMS and out of logs. |
| 3 | Session rollover implementation | Implement and test the approved manual administrator workflow, including confirmation summary, historical record preservation, audit events and safe retry/partial-failure handling. |
| 4 | Student ID allocator | Implement and test transaction-safe, never-recycled ID issuance. |
| 5 | Support-indicator rules | **POLICY APPROVED:** teachers configure attendance/assessment warning thresholds and review periods; suggested examples are below 75% attendance, below 40% assessment performance, and the current academic month. Minimum evidence: 5 recorded attendance days for attendance warnings and 2 graded assessments for assessment warnings within the selected period. Below minimums, show insufficient data. Flags are advisory only. **RESOLVED — Recalculation:** recalculate when relevant attendance or assessment records change, and when a teacher changes a threshold or review period. Use normal API operations only; no cron jobs, scheduled functions, polling or background workers. |
| 6 | Backup/restore | **POLICY APPROVED:** on-demand admin export, weekly reminder, include academic records, exclude credentials/secrets. Technical design still required for export format, secure storage/access protection and a tested restore procedure before real data. |
| 7 | Netlify runtime and free-tier proof | Pin exact Node.js version and complete a non-production deployment/usage test. |
| 8 | Firebase test environment | Create a separate test project only after the preceding choices; use no real student data. |
| 9 | Time/date behaviour | Define how due dates and scheduled assessments behave at day boundaries in `Asia/Karachi`, including late submissions and edits. |
| 10 | API rate limiting | Choose a workable no-cost strategy and test abuse/limit behaviour. |

## 5. Scope conflicts to keep out of the current build

A prior Library prompt describes a much larger 15-module incremental upgrade, preservation of an existing production database, Vercel Hobby hosting, chat, uploads/imports and other features. The current project direction is a rebuild with a narrower approved scope, Netlify Free as the provisional host, and explicit exclusions such as paid services, file uploads, Cloud Functions and background jobs.

That older prompt must not silently override the later approved STEM Academy Master Specification and the owner's subsequent decisions. If any old feature is to be restored, it needs explicit scope approval and a compatibility/security review first.

## 6. Current implementation status

| Area | Status |
|---|---|
| Frontend module pages | Demo interfaces exist; not connected to persistent data. |
| Login page | Visual/demo only; Firebase Authentication is not connected. |
| Role preview | Visual role switcher only; not a security boundary. |
| Backend API | Health and authenticated `/me` routes only. |
| Firebase Admin | Lazy initialization/authentication foundation exists; no complete application API. |
| Firestore rules | Deny all browser access; unchanged and intentionally restrictive. |
| Firestore collections | Proposed in documentation; not created or deployed. |
| Indexes | Empty; must be based on actual implemented queries. |
| Automated tests | Existing Node/API/static checks passed in the recorded GitHub Actions run; no Firebase emulator or real-browser tests yet. |
| Curriculum | Illustrative, not verified against AJK Board source. |
| Hosting | Netlify not deployed or tested. |
| Production readiness | Not ready; no real student records should be entered. |

## 7. Recommended next sequence

1. Close the remaining owner choices in Section 4, prove Firebase `stemacademy.edu.pk` alias compatibility in a test project, and implement the approved baseline in `docs/ROLE_PERMISSION_MATRIX.md`.
2. Finalize the password recovery and session rollover workflows.
3. Specify the API permission matrix and server-side validation rules.
4. Implement schema/ID allocation helpers with unit tests.
5. Configure Firebase Emulator tests and verify deny-by-default database access.
6. Build and test the first real API workflows against a separate test Firebase project.
7. Implement export/restore and verify a full test restoration.
8. Verify the AJK Board Physics syllabus against official curriculum materials.
9. Deploy a non-production Netlify test site and verify the pinned runtime and usage.
10. Only after these checks, consider a production launch review.

**Final conclusion:** The project has a solid set of owner-approved policies and a useful proposed data model. The next milestone should be design closure and test-environment preparation—not production Firebase setup or student onboarding.


### Login protection

**POLICY APPROVED:** Lock a student account for 15 minutes after 5 consecutive failed sign-in attempts. An administrator may unlock it earlier after in-person identity verification. Enforce attempt counting and lockout on the server, avoid account-enumeration clues in login errors, protect secrets from logs, and test lockout, expiry and admin-unlock behaviour. Rate limiting is also required to mitigate automated guessing.


### Staff password policy

**POLICY APPROVED:** Administrator and teacher passwords require at least 12 characters; no arbitrary periodic expiry. Only the administrator may reset a teacher password. Implement a secure verified handoff, force a change after temporary-password use, and never log passwords. The administrator's own recovery procedure remains a separate design item so the academy cannot be permanently locked out.


### Administrator account recovery

**POLICY APPROVED:** The academy owner/designated authority verifies the administrator's identity in person using a documented process independent of the locked account. An authorized Firebase project owner/technical custodian then restores administrator access through the official project administration interface. Provider/project-owner recovery credentials must be secured separately from the LMS, with an offline recovery record and restricted access. Do not send recovery secrets through ordinary email or messaging, and never store passwords, reset links, recovery codes or provider credentials in application data or logs. Record only the verifier, authorized operator, action and timestamp. The procedure must be rehearsed using synthetic accounts before production, and Firebase project ownership must not depend solely on the administrator's LMS account.


### Staff login and account provisioning

**POLICY APPROVED:** Each administrator/teacher has a separate account and unique academy-issued Staff ID; staff sign in using Staff ID and password. No shared accounts or self-registration. The academy owner/designated authority provisions the first administrator; the administrator creates and activates teacher accounts. Staff may use deterministic internal Firebase aliases derived from Staff IDs, but compatibility with the reserved non-deliverable domain must be tested using synthetic accounts in the separate test project. The alias is not a contact address and must not receive email. If Firebase rejects the domain, pause for design review. Staff IDs are unique and immutable. Teacher password resets remain administrator-only; administrator recovery follows the owner-verified process above.


### Staff login protection

**POLICY APPROVED:** Both administrator and teacher accounts are temporarily locked for 15 minutes after 5 consecutive failed sign-in attempts. The academy owner/designated authority may restore a locked administrator account after independent identity verification. Only the administrator may unlock a teacher account after identity verification. Enforce these controls server-side, avoid account-enumeration clues, add rate limiting against automated guessing, and test lockout/expiry/recovery using synthetic accounts. Never log passwords or recovery secrets.


### Staff ID format

**POLICY APPROVED:** Use `SA-ADM-001` for the administrator and `SA-TCH-001`, `SA-TCH-002`, etc. for teachers. IDs are system-generated, academy-wide unique, permanent, immutable and never reused. Implement a transaction-safe server-side allocator and test concurrent issuance before real staff accounts are created. The Staff ID is the academy-facing login identifier, not the Firebase UID or internal authentication alias.


### Newly approved operating policies — 8 November 2026

The project owner approved all seven proposals in the consolidated policy review exactly as presented:

1. **Assignment deadlines:** deadlines use `Asia/Karachi`; submissions are accepted through the exact deadline; late submissions are blocked by default; teachers may extend deadlines for an individual student or a class; server time is authoritative; all changes are audited.
2. **Assessment timing:** teachers may set opening and closing times; students cannot start outside that window; time limits are enforced by the server; an attempt ends at the earlier of its time limit or assessment closing time; retakes still require teacher/admin approval.
3. **Attendance corrections:** teachers correct attendance only within assigned classes; admins may correct any class; a reason is required; old and new values, actor and timestamp are preserved; students cannot edit attendance.
4. **Communication:** in-app notices only; teachers publish to assigned classes and admins academy-wide; students can mark notices read; no email, SMS, WhatsApp, private chat, attachments or external notifications.
5. **Technical submission problems:** teachers may extend/reopen work after a documented technical issue; preserve the original attempt/history; do not automatically alter marks or attendance.
6. **Backup protection:** downloadable academic-record backup excludes credentials/secrets, is encrypted before download, uses an academy-controlled passphrase stored separately, is kept in an access-restricted academy-controlled location, and may be restored only by the admin. Test restoration with synthetic data. Confirm technical feasibility before relying on any free provider tier.
7. **Zero-cost limits:** Firebase Spark and Netlify Free only; no automatic paid upgrade, billing account or paid API without explicit owner approval. Warn and safely stop/restrict affected operations at free-tier limits; do not promise unlimited availability or capacity.

These are owner-approved policies, not proof of implementation. Encryption, restore, server timing, audit trails and provider limits remain technical verification tasks.

### Policy closure and Firebase stage boundary

The owner has now approved the consolidated remaining policy set. Proceed to **Firebase test-stage preparation** only: local emulator configuration, a separate non-production Firebase project, synthetic accounts and compatibility/security tests. Do not create or use production student accounts, import real student records, enable production access, add billing or deploy the production system. Keep Firestore browser rules deny-all while the server API is developed and tested.
