-- Plan 1.10: the sector exam, held live at the school; the platform keeps the checklist, CRM schedule and marks.
-- CreateEnum
CREATE TYPE "SectorExamStatus" AS ENUM ('draft', 'awaiting_schedule', 'scheduled', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "SectorExamOutcome" AS ENUM ('passed', 'partial', 'failed');

-- CreateEnum
CREATE TYPE "SectorExamItemKind" AS ENUM ('topic', 'custom');

-- AlterEnum
ALTER TYPE "UserNotificationType" ADD VALUE IF NOT EXISTS 'sector_exam_updated';

-- CreateTable
CREATE TABLE "sector_exams" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "crm_student_id" VARCHAR(128) NOT NULL,
    "direction_id" UUID NOT NULL,
    "status" "SectorExamStatus" NOT NULL DEFAULT 'draft',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "previous_exam_id" UUID,
    "created_by_id" UUID,
    "sent_for_schedule_at" TIMESTAMPTZ(6),
    "crm_class_id" VARCHAR(128),
    "crm_teacher_id" VARCHAR(128),
    "scheduled_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "started_by_id" UUID,
    "finished_at" TIMESTAMPTZ(6),
    "finished_by_id" UUID,
    "outcome" "SectorExamOutcome",
    "decision" VARCHAR(32),
    "comment" TEXT,
    "certificate_number" VARCHAR(32),
    "certificate_issued_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sector_exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sector_exam_items" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "kind" "SectorExamItemKind" NOT NULL,
    "topic_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "criteria" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,

    CONSTRAINT "sector_exam_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sector_exam_results" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "crm_student_id" VARCHAR(128) NOT NULL,
    "done" BOOLEAN NOT NULL,
    "marked_by_id" UUID,
    "marked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sector_exam_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sector_exams_previous_exam_id_key" ON "sector_exams"("previous_exam_id");

-- CreateIndex
CREATE UNIQUE INDEX "sector_exams_certificate_number_key" ON "sector_exams"("certificate_number");

-- CreateIndex
CREATE INDEX "sector_exams_plan_id_status_idx" ON "sector_exams"("plan_id", "status");

-- CreateIndex
CREATE INDEX "sector_exams_status_sent_for_schedule_at_idx" ON "sector_exams"("status", "sent_for_schedule_at");

-- CreateIndex
CREATE INDEX "sector_exams_crm_student_id_status_idx" ON "sector_exams"("crm_student_id", "status");

-- CreateIndex
CREATE INDEX "sector_exams_crm_class_id_idx" ON "sector_exams"("crm_class_id");

-- CreateIndex
CREATE INDEX "sector_exam_items_exam_id_position_idx" ON "sector_exam_items"("exam_id", "position");

-- CreateIndex
CREATE INDEX "sector_exam_results_exam_id_idx" ON "sector_exam_results"("exam_id");

-- CreateIndex
CREATE UNIQUE INDEX "sector_exam_results_item_id_crm_student_id_key" ON "sector_exam_results"("item_id", "crm_student_id");

-- AddForeignKey
ALTER TABLE "sector_exams" ADD CONSTRAINT "sector_exams_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "learning_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sector_exams" ADD CONSTRAINT "sector_exams_direction_id_fkey" FOREIGN KEY ("direction_id") REFERENCES "directions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sector_exams" ADD CONSTRAINT "sector_exams_previous_exam_id_fkey" FOREIGN KEY ("previous_exam_id") REFERENCES "sector_exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sector_exam_items" ADD CONSTRAINT "sector_exam_items_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "sector_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sector_exam_results" ADD CONSTRAINT "sector_exam_results_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "sector_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sector_exam_results" ADD CONSTRAINT "sector_exam_results_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "sector_exam_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One open exam per sector.
CREATE UNIQUE INDEX "sector_exams_one_open_per_plan" ON "sector_exams"("plan_id") WHERE "status" IN ('draft', 'awaiting_schedule', 'scheduled', 'in_progress');
