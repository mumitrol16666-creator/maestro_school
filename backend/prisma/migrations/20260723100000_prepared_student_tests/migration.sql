CREATE TABLE "prepared_test_attempts" (
    "id" UUID NOT NULL,
    "test_id" VARCHAR(128) NOT NULL,
    "student_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "correct_answers" INTEGER NOT NULL,
    "total_questions" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "answers" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prepared_test_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prepared_test_attempts_student_id_test_id_attempt_number_key"
ON "prepared_test_attempts"("student_id", "test_id", "attempt_number");

CREATE INDEX "prepared_test_attempts_student_id_test_id_created_at_idx"
ON "prepared_test_attempts"("student_id", "test_id", "created_at");

ALTER TABLE "prepared_test_attempts"
ADD CONSTRAINT "prepared_test_attempts_student_id_fkey"
FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
