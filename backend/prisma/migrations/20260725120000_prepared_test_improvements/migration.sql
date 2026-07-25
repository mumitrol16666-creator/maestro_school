ALTER TABLE "prepared_test_attempts"
ADD COLUMN "duration_seconds" INTEGER;

CREATE INDEX "prepared_test_attempts_test_id_created_at_idx"
ON "prepared_test_attempts"("test_id", "created_at");

ALTER TABLE "points_transactions"
ADD COLUMN "source_key" VARCHAR(191);

CREATE UNIQUE INDEX "points_transactions_source_key_key"
ON "points_transactions"("source_key");

CREATE TABLE "prepared_test_drafts" (
    "id" UUID NOT NULL,
    "test_id" VARCHAR(128) NOT NULL,
    "student_id" UUID NOT NULL,
    "answers" JSONB NOT NULL,
    "current_question" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "prepared_test_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prepared_test_drafts_student_id_test_id_key"
ON "prepared_test_drafts"("student_id", "test_id");

CREATE INDEX "prepared_test_drafts_student_id_updated_at_idx"
ON "prepared_test_drafts"("student_id", "updated_at");

ALTER TABLE "prepared_test_drafts"
ADD CONSTRAINT "prepared_test_drafts_student_id_fkey"
FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
