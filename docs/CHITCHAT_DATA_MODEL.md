# Module 7 — ChitChat

**Implementation status:** Core server and browser workflows implemented; emulator and authenticated browser verification pending.

## Scope recovered from the approved handover

The approved 16-item scope is: modern chat interface; real-time messaging; replies; controlled editing; edit history; deletion with audit records; individual read tracking; typing indicators; message search; date separators; notifications; attachments within existing/free-service constraints; moderation tools; class permissions; reporting; dashboard integration and performance/security optimisation.

## Architecture and limits

- Existing vanilla JavaScript page at `public/chitchat.html`; browser logic in `public/assets/js/chitchat.js`.
- Authenticated Netlify API at `/api/chitchat...`; trusted role and UID are derived from the existing Firebase authentication middleware.
- Existing Firebase Admin SDK / Firestore; no direct browser Firestore access and no new paid service or package.
- Message refresh uses authenticated polling every five seconds. It is near-real-time, not a WebSocket or native Firestore live listener.
- The message view/search window is the latest 100 messages per class. Search is bounded to that window; historical full-text search/pagination is not yet implemented. Dashboard unread counts scan at most the latest 500 messages and read receipts per class to bound reads; a full-history unread counter is not yet implemented.
- Attachments are optional HTTPS links only. Binary uploads are not supported because Firebase Storage and other external storage services are outside the approved zero-cost architecture.
- Notifications are in-app unread counts through DASH-09. No email, SMS, browser push or external notification provider is configured.

## Collections

| Collection | Purpose | Key fields |
|---|---|---|
| `chatMessages` | Class messages | `classId`, `senderUid`, `senderName`, `text`, `replyTo`, `attachmentUrl`, `createdAt`, `editedAt`, `deletedAt`, `moderated` |
| `chatReads` | Per-user read receipt | `messageId`, `classId`, `userUid`, `readAt`; document key is message + user |
| `chatMessageHistory` | Previous text versions | `messageId`, `classId`, `editorUid`, `previousText`, `editedAt` |
| `chatTyping` | Short-lived typing state | `classId`, `userUid`, `displayName`, `expiresAt` (15 seconds) |
| `chatReports` | User-submitted moderation reports | `messageId`, `classId`, `reporterUid`, `reason`, `status`, `createdAt`, review fields |
| `auditLogs` | Append-only server audit events | Existing audit schema; ChitChat edit/delete/moderation/report-review events are recorded |

All collections are accessed only through authenticated API routes. `firestore.rules` remains deny-all for browser/client reads and writes. The server validates active class status and then enforces active student membership or active teacher class/subject assignment. Administrators may act across active classes.

## API

- `GET /api/chitchat?classId=...` — latest 100 messages and the caller's own read state.
- `POST /api/chitchat/messages` — send a message/reply; text 1–2000 chars; optional HTTPS attachment URL.
- `PATCH /api/chitchat/messages/:id` — author-only edit within 10 minutes; old text and audit entry are committed with the update.
- `DELETE /api/chitchat/messages/:id` — author or staff soft-delete; audit entry committed with the update.
- `GET /api/chitchat/messages/:id/history` — class-authorised edit history.
- `POST /api/chitchat/messages/:id/read` — write an individual user read receipt.
- `POST /api/chitchat/messages/:id/moderate` — staff-only hide/moderation action.
- `POST` / `GET /api/chitchat/typing` — update/read expiring class typing indicators.
- `POST /api/chitchat/reports` — submit a report.
- `GET /api/chitchat/reports?classId=...` — staff-only class report queue.
- `PATCH /api/chitchat/reports/:id` — staff-only resolve/dismiss.

## DASH-09

`GET /api/dashboard` includes `metrics.unreadMessages` for admin, teacher and student roles. Counts are computed only across active classes in the caller's permitted scope and exclude the caller's own messages, deleted messages and that user's read receipts. The dashboard displays the metric separately for each role.

## Security and regression coverage

The route uses server-derived identity; validates class membership/teaching assignment on every operation; does not accept client-supplied sender identity or role; limits text, identifiers and attachment URLs; protects report/moderation endpoints; and writes edit/delete/moderation audit entries in the same Firestore transaction as the change. Regression tests are in `tests/api/chitchat.test.mjs`.

Emulator transactions, deployed Firestore indexes, browser accessibility/responsiveness and real three-role workflows remain pending local verification.
