-- Existing shared sectors keep their attendance-snapshot reward policy until deliberately
-- replaced. Newly created group plans use individual mastery, not shared progress.
ALTER TABLE "learning_plans" ADD COLUMN "is_shared_group_plan" BOOLEAN NOT NULL DEFAULT false;
-- Existing booked/prepared exams retain their original admission policy. All new exams
-- require the teacher's CRM-confirmed personal readiness.
ALTER TABLE "sector_exams" ADD COLUMN "requires_readiness_confirmation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sector_exams" ALTER COLUMN "requires_readiness_confirmation" SET DEFAULT true;
