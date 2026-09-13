# Teacher access to student homework — 2026-09-13

## Scope

Entry: My students → student/group member → Tasks. Four mutually exclusive filters: current, waiting review, clarify historical result, history. An assignment appears once; canonical V2 recipients suppress the old aggregate report by stable CRM class ID, never by title. Existing review owns new submissions and private attachments. Legacy decisions overlay the original report and preserve its text, materials and lesson rewards.

Legacy decisions: accepted, continue (reason required), obsolete (reason required). Obsolete is archived, not completed; it contributes neither to completed nor actionable counts. No fabricated mastery percentage. The student list and detail read the same stored decision. Nothing is mass-accepted, deleted, reissued or rewarded during release.

## Safety

- Teacher-only authenticated routes; reads require offline_school.read; writes also require homework.review.
- Current direct roster or own-group membership required. Foreign-teacher legacy results are read-only, except the teacher's own group. Existing topic/direction policy scopes canonical homework.
- No broader substitute access: existing lesson authorization remains unchanged.
- Missing roster denies access; missing report prevents a write. No successful empty fallback for failed reads.
- Per-student/class unique row, transaction-scoped PostgreSQL lock, optimistic revision, exact-payload idempotency, audit record in the same transaction.
- Resolution service does not call financial, reward, attendance or topic-progress writers. Raw request keys/actor IDs are not included in UI history DTOs.
- Additive migration only; original CRM reports remain unchanged. This is an application decision overlay, not a rewrite of historical CRM grades.

## Local verification

- Backend build and complete unit suite: 248 passed, 5 explicit database tests skipped in default mode.
- Dedicated database `maestro_homework_qa_20260913` on localhost; all 61 migrations applied from scratch, including the new table.
- Opt-in database test passed: concurrent duplicate, competing edits, stale revision, transaction rollback after injected audit failure, direct/group/foreign scope, unavailable CRM, canonical deduplication and cross-direction exclusion. Points, coins, topic progress and league event counts unchanged.
- Frontend lint/typecheck/build passed.
- 70 Playwright cases passed across desktop and Pixel 7: teacher screen, student task list, student overview, three historical decisions, required reasons, conflict, uncertain-network retry key, read-only foreign work, canonical review link, student detail parity, archive counts, and 320px overflow.
- Browser business APIs were intercepted with synthetic data. They are not live-user acceptance tests. Mockup and screenshots remain local design artifacts.

## Release checklist

Before release, compare deployed tracked source against the previous verified commit; back up source/build and database. Verify exact frontend/backend release fingerprints and perform read-only checks of the new workspace. Do not submit decisions on real assignments during smoke tests.

The opt-in database test requires RUN_HOMEWORK_DB_TESTS=1, MAESTRO_QA_LOCAL=true, and a localhost DATABASE_URL whose database is exactly maestro_homework_qa_20260913. Its fixture rows are removed after the test; the disposable migrated database is retained for repeat verification.
