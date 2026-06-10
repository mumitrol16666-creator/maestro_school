CREATE TYPE "HomeworkType" AS ENUM ('assignment', 'test');

ALTER TABLE "homeworks"
ADD COLUMN "type" "HomeworkType" NOT NULL DEFAULT 'assignment',
ADD COLUMN "test_questions" JSONB,
ADD COLUMN "passing_score" INTEGER NOT NULL DEFAULT 70;

ALTER TABLE "homework_submissions"
ADD COLUMN "test_answers" JSONB,
ADD COLUMN "test_score" INTEGER,
ADD COLUMN "test_passed" BOOLEAN;

ALTER TABLE "homeworks"
ADD CONSTRAINT "homeworks_passing_score_check"
CHECK ("passing_score" >= 0 AND "passing_score" <= 100);

ALTER TABLE "homework_submissions"
ADD CONSTRAINT "homework_submissions_test_score_check"
CHECK ("test_score" IS NULL OR ("test_score" >= 0 AND "test_score" <= 100));
