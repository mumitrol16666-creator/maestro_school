ALTER TYPE "MaestroCoinSourceType" ADD VALUE IF NOT EXISTS 'offline_lesson';

ALTER TYPE "AchievementCriteriaType" ADD VALUE IF NOT EXISTS 'offline_lessons_completed_count';
ALTER TYPE "AchievementCriteriaType" ADD VALUE IF NOT EXISTS 'homework_completed_count';
ALTER TYPE "AchievementCriteriaType" ADD VALUE IF NOT EXISTS 'monthly_plans_completed_count';
ALTER TYPE "AchievementCriteriaType" ADD VALUE IF NOT EXISTS 'coins_earned_threshold';

ALTER TABLE "offline_lesson_student_checks"
ADD COLUMN "lesson_points" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "monthly_plan_id" UUID,
ADD COLUMN "plan_topic_updates" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "rewards_applied_at" TIMESTAMPTZ(6);

ALTER TABLE "maestro_coin_transactions"
ADD COLUMN "source_key" VARCHAR(191);

CREATE UNIQUE INDEX "maestro_coin_transactions_source_key_key"
ON "maestro_coin_transactions"("source_key");
