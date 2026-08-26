ALTER TABLE "offline_lesson_student_checks"
ADD COLUMN "reviewed_homework_crm_class_id" VARCHAR(128);

CREATE INDEX "offline_lesson_student_checks_reviewed_homework_crm_class_id_idx"
ON "offline_lesson_student_checks"("reviewed_homework_crm_class_id");
