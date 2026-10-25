-- Plan 5.6: practice reminders with a fun line, «позанимался» check-ins, the reminder phrases kind.

ALTER TYPE "LessonTextTemplateKind" ADD VALUE IF NOT EXISTS 'practice_reminder';
ALTER TYPE "UserNotificationType" ADD VALUE IF NOT EXISTS 'practice_reminder';
ALTER TYPE "UserNotificationType" ADD VALUE IF NOT EXISTS 'lesson_tomorrow';

CREATE TABLE IF NOT EXISTS "practice_reminders" (
    "user_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "time" VARCHAR(5) NOT NULL DEFAULT '18:00',
    "days" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[],
    "last_sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "practice_reminders_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE IF NOT EXISTS "practice_checkins" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "source" VARCHAR(32) NOT NULL DEFAULT 'home',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_checkins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "practice_checkins_user_id_day_key" ON "practice_checkins"("user_id", "day");

DO $$ BEGIN
  ALTER TABLE "practice_reminders" ADD CONSTRAINT "practice_reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "practice_checkins" ADD CONSTRAINT "practice_checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
