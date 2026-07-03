ALTER TYPE "MaestroCoinSourceType" ADD VALUE IF NOT EXISTS 'course';

ALTER TABLE "courses"
ADD COLUMN "completion_coins_reward" INTEGER NOT NULL DEFAULT 0;
