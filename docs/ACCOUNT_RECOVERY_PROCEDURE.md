# Account Recovery and Administration — Phase 6 / Phase 3 (P1-5)

**Decision: no administrator password-reset or recovery endpoint was added.** Recovery stays an owner-controlled, in-person procedure. This document records why and gives the procedure to follow.

## 1. Review of the existing provisioning and credential flow

| Step | Where | Who | Credential exposure |
|---|---|---|---|
| Stage account (disabled, `pending_activation`, permanent academy ID, alias) | `POST /api/admin/accounts` | Administrator | None — no password or reset link exists |
| Issue one-time temporary password + `mustChangePassword` claim | `scripts/issue-initial-credential.mjs` | Owner / technical custodian, local shell, after in-person identity check | Printed once to the operator's terminal; never stored |
| Replace temporary password | `POST /api/auth/complete-password-change` | The account holder | Sent only over HTTPS to Firebase Admin; not stored or logged |
| Activate / deactivate | `PATCH /api/admin/students|staff/:uid`, `POST .../deactivate` | Administrator | None; Auth `disabled` kept in sync |

Findings relevant to recovery:

- Every path that sets a password is either the account holder's own authenticated action or the owner-run script. The browser-facing API never creates, returns or stores a password.
- The `stemacademy.edu.pk` login alias is not a deliverable mailbox, so standard Firebase e-mail reset links cannot reach anyone. A server-generated reset link would have to be shown to an administrator, which is a credential exposure.
- The credential script only accepts accounts that are `pending_activation` and disabled. It deliberately cannot touch an active, verified identity.

## 2. Why a reset endpoint would be unsafe here

An administrator-triggered reset endpoint must either (a) return a temporary password or reset link to the administrator's browser, (b) let one web session change another person's password without an owner-verified identity check, or (c) store a secret. Each breaks a stated requirement: no plaintext passwords displayed or stored, no unauthorised resets, owner-verified identity preserved. The administrator web role is also not the same trust level as the owner / technical custodian who holds Firebase Admin credentials.

## 3. Owner-controlled recovery procedure (manual)

Use this when a student or teacher has lost their password. Emulator/synthetic accounts only until production is separately authorised.

1. **Verify identity in person.** The designated academy authority confirms who the person is. Record who verified and when (outside the LMS, in the academy's own records). Do not accept requests by chat, e-mail or phone alone.
2. **Contain the account.** An administrator deactivates the account in *Academy Management* (this sets `active: false` and disables Firebase Auth and is audited as `students.deactivated` / `staff.deactivated`). All class memberships, attendance, assignments and results are preserved.
3. **Owner / technical custodian re-issues the credential** in a controlled local shell, using Firebase Console or Admin tooling that the owner already controls:
   - Set a new random temporary password on the existing Firebase Auth user (same UID, same permanent academy ID and alias).
   - Set the custom claim `mustChangePassword: true`, preserving other claims.
   - Keep the Auth account disabled until the handoff is in person.
   - Never paste the password into chat, e-mail, tickets or files; never redirect or record terminal output.
4. **Hand the temporary password over in person**, then enable the Auth account and reactivate the profile via *Academy Management* (audited as `students.updated` / `staff.updated`).
5. **Forced change.** The person signs in and the existing `mustChangePassword` guard sends them to `/activate-account.html`; they choose their own 12–128 character password. Ordinary API routes stay blocked until then.
6. **Review.** An administrator checks *Activity Logs* for the deactivate / update / password-change entries for that account.

Notes:

- The existing `issue-initial-credential` script is intentionally **not** extended to active accounts. Re-issuing credentials for already-verified identities is the owner's manual step above.
- Administrator account recovery follows the owner-verified procedure in `ADMIN_ACCOUNT_PROVISIONING.md` §5. The academy must not rely on a single administrator account.
- A step that cannot be completed safely (for example a half-issued credential, `credential_issuing`) requires the owner to inspect Auth and Firestore state before any retry, as already documented.

## 4. What is enforced by tests

`tests/api/account-recovery-policy.test.mjs` checks that: non-administrators cannot provision accounts; the provisioning endpoint rejects `password`, `uid` and similar fields; no reset / recovery routes exist; no route module can generate reset links or issue `mustChangePassword`; administrative account changes are audited; audit responses never contain credentials; and this procedure document contains no password-like secrets.

## 5. Observation for owner decision (not changed)

`PATCH /api/admin/students|staff/:uid {active:true}` blocks activation only while `provisioningStatus` is `pending_activation`. An administrator can still flip `active` for a profile in `credential_issuing` or `credential_issued`. Session middleware keeps such an account unusable (forced-change claim and status checks), so this is not a bypass today, but tightening the rule to "only `active` or unset statuses" would be defence in depth. It was not changed because it alters existing account-state behaviour and needs owner approval.
