ALTER TYPE "MaestroCoinSourceType" ADD VALUE IF NOT EXISTS 'streak_milestone';

CREATE TYPE "WeeklyLeagueActivityType" AS ENUM ('lesson_attendance', 'homework_accepted');
CREATE TYPE "WeeklyStreakEventType" AS ENUM ('extended', 'frozen', 'broken', 'corrected');
CREATE TYPE "WeeklyStreakProtectionSource" AS ENUM ('crm', 'curator');
CREATE TYPE "WeeklyStreakProtectionCategory" AS ENUM (
  'school_holiday',
  'subscription_pause',
  'all_lessons_cancelled',
  'illness',
  'family',
  'other'
);

ALTER TABLE "weekly_league_snapshot_entries"
  ADD COLUMN "streak_outcome" "WeeklyStreakEventType",
  ADD COLUMN "coin_breakdown" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "milestones_earned" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "weekly_league_awards"
  ADD COLUMN "source_key" VARCHAR(191);

CREATE UNIQUE INDEX "weekly_league_awards_source_key_key"
  ON "weekly_league_awards"("source_key");

CREATE TABLE "weekly_league_activity_events" (
  "id" UUID NOT NULL,
  "economic_epoch_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "activity_type" "WeeklyLeagueActivityType" NOT NULL,
  "source_key" VARCHAR(191) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "weekly_league_activity_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "weekly_league_activity_events_source_key_key"
  ON "weekly_league_activity_events"("source_key");
CREATE INDEX "weekly_league_activity_events_economic_epoch_id_student_idx"
  ON "weekly_league_activity_events"("economic_epoch_id", "student_id", "occurred_at");
CREATE INDEX "weekly_league_activity_events_economic_epoch_id_occurred_idx"
  ON "weekly_league_activity_events"("economic_epoch_id", "occurred_at", "recorded_at");

CREATE TABLE "weekly_streak_states" (
  "id" UUID NOT NULL,
  "economic_epoch_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "current_weeks" INTEGER NOT NULL DEFAULT 0,
  "best_weeks" INTEGER NOT NULL DEFAULT 0,
  "last_processed_week_start" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "weekly_streak_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "weekly_streak_states_economic_epoch_id_student_id_key"
  ON "weekly_streak_states"("economic_epoch_id", "student_id");
CREATE INDEX "weekly_streak_states_student_id_updated_at_idx"
  ON "weekly_streak_states"("student_id", "updated_at");

CREATE TABLE "weekly_streak_protections" (
  "id" UUID NOT NULL,
  "economic_epoch_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "week_start" TIMESTAMPTZ(6) NOT NULL,
  "source" "WeeklyStreakProtectionSource" NOT NULL,
  "category" "WeeklyStreakProtectionCategory" NOT NULL,
  "comment" VARCHAR(512) NOT NULL,
  "source_key" VARCHAR(191) NOT NULL,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(6),
  "revoked_by" UUID,
  "revoked_reason" VARCHAR(512),
  CONSTRAINT "weekly_streak_protections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "weekly_streak_protections_source_key_key"
  ON "weekly_streak_protections"("source_key");
CREATE UNIQUE INDEX "weekly_streak_protections_active_week_key"
  ON "weekly_streak_protections"("economic_epoch_id", "student_id", "week_start")
  WHERE "revoked_at" IS NULL;
CREATE INDEX "weekly_streak_protections_economic_epoch_id_student_idx"
  ON "weekly_streak_protections"("economic_epoch_id", "student_id", "week_start");
CREATE INDEX "weekly_streak_protections_week_start_revoked_at_idx"
  ON "weekly_streak_protections"("week_start", "revoked_at");

CREATE TABLE "weekly_streak_events" (
  "id" UUID NOT NULL,
  "economic_epoch_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "week_start" TIMESTAMPTZ(6) NOT NULL,
  "event_type" "WeeklyStreakEventType" NOT NULL,
  "streak_before" INTEGER NOT NULL,
  "streak_after" INTEGER NOT NULL,
  "source_key" VARCHAR(191) NOT NULL,
  "protection_id" UUID,
  "reason" VARCHAR(512) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "weekly_streak_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "weekly_streak_events_source_key_key"
  ON "weekly_streak_events"("source_key");
CREATE INDEX "weekly_streak_events_economic_epoch_id_student_week_idx"
  ON "weekly_streak_events"("economic_epoch_id", "student_id", "week_start");
CREATE INDEX "weekly_streak_events_week_start_event_type_idx"
  ON "weekly_streak_events"("week_start", "event_type");

CREATE TABLE "weekly_streak_milestones" (
  "id" UUID NOT NULL,
  "economic_epoch_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "milestone_weeks" INTEGER NOT NULL,
  "coins_awarded" INTEGER NOT NULL,
  "source_key" VARCHAR(191) NOT NULL,
  "earned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "weekly_streak_milestones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "weekly_streak_milestones_source_key_key"
  ON "weekly_streak_milestones"("source_key");
CREATE UNIQUE INDEX "weekly_streak_milestones_epoch_student_weeks_key"
  ON "weekly_streak_milestones"("economic_epoch_id", "student_id", "milestone_weeks");
CREATE INDEX "weekly_streak_milestones_student_id_earned_at_idx"
  ON "weekly_streak_milestones"("student_id", "earned_at");

ALTER TABLE "weekly_league_activity_events"
  ADD CONSTRAINT "weekly_league_activity_events_economic_epoch_id_fkey"
  FOREIGN KEY ("economic_epoch_id") REFERENCES "economic_epochs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_league_activity_events"
  ADD CONSTRAINT "weekly_league_activity_events_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "weekly_streak_states"
  ADD CONSTRAINT "weekly_streak_states_economic_epoch_id_fkey"
  FOREIGN KEY ("economic_epoch_id") REFERENCES "economic_epochs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_streak_states"
  ADD CONSTRAINT "weekly_streak_states_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "weekly_streak_protections"
  ADD CONSTRAINT "weekly_streak_protections_economic_epoch_id_fkey"
  FOREIGN KEY ("economic_epoch_id") REFERENCES "economic_epochs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_streak_protections"
  ADD CONSTRAINT "weekly_streak_protections_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_streak_protections"
  ADD CONSTRAINT "weekly_streak_protections_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "weekly_streak_protections"
  ADD CONSTRAINT "weekly_streak_protections_revoked_by_fkey"
  FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "weekly_streak_events"
  ADD CONSTRAINT "weekly_streak_events_economic_epoch_id_fkey"
  FOREIGN KEY ("economic_epoch_id") REFERENCES "economic_epochs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_streak_events"
  ADD CONSTRAINT "weekly_streak_events_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_streak_events"
  ADD CONSTRAINT "weekly_streak_events_protection_id_fkey"
  FOREIGN KEY ("protection_id") REFERENCES "weekly_streak_protections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "weekly_streak_milestones"
  ADD CONSTRAINT "weekly_streak_milestones_economic_epoch_id_fkey"
  FOREIGN KEY ("economic_epoch_id") REFERENCES "economic_epochs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_streak_milestones"
  ADD CONSTRAINT "weekly_streak_milestones_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
