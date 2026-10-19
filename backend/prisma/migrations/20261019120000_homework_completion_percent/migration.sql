-- Homework is checked at the lesson: the teacher sets a completion percent,
-- 0 means "not completed" and closes the homework without a retake.
ALTER TYPE "LearningHomeworkRecipientState" ADD VALUE IF NOT EXISTS 'not_completed';
ALTER TYPE "LearningHomeworkReviewDecision" ADD VALUE IF NOT EXISTS 'not_completed';
ALTER TYPE "LearningHomeworkAttemptStatus" ADD VALUE IF NOT EXISTS 'not_completed';

ALTER TABLE "learning_homework_recipients" ADD COLUMN IF NOT EXISTS "completion_percent" INTEGER;
ALTER TABLE "learning_homework_reviews" ADD COLUMN IF NOT EXISTS "completion_percent" INTEGER;
