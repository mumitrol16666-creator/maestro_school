ALTER TYPE "MaestroCoinSourceType" ADD VALUE IF NOT EXISTS 'weekly_league';
CREATE TYPE "LeagueXpSourceType" AS ENUM (
  'online_lesson',
  'offline_lesson',
  'course_homework',
  'online_assignment',
  'prepared_test',
  'monthly_plan',
  'teacher_bonus'
);

CREATE TYPE "WeeklyLeagueAwardType" AS ENUM (
  'first_place',
  'second_place',
  'third_place',
  'personal_goal'
);

ALTER TABLE "users"
ADD COLUMN "league_eligible" BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE "league_xp_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "student_id" UUID NOT NULL,
  "amount" INTEGER NOT NULL,
  "source_type" "LeagueXpSourceType" NOT NULL,
  "source_key" VARCHAR(191) NOT NULL,
  "description" VARCHAR(512) NOT NULL,
  "awarded_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "league_xp_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "league_xp_events_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "league_xp_events_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "league_xp_events_awarded_by_fkey"
    FOREIGN KEY ("awarded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "league_xp_events_source_key_key"
  ON "league_xp_events"("source_key");
CREATE INDEX "league_xp_events_student_id_created_at_idx"
  ON "league_xp_events"("student_id", "created_at");
CREATE INDEX "league_xp_events_source_type_created_at_idx"
  ON "league_xp_events"("source_type", "created_at");
CREATE INDEX "league_xp_events_created_at_idx"
  ON "league_xp_events"("created_at");
CREATE INDEX "league_xp_events_awarded_by_idx"
  ON "league_xp_events"("awarded_by");

CREATE TABLE "weekly_league_awards" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "student_id" UUID NOT NULL,
  "week_start" TIMESTAMPTZ(6) NOT NULL,
  "award_type" "WeeklyLeagueAwardType" NOT NULL,
  "position" INTEGER,
  "xp" INTEGER NOT NULL,
  "coins" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "weekly_league_awards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "weekly_league_awards_xp_nonnegative" CHECK ("xp" >= 0),
  CONSTRAINT "weekly_league_awards_coins_positive" CHECK ("coins" > 0),
  CONSTRAINT "weekly_league_awards_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "weekly_league_awards_week_start_student_id_award_type_key"
  ON "weekly_league_awards"("week_start", "student_id", "award_type");
CREATE INDEX "weekly_league_awards_student_id_week_start_idx"
  ON "weekly_league_awards"("student_id", "week_start");
CREATE INDEX "weekly_league_awards_week_start_position_idx"
  ON "weekly_league_awards"("week_start", "position");
