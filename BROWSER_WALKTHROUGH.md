# Phase 4 Browser Walkthrough

**Status: Pending.** No authenticated browser walkthrough is claimed.

Use only Firebase Auth/Firestore emulators, `demo-stem-academy`, and synthetic administrator, teacher and student accounts. Complete the checklist in `docs/PHASE4_BROWSER_WALKTHROUGH.md` after installing dependencies, building the emulator-only client bundle and starting the local development server. Record actual PASS/FAIL outcomes; do not mark API tests as browser verification.

## Phase 5 walkthrough — pending

No authenticated browser session was available in this execution, so the Phase 5 UI is not reported as browser-verified. After starting only the `demo-stem-academy` Auth/Firestore emulators and local Netlify development server, verify:

### Administrator
- Open Subjects & Topics; confirm class and subject selectors load from API.
- Create a chapter draft and topic draft; confirm both remain unverified/unpublished.
- Confirm source title, publisher and edition are required to verify; confirm topic publication is blocked until its parent chapter is published.
- Confirm editing a draft resets verification and that published curriculum is immutable.
- Open an assignment, review a student's text submission, save feedback and a grade.

### Teacher
- Confirm only assigned classes/subjects are available.
- Confirm only published and verified curriculum is visible.
- Create/publish an assignment, view submissions only for the assigned scope, and provide feedback/grade.
- Confirm unassigned class/subject submission records return not-found.

### Student
- Confirm only own class/subject curriculum is visible and draft/unverified curriculum is hidden.
- Submit text to a published assignment, view own submission/revision/feedback/grade, and resubmit before deadline while ungraded.
- Confirm another student's submission is never returned; graded, closed and overdue submissions cannot be changed.
- Confirm no file-upload control is present.

Record actual outcomes and screenshots only after the walkthrough is performed. Automated unit tests are not browser walkthrough evidence.

## Phase 7 walkthrough — pending

Status: **NOT EXECUTED.** No browser session or Firebase emulator was available in the sandbox. Use only the `demo-stem-academy` Auth/Firestore emulators and synthetic accounts. Record PASS/FAIL and non-sensitive console/network errors; do not paste tokens or passwords.

### ChitChat — all roles

- Administrator: open ChitChat, choose each active class, send a message, reply, edit within 10 minutes, inspect edit history, soft-delete a message, submit/review a report and resolve/dismiss it.
- Teacher: confirm only assigned active classes appear; send/reply; confirm another class is inaccessible; review reports and moderate messages only in assigned classes.
- Student: confirm only enrolled active classes appear; send/reply; verify own message editing; verify another student's message cannot be edited/deleted/moderated; report a message.
- Two students in the same class: confirm read state is individual; reading on one account does not mark the message read for the other account.
- Typing: confirm the other class member sees a temporary typing indicator and it disappears after expiry.
- Dashboard (admin, teacher, student): send an unread message from another account; confirm DASH-09 count increases only for users in the permitted active class scope; read it as one user and confirm only that user's count decreases.
- Search/date separators/HTTPS attachment link: verify latest-100 search, date grouping and secure external link behaviour; confirm there is no binary upload control.
- Confirm polling refresh works and note that it is five-second polling, not push/WebSocket delivery.

### Existing critical LMS workflows

Complete the administrator, teacher and student steps in `LOCAL_MACHINE_VERIFICATION_GUIDE.md`, including assessment answer-key isolation, one-attempt/approved-retake rules, first-password flow, attendance permissions, assignment submission privacy, inactive-class notices and audit logs. The browser must be exercised under all three roles; API/unit tests are not browser evidence.
