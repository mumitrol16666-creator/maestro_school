-- Reversal of lesson rewards after CRM returns a confirmed lesson to the teacher.
ALTER TYPE "UserNotificationType" ADD VALUE IF NOT EXISTS 'offline_lesson_reopened';

ALTER TABLE "league_xp_events"
  ADD COLUMN "reversed_at" TIMESTAMPTZ(6),
  ADD COLUMN "reversal_reason" VARCHAR(500);

ALTER TABLE "weekly_league_activity_events"
  ADD COLUMN "reversed_at" TIMESTAMPTZ(6);
