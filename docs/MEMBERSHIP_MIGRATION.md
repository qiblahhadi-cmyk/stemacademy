# Membership Document IDs and Migration

## Canonical key

A `classAccess` membership document ID is now:

`ca_` + lowercase hexadecimal SHA-256 of `JSON.stringify([classId, accessType, userUid])`.

The tuple order is fixed: class ID, access type (`student` or `teacher`), Firebase UID. JSON tuple encoding avoids ambiguous delimiter-based concatenation. Use `classAccessDocumentId` from `netlify/functions/lib/authorization.mjs`; do not reimplement the key formula in application code.

## Write-path guarantees

Attendance mark/correction and assessment attempt start read the canonical membership, account-active state and class-active state inside the same Firestore transaction as the protected write. A membership deactivation racing with the operation changes a document read by that transaction, causing Firestore to retry; the retry sees inactive membership and refuses the protected write.

The administrator membership API is exposed as:

- `GET /api/memberships?classId=<classId>` — list student memberships, optionally scoped to a class.
- `POST /api/memberships` — body `{ "classId": "...", "studentUid": "..." }`; enrolls or reactivates the single canonical membership.
- `POST /api/memberships/:classId/:studentUid/deactivate` — soft-deactivates the membership.

All three routes require the authenticated server-verified administrator role. Duplicate active enrollment and repeated deactivation return conflicts. History is appended to `membershipHistory`; operational records are not deleted.

## Legacy migration

The emulator-only script `scripts/migrate-class-access.mjs` reads existing `classAccess` records, creates or verifies the canonical record, and deactivates the old document with a `migratedTo` pointer. It appends a `membership.document_id_migrated` history record. It refuses malformed records and tuple collisions.

Run only after both local emulators are started and seeded/reviewed:

```bash
FIREBASE_ADMIN_PROJECT_ID=demo-stem-academy \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
node scripts/migrate-class-access.mjs
```

The script's environment guard refuses non-`demo-` project IDs and production/live configuration. It has not yet been executed in this workspace because Firebase CLI and dependencies were unavailable. Review its output and inspect membership history in the emulator before treating migration as verified.

Do not run this script against production in Phase 6. No production migration is authorized.
