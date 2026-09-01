CREATE TYPE "EconomicEpochStatus" AS ENUM ('planned', 'active', 'archived');

ALTER TYPE "MaestroCoinSourceType" ADD VALUE IF NOT EXISTS 'economic_epoch';

CREATE TABLE "economic_epochs" (
  "id" UUID NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "status" "EconomicEpochStatus" NOT NULL DEFAULT 'planned',
  "opening_points" INTEGER NOT NULL DEFAULT 0,
  "opening_weekly_xp" INTEGER NOT NULL DEFAULT 0,
  "opening_coins" INTEGER NOT NULL DEFAULT 200,
  "source_key" VARCHAR(191) NOT NULL,
  "activated_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "economic_epochs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "economic_epoch_participants" (
  "id" UUID NOT NULL,
  "epoch_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "opening_points" INTEGER NOT NULL DEFAULT 0,
  "opening_weekly_xp" INTEGER NOT NULL DEFAULT 0,
  "opening_coins" INTEGER NOT NULL DEFAULT 200,
  "opening_level" INTEGER NOT NULL DEFAULT 1,
  "legacy_points_snapshot" INTEGER NOT NULL DEFAULT 0,
  "legacy_weekly_xp_snapshot" INTEGER NOT NULL DEFAULT 0,
  "legacy_coins_snapshot" INTEGER NOT NULL DEFAULT 0,
  "source_key" VARCHAR(191) NOT NULL,
  "activated_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "economic_epoch_participants_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "points_transactions" ADD COLUMN "economic_epoch_id" UUID;
ALTER TABLE "league_xp_events" ADD COLUMN "economic_epoch_id" UUID;
ALTER TABLE "weekly_league_awards" ADD COLUMN "economic_epoch_id" UUID;
ALTER TABLE "student_coin_balances" ADD COLUMN "economic_epoch_id" UUID;
ALTER TABLE "maestro_coin_transactions" ADD COLUMN "economic_epoch_id" UUID;
ALTER TABLE "maestro_coin_transactions" ALTER COLUMN "created_by" DROP NOT NULL;

ALTER TABLE "maestro_coin_transactions" DROP CONSTRAINT "maestro_coin_transactions_created_by_fkey";
ALTER TABLE "maestro_coin_transactions"
  ADD CONSTRAINT "maestro_coin_transactions_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "economic_epochs_code_key" ON "economic_epochs"("code");
CREATE UNIQUE INDEX "economic_epochs_source_key_key" ON "economic_epochs"("source_key");
CREATE UNIQUE INDEX "economic_epochs_one_active_idx" ON "economic_epochs" ((1)) WHERE "status" = 'active';
CREATE INDEX "economic_epochs_status_starts_at_idx" ON "economic_epochs"("status", "starts_at");
CREATE UNIQUE INDEX "economic_epoch_participants_source_key_key" ON "economic_epoch_participants"("source_key");
CREATE UNIQUE INDEX "economic_epoch_participants_epoch_id_student_id_key" ON "economic_epoch_participants"("epoch_id", "student_id");
CREATE INDEX "economic_epoch_participants_student_id_activated_at_idx" ON "economic_epoch_participants"("student_id", "activated_at");
CREATE INDEX "points_transactions_economic_epoch_id_student_id_created_at_idx" ON "points_transactions"("economic_epoch_id", "student_id", "created_at");
CREATE INDEX "league_xp_events_economic_epoch_id_student_id_created_at_idx" ON "league_xp_events"("economic_epoch_id", "student_id", "created_at");
CREATE INDEX "weekly_league_awards_economic_epoch_id_week_start_position_idx" ON "weekly_league_awards"("economic_epoch_id", "week_start", "position");
CREATE INDEX "student_coin_balances_economic_epoch_id_idx" ON "student_coin_balances"("economic_epoch_id");
CREATE INDEX "maestro_coin_transactions_economic_epoch_id_student_id_created_at_idx" ON "maestro_coin_transactions"("economic_epoch_id", "student_id", "created_at");

ALTER TABLE "economic_epoch_participants"
  ADD CONSTRAINT "economic_epoch_participants_epoch_id_fkey"
  FOREIGN KEY ("epoch_id") REFERENCES "economic_epochs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "economic_epoch_participants"
  ADD CONSTRAINT "economic_epoch_participants_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "points_transactions"
  ADD CONSTRAINT "points_transactions_economic_epoch_id_fkey"
  FOREIGN KEY ("economic_epoch_id") REFERENCES "economic_epochs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "league_xp_events"
  ADD CONSTRAINT "league_xp_events_economic_epoch_id_fkey"
  FOREIGN KEY ("economic_epoch_id") REFERENCES "economic_epochs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "weekly_league_awards"
  ADD CONSTRAINT "weekly_league_awards_economic_epoch_id_fkey"
  FOREIGN KEY ("economic_epoch_id") REFERENCES "economic_epochs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "student_coin_balances"
  ADD CONSTRAINT "student_coin_balances_economic_epoch_id_fkey"
  FOREIGN KEY ("economic_epoch_id") REFERENCES "economic_epochs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "maestro_coin_transactions"
  ADD CONSTRAINT "maestro_coin_transactions_economic_epoch_id_fkey"
  FOREIGN KEY ("economic_epoch_id") REFERENCES "economic_epochs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
