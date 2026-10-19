-- Decision 19.10: the monthly plans are replaced by sectors. Their tables are
-- not dropped: they move to the legacy_archive schema with all data, so they
-- can be read or moved back if ever needed. Sectors keep the id of the plan
-- they were migrated from as a plain column.
CREATE SCHEMA IF NOT EXISTS legacy_archive;

ALTER TABLE "learning_plans" DROP CONSTRAINT IF EXISTS "learning_plans_legacy_student_plan_id_fkey";
ALTER TABLE "learning_plans" DROP CONSTRAINT IF EXISTS "learning_plans_legacy_group_plan_id_fkey";

ALTER TABLE IF EXISTS "student_monthly_plans" SET SCHEMA legacy_archive;
ALTER TABLE IF EXISTS "group_monthly_plans" SET SCHEMA legacy_archive;

COMMENT ON TABLE legacy_archive."student_monthly_plans" IS 'Archived 2026-10-19: monthly plans replaced by sectors (learning_plans). Read-only.';
COMMENT ON TABLE legacy_archive."group_monthly_plans" IS 'Archived 2026-10-19: monthly plans replaced by sectors (learning_plans). Read-only.';
