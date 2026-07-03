CREATE UNIQUE INDEX IF NOT EXISTS "maestro_coin_transactions_course_award_unique"
ON "maestro_coin_transactions"("student_id", "source_type", "source_id")
WHERE "source_type" = 'course' AND "source_id" IS NOT NULL;
