-- CreateEnum
CREATE TYPE "OnlineLessonRequestStatus" AS ENUM ('new', 'assigned', 'scheduled', 'completed', 'cancelled', 'no_show');
CREATE TYPE "OnlineLessonMaterialType" AS ENUM ('youtube', 'link', 'text', 'pdf', 'image', 'file');
CREATE TYPE "OnlineLessonAssignmentSubmissionStatus" AS ENUM ('submitted', 'approved', 'approved_with_remarks', 'returned');
CREATE TYPE "MaestroCoinTransactionType" AS ENUM ('earn', 'adjustment', 'correction');
CREATE TYPE "MaestroCoinSourceType" AS ENUM ('online_lesson', 'assignment', 'manual');

-- CreateTable
CREATE TABLE "online_lesson_requests" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "direction_id" UUID,
    "direction_title" VARCHAR(255) NOT NULL,
    "level" VARCHAR(128) NOT NULL,
    "preferred_time" VARCHAR(512) NOT NULL,
    "comment" TEXT,
    "status" "OnlineLessonRequestStatus" NOT NULL DEFAULT 'new',
    "teacher_id" UUID,
    "scheduled_at" TIMESTAMPTZ(6),
    "zoom_url" VARCHAR(1024),
    "covered_topics" TEXT,
    "what_worked" TEXT,
    "what_to_improve" TEXT,
    "completion_comment" TEXT,
    "lesson_points" INTEGER NOT NULL DEFAULT 0,
    "lesson_coins" INTEGER NOT NULL DEFAULT 0,
    "lesson_coins_reason" VARCHAR(512),
    "completed_at" TIMESTAMPTZ(6),
    "completed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "online_lesson_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "online_lesson_assignments" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "due_at" TIMESTAMPTZ(6),
    "submission_format" "HomeworkAttachmentType" NOT NULL,
    "points_reward" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "online_lesson_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "online_lesson_assignment_materials" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "type" "OnlineLessonMaterialType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "url" VARCHAR(1024),
    "content" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "online_lesson_assignment_materials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "online_lesson_assignment_submissions" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "comment" TEXT,
    "attachment_url" VARCHAR(1024),
    "attachment_type" "HomeworkAttachmentType",
    "status" "OnlineLessonAssignmentSubmissionStatus" NOT NULL DEFAULT 'submitted',
    "review_comment" TEXT,
    "review_points" INTEGER,
    "review_coins" INTEGER NOT NULL DEFAULT 0,
    "review_coins_reason" VARCHAR(512),
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "online_lesson_assignment_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_coin_balances" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_coin_balances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "maestro_coin_transactions" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "transaction_type" "MaestroCoinTransactionType" NOT NULL,
    "reason" VARCHAR(512) NOT NULL,
    "source_type" "MaestroCoinSourceType" NOT NULL,
    "source_id" UUID,
    "created_by" UUID NOT NULL,
    "balance_before" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maestro_coin_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "online_lesson_assignments_request_id_key" ON "online_lesson_assignments"("request_id");
CREATE UNIQUE INDEX "student_coin_balances_student_id_key" ON "student_coin_balances"("student_id");
CREATE INDEX "online_lesson_requests_student_id_status_created_at_idx" ON "online_lesson_requests"("student_id", "status", "created_at");
CREATE INDEX "online_lesson_requests_teacher_id_status_idx" ON "online_lesson_requests"("teacher_id", "status");
CREATE INDEX "online_lesson_requests_status_created_at_idx" ON "online_lesson_requests"("status", "created_at");
CREATE INDEX "online_lesson_assignment_materials_assignment_id_sort_order_idx" ON "online_lesson_assignment_materials"("assignment_id", "sort_order");
CREATE INDEX "online_lesson_assignment_submissions_assignment_id_student_id_idx" ON "online_lesson_assignment_submissions"("assignment_id", "student_id", "created_at");
CREATE INDEX "online_lesson_assignment_submissions_student_id_status_idx" ON "online_lesson_assignment_submissions"("student_id", "status");
CREATE INDEX "maestro_coin_transactions_student_id_created_at_idx" ON "maestro_coin_transactions"("student_id", "created_at");
CREATE INDEX "maestro_coin_transactions_source_type_source_id_idx" ON "maestro_coin_transactions"("source_type", "source_id");

-- AddForeignKey
ALTER TABLE "online_lesson_requests" ADD CONSTRAINT "online_lesson_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "online_lesson_requests" ADD CONSTRAINT "online_lesson_requests_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "online_lesson_requests" ADD CONSTRAINT "online_lesson_requests_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "online_lesson_requests" ADD CONSTRAINT "online_lesson_requests_direction_id_fkey" FOREIGN KEY ("direction_id") REFERENCES "directions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "online_lesson_assignments" ADD CONSTRAINT "online_lesson_assignments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "online_lesson_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "online_lesson_assignment_materials" ADD CONSTRAINT "online_lesson_assignment_materials_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "online_lesson_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "online_lesson_assignment_submissions" ADD CONSTRAINT "online_lesson_assignment_submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "online_lesson_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "online_lesson_assignment_submissions" ADD CONSTRAINT "online_lesson_assignment_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "online_lesson_assignment_submissions" ADD CONSTRAINT "online_lesson_assignment_submissions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "student_coin_balances" ADD CONSTRAINT "student_coin_balances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "maestro_coin_transactions" ADD CONSTRAINT "maestro_coin_transactions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "maestro_coin_transactions" ADD CONSTRAINT "maestro_coin_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
