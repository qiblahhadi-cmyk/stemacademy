# STEM Academy Login Guide — Test Environment

This guide applies only to the local synthetic emulator environment. It is not an instruction to access production.

1. Start the Auth and Firestore emulators using `npm run emulators` after dependencies are installed.
2. In a second terminal, seed synthetic accounts using `npm run seed:emulator`.
3. The seed script prints temporary test passwords once to the terminal and does not write them to disk. Treat them as test-only credentials; do not reuse them for real students or staff.
4. Build the browser bundle for emulator mode and start Netlify Dev using `npm run dev` after the required dependencies and CLI are installed.
5. Sign in with the synthetic academy ID and generated test password displayed by the seed script.

The seed currently uses the `@stemacademy.edu.pk` alias direction. This does not establish domain ownership, deliverability, Firebase production compatibility or permission to use that domain for real users. Do not enter real student/staff data. If the emulator rejects the alias, stop and document the exact error; do not silently change existing account identities or production login policy.

Administrator-created student/teacher accounts are staged disabled. After the owner/technical custodian verifies identity in person and privately hands over the one-time temporary credential, the student/teacher signs in and is redirected to `/activate-account.html` to set a personal password of at least 12 characters. The forced-change flow has unit tests but remains unverified against the Firebase emulators; do not use it for real accounts yet.
