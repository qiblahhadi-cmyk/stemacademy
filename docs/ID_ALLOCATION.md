# STEM Academy — ID Allocation Implementation

**Status:** Implemented helper; Firebase Emulator integration tests added. Not yet connected to account-creation routes and not production-ready.

## Approved formats

- Student: `SA-YYYY-NNN`, where YYYY is the year of first issuance in `Asia/Karachi`.
- Administrator: `SA-ADM-NNN`.
- Teacher: `SA-TCH-NNN`.

The numeric portion is at least three digits and expands naturally beyond 999. The student year is based on the academy timezone, not the computer's local timezone or a client-provided year.

## Implementation

`netlify/functions/lib/id-allocator.mjs` exposes two server-side functions:

- `allocateStudentId(db, issuedAt?)`
- `allocateStaffId(db, staffRole)`

Both use a Firestore transaction to read and increment a fixed counter document in the server-only `systemCounters` collection. Firestore transaction conflict handling makes concurrent increments safe. Counter documents store only the next numeric value and a server timestamp.

Counter keys are separated by student issuance year, administrator and teacher. Student and staff namespaces cannot collide.

## Safety rules

1. Only trusted server code may call the allocator. Do not expose counters to browser clients or accept an ID from a request body.
2. Allocate the ID as part of a future server-side account-provisioning workflow. That workflow must persist the generated ID to the trusted user record and enforce immutability.
3. Never decrement, reset, or recycle a counter. If account creation fails after allocation, an unused number may remain; gaps are safer than reuse.
4. Treat missing counters as zero. Stop allocation if a counter is malformed or reaches JavaScript's safe-integer limit.
5. Do not use these helpers to create real student/staff accounts until the separate test Firebase project and account-provisioning security review are complete.

## Verification

`tests/firebase/id-allocator.test.mjs` is gated on both local Firebase emulators and a `demo-` project ID. It tests the Pakistan-time year boundary, 12 simultaneous student allocations, separate administrator/teacher sequences, and rejection of unsupported staff roles.

These tests must be run with Auth and Firestore emulators running. The allocator has not yet been tested against a separate hosted Firebase test project.
