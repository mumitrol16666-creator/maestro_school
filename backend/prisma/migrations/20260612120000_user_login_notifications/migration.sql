-- CreateEnum
CREATE TYPE "UserNotificationType" AS ENUM ('online_lesson_scheduled');

-- AlterTable: login + required phone
ALTER TABLE "users" ADD COLUMN "login" VARCHAR(64);

UPDATE "users"
SET "login" = LOWER(
  REGEXP_REPLACE(SPLIT_PART("email", '@', 1), '[^a-zA-Z0-9_]', '', 'g')
  || '_' || SUBSTRING(REPLACE("id"::text, '-', '') FROM 1 FOR 6)
)
WHERE "login" IS NULL;

UPDATE "users" SET "phone" = '00000000000' WHERE "phone" IS NULL OR TRIM("phone") = '';

ALTER TABLE "users" ALTER COLUMN "login" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "phone" SET NOT NULL;

CREATE UNIQUE INDEX "users_login_key" ON "users"("login");
CREATE INDEX "users_login_idx" ON "users"("login");

-- CreateTable
CREATE TABLE "user_notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "UserNotificationType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "url" VARCHAR(512),
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_notifications_user_id_read_at_idx" ON "user_notifications"("user_id", "read_at");
CREATE INDEX "user_notifications_user_id_created_at_idx" ON "user_notifications"("user_id", "created_at");

ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
