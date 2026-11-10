# Curriculum data model — Phase 5

## Guardrail

The existing static Physics chapter/topic preview was illustrative and is not an official AJK Board syllabus. It is no longer rendered as live curriculum. This release seeds **zero** chapter or topic records. The model and administration endpoints are ready, but no official content is asserted or supplied by this implementation.

## Collections

### `curriculumChapters/{chapterId}`

- `subjectId`: immutable reference to `subjects/{subjectId}`.
- `grade`: immutable integer grade; must match the active subject grade.
- `title`: chapter name supplied by an authorized administrator.
- `sequence`: non-negative ordering integer.
- `description`: optional explanatory text.
- `sourceAttribution`: nullable object with `title`, `publisher`, `edition`, optional `url`, `page`, `notes`.
- `verificationStatus`: `unverified` or `verified`.
- `publicationState`: `draft` or `published`.
- `createdBy`, `createdAt`, `updatedAt`, `verifiedBy`, `verifiedAt`, `publishedBy`, `publishedAt`.

### `curriculumTopics/{topicId}`

- `chapterId`: immutable reference to a chapter in the same subject and grade.
- `subjectId`, `grade`: repeated scope keys for efficient scoped reads; immutable and must match the parent chapter and active subject.
- `title`, `sequence`, `description`.
- `learningObjectives`: array of text objectives, each bounded in length.
- `sourceAttribution`, `verificationStatus`, `publicationState`, and lifecycle metadata as for chapters.

Content is stored separately from subject metadata. The existing `subjects` documents remain the subject catalogue, not a container for chapter/topic trees.

## Authorization and publication

- Only administrators can create or edit chapter/topic drafts, record source attribution, verify, and publish.
- Subject, grade, and topic parent chapter are immutable after creation.
- Editing a draft clears its verification state and requires a fresh verification.
- Verification records the administrator's source attribution attestation and timestamp. It does not independently prove the external document is authentic; an owner must compare the source against the current official syllabus.
- A chapter/topic cannot publish without `verified` state and source title, publisher, and edition.
- A topic cannot publish until its parent chapter is verified and published.
- Teachers and students can read only verified, published content within their class/subject scope. Administrators can inspect drafts.
- No chapter/topic documents are seeded in this phase. Do not import or publish syllabus content until the official document and edition have been supplied and reviewed.

## API

- `GET /api/curriculum/chapters?classId=...&subjectId=...`
- `GET /api/curriculum/topics?classId=...&subjectId=...`
- `POST /api/curriculum/chapters` (admin)
- `PATCH /api/curriculum/chapters/:id` (admin, draft only)
- `POST /api/curriculum/chapters/:id/verify` (admin)
- `POST /api/curriculum/chapters/:id/publish` (admin)
- Equivalent topic routes under `/api/curriculum/topics`.

Every mutation and its audit-log record are written in one Firestore transaction. Audit metadata contains identifiers and changed field names, not curriculum prose.
