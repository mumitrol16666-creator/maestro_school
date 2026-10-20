-- Plan 1.13: group sectors close by the teacher; each member sits their own sector exam and
-- the 250 Points go to members who passed it (or whom the teacher counted without an exam).

ALTER TABLE "sector_exams" ADD COLUMN "crm_group_id" VARCHAR(128);
CREATE INDEX "sector_exams_crm_group_id_status_idx" ON "sector_exams"("crm_group_id", "status");

-- One open exam per member of a sector (an individual sector has one member).
DROP INDEX "sector_exams_one_open_per_plan";
CREATE UNIQUE INDEX "sector_exams_one_open_per_member" ON "sector_exams"("plan_id", "crm_student_id") WHERE "status" IN ('draft', 'awaiting_schedule', 'scheduled', 'in_progress');

CREATE TABLE "sector_member_passes" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "crm_student_id" VARCHAR(128) NOT NULL,
    "method" VARCHAR(16) NOT NULL,
    "exam_id" UUID,
    "passed_by_id" UUID,
    "passed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "points_awarded" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sector_member_passes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sector_member_passes_method_check" CHECK ("method" IN ('exam', 'manual'))
);

CREATE UNIQUE INDEX "sector_member_passes_exam_id_key" ON "sector_member_passes"("exam_id");
CREATE INDEX "sector_member_passes_crm_student_id_idx" ON "sector_member_passes"("crm_student_id");
CREATE UNIQUE INDEX "sector_member_passes_plan_id_crm_student_id_key" ON "sector_member_passes"("plan_id", "crm_student_id");

ALTER TABLE "sector_member_passes" ADD CONSTRAINT "sector_member_passes_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "learning_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sector_member_passes" ADD CONSTRAINT "sector_member_passes_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "sector_exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
