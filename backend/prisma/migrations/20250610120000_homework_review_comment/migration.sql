-- Add separate teacher review comment (preserve student comment)

ALTER TABLE "homework_submissions" ADD COLUMN "review_comment" TEXT;
