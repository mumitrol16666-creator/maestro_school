ALTER TYPE "LeagueXpSourceType" ADD VALUE IF NOT EXISTS 'learning_homework';

ALTER TABLE "league_xp_events" ADD COLUMN "direction_id" UUID;
ALTER TABLE "league_xp_events" ADD COLUMN "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "weekly_league_snapshots" (
  "id" UUID NOT NULL,
  "economic_epoch_id" UUID NOT NULL,
  "week_start" TIMESTAMPTZ(6) NOT NULL,
  "week_end" TIMESTAMPTZ(6) NOT NULL,
  "time_zone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Aqtobe',
  "rules_version" VARCHAR(64) NOT NULL,
  "participant_count" INTEGER NOT NULL DEFAULT 0,
  "source_key" VARCHAR(191) NOT NULL,
  "finalized_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "weekly_league_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "weekly_league_snapshot_entries" (
  "id" UUID NOT NULL,
  "snapshot_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "display_name" VARCHAR(255) NOT NULL,
  "position" INTEGER NOT NULL,
  "xp" INTEGER NOT NULL,
  "event_count" INTEGER NOT NULL,
  "goal_xp" INTEGER NOT NULL,
  "goal_met" BOOLEAN NOT NULL,
  "coins_awarded" INTEGER NOT NULL DEFAULT 0,
  "streak_weeks" INTEGER NOT NULL DEFAULT 0,
  "breakdown" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "weekly_league_snapshot_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "league_xp_events_economic_epoch_id_student_id_direction_id_created_at_idx"
  ON "league_xp_events"("economic_epoch_id", "student_id", "direction_id", "created_at");
CREATE INDEX "league_xp_events_recorded_at_idx" ON "league_xp_events"("recorded_at");
CREATE UNIQUE INDEX "weekly_league_snapshots_source_key_key" ON "weekly_league_snapshots"("source_key");
CREATE UNIQUE INDEX "weekly_league_snapshots_economic_epoch_id_week_start_key"
  ON "weekly_league_snapshots"("economic_epoch_id", "week_start");
CREATE INDEX "weekly_league_snapshots_economic_epoch_id_week_start_idx"
  ON "weekly_league_snapshots"("economic_epoch_id", "week_start");
CREATE INDEX "weekly_league_snapshots_finalized_at_idx" ON "weekly_league_snapshots"("finalized_at");
CREATE UNIQUE INDEX "weekly_league_snapshot_entries_snapshot_id_student_id_key"
  ON "weekly_league_snapshot_entries"("snapshot_id", "student_id");
CREATE INDEX "weekly_league_snapshot_entries_snapshot_id_position_idx"
  ON "weekly_league_snapshot_entries"("snapshot_id", "position");
CREATE INDEX "weekly_league_snapshot_entries_student_id_snapshot_id_idx"
  ON "weekly_league_snapshot_entries"("student_id", "snapshot_id");

ALTER TABLE "league_xp_events"
  ADD CONSTRAINT "league_xp_events_direction_id_fkey"
  FOREIGN KEY ("direction_id") REFERENCES "directions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "weekly_league_snapshots"
  ADD CONSTRAINT "weekly_league_snapshots_economic_epoch_id_fkey"
  FOREIGN KEY ("economic_epoch_id") REFERENCES "economic_epochs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "weekly_league_snapshot_entries"
  ADD CONSTRAINT "weekly_league_snapshot_entries_snapshot_id_fkey"
  FOREIGN KEY ("snapshot_id") REFERENCES "weekly_league_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_league_snapshot_entries"
  ADD CONSTRAINT "weekly_league_snapshot_entries_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
