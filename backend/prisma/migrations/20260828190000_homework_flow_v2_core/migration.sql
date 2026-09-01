-- DEV-03A: normalized homework assignments, per-student recipients,
-- immutable attempt versions and auditable review decisions.

CREATE TYPE "LearningHomeworkRecipientState" AS ENUM (
  'assigned',
  'waiting_review',
  'revision',
  'accepted',
  'accepted_with_comment'
);

CREATE TYPE "LearningHomeworkSubmissionMode" AS ENUM (
  'materials',
  'ready_for_lesson'
);

CREATE TYPE "LearningHomeworkAttemptStatus" AS ENUM (
  'waiting_review',
  'superseded',
  'revision',
  'accepted',
  'accepted_with_comment'
);

CREATE TYPE "LearningHomeworkReviewDecision" AS ENUM (
  'revision',
  'accepted',
  'accepted_with_comment'
);

CREATE TABLE "learning_homework_assignments" (
  "id" UUID NOT NULL,
  "topic_id" UUID NOT NULL,
  "source_lesson_id" VARCHAR(128),
  "instructions" TEXT NOT NULL,
  "materials" JSONB NOT NULL DEFAULT '[]',
  "due_at" TIMESTAMPTZ(6),
  "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id" UUID,
  "idempotency_key" VARCHAR(191) NOT NULL,
  "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "learning_homework_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_homework_recipients" (
  "id" UUID NOT NULL,
  "assignment_id" UUID NOT NULL,
  "crm_student_id" VARCHAR(128) NOT NULL,
  "student_user_id" UUID,
  "state" "LearningHomeworkRecipientState" NOT NULL DEFAULT 'assigned',
  "current_cycle" INTEGER NOT NULL DEFAULT 1,
  "accepted_at" TIMESTAMPTZ(6),
  "final_reviewer_id" UUID,
  "reward_source_key" VARCHAR(191),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "learning_homework_recipients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_homework_attempts" (
  "id" UUID NOT NULL,
  "recipient_id" UUID NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "cycle_number" INTEGER NOT NULL,
  "version_in_cycle" INTEGER NOT NULL,
  "submission_mode" "LearningHomeworkSubmissionMode" NOT NULL,
  "text" TEXT,
  "materials" JSONB NOT NULL DEFAULT '[]',
  "status" "LearningHomeworkAttemptStatus" NOT NULL DEFAULT 'waiting_review',
  "submitted_by_id" UUID,
  "previous_attempt_id" UUID,
  "idempotency_key" VARCHAR(191) NOT NULL,
  "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "learning_homework_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_homework_reviews" (
  "id" UUID NOT NULL,
  "recipient_id" UUID NOT NULL,
  "attempt_id" UUID NOT NULL,
  "cycle_number" INTEGER NOT NULL,
  "decision" "LearningHomeworkReviewDecision" NOT NULL,
  "comment" TEXT,
  "reviewer_id" UUID,
  "idempotency_key" VARCHAR(191) NOT NULL,
  "reviewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "learning_homework_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learning_homework_assignments_idempotency_key_key"
  ON "learning_homework_assignments"("idempotency_key");
CREATE INDEX "learning_homework_assignments_topic_id_assigned_at_idx"
  ON "learning_homework_assignments"("topic_id", "assigned_at");
CREATE INDEX "learning_homework_assignments_source_lesson_id_idx"
  ON "learning_homework_assignments"("source_lesson_id");
CREATE INDEX "learning_homework_assignments_created_by_id_assigned_at_idx"
  ON "learning_homework_assignments"("created_by_id", "assigned_at");
CREATE INDEX "learning_homework_assignments_archived_at_idx"
  ON "learning_homework_assignments"("archived_at");

CREATE UNIQUE INDEX "learning_homework_recipients_reward_source_key_key"
  ON "learning_homework_recipients"("reward_source_key");
CREATE UNIQUE INDEX "learning_homework_recipients_assignment_id_crm_student_id_key"
  ON "learning_homework_recipients"("assignment_id", "crm_student_id");
CREATE INDEX "learning_homework_recipients_crm_student_id_state_created_at_idx"
  ON "learning_homework_recipients"("crm_student_id", "state", "created_at");
CREATE INDEX "learning_homework_recipients_student_user_id_state_created_at_idx"
  ON "learning_homework_recipients"("student_user_id", "state", "created_at");
CREATE INDEX "learning_homework_recipients_final_reviewer_id_accepted_at_idx"
  ON "learning_homework_recipients"("final_reviewer_id", "accepted_at");

CREATE UNIQUE INDEX "learning_homework_attempts_previous_attempt_id_key"
  ON "learning_homework_attempts"("previous_attempt_id");
CREATE UNIQUE INDEX "learning_homework_attempts_idempotency_key_key"
  ON "learning_homework_attempts"("idempotency_key");
CREATE UNIQUE INDEX "learning_homework_attempts_recipient_id_attempt_number_key"
  ON "learning_homework_attempts"("recipient_id", "attempt_number");
CREATE UNIQUE INDEX "learning_homework_attempts_recipient_id_cycle_number_version_in_cycle_key"
  ON "learning_homework_attempts"("recipient_id", "cycle_number", "version_in_cycle");
CREATE INDEX "learning_homework_attempts_recipient_id_status_submitted_at_idx"
  ON "learning_homework_attempts"("recipient_id", "status", "submitted_at");
CREATE INDEX "learning_homework_attempts_submitted_by_id_submitted_at_idx"
  ON "learning_homework_attempts"("submitted_by_id", "submitted_at");

CREATE UNIQUE INDEX "learning_homework_reviews_idempotency_key_key"
  ON "learning_homework_reviews"("idempotency_key");
CREATE UNIQUE INDEX "learning_homework_reviews_recipient_id_cycle_number_key"
  ON "learning_homework_reviews"("recipient_id", "cycle_number");
CREATE INDEX "learning_homework_reviews_attempt_id_idx"
  ON "learning_homework_reviews"("attempt_id");
CREATE INDEX "learning_homework_reviews_reviewer_id_reviewed_at_idx"
  ON "learning_homework_reviews"("reviewer_id", "reviewed_at");

ALTER TABLE "learning_homework_assignments"
  ADD CONSTRAINT "learning_homework_assignments_topic_id_fkey"
  FOREIGN KEY ("topic_id") REFERENCES "learning_topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learning_homework_assignments"
  ADD CONSTRAINT "learning_homework_assignments_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "learning_homework_recipients"
  ADD CONSTRAINT "learning_homework_recipients_assignment_id_fkey"
  FOREIGN KEY ("assignment_id") REFERENCES "learning_homework_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_homework_recipients"
  ADD CONSTRAINT "learning_homework_recipients_student_user_id_fkey"
  FOREIGN KEY ("student_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "learning_homework_recipients"
  ADD CONSTRAINT "learning_homework_recipients_final_reviewer_id_fkey"
  FOREIGN KEY ("final_reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "learning_homework_attempts"
  ADD CONSTRAINT "learning_homework_attempts_recipient_id_fkey"
  FOREIGN KEY ("recipient_id") REFERENCES "learning_homework_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_homework_attempts"
  ADD CONSTRAINT "learning_homework_attempts_submitted_by_id_fkey"
  FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "learning_homework_attempts"
  ADD CONSTRAINT "learning_homework_attempts_previous_attempt_id_fkey"
  FOREIGN KEY ("previous_attempt_id") REFERENCES "learning_homework_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "learning_homework_reviews"
  ADD CONSTRAINT "learning_homework_reviews_recipient_id_fkey"
  FOREIGN KEY ("recipient_id") REFERENCES "learning_homework_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_homework_reviews"
  ADD CONSTRAINT "learning_homework_reviews_attempt_id_fkey"
  FOREIGN KEY ("attempt_id") REFERENCES "learning_homework_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "learning_homework_reviews"
  ADD CONSTRAINT "learning_homework_reviews_reviewer_id_fkey"
  FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
