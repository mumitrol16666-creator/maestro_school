CREATE TABLE "offline_lesson_student_checks" (
    "id" UUID NOT NULL,
    "crm_class_id" VARCHAR(128) NOT NULL,
    "crm_student_id" VARCHAR(128) NOT NULL,
    "teacher_user_id" UUID,
    "attendance_status" VARCHAR(32) NOT NULL DEFAULT 'unmarked',
    "homework_status" VARCHAR(32) NOT NULL DEFAULT 'not_checked',
    "homework_completion_percent" INTEGER,
    "homework_difficulties" TEXT,
    "homework_not_completed_reason" TEXT,
    "teacher_note" TEXT,
    "marked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "offline_lesson_student_checks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "offline_lesson_student_checks_crm_class_id_crm_student_id_key"
    ON "offline_lesson_student_checks"("crm_class_id", "crm_student_id");

CREATE INDEX "offline_lesson_student_checks_teacher_user_id_idx"
    ON "offline_lesson_student_checks"("teacher_user_id");

CREATE INDEX "offline_lesson_student_checks_crm_class_id_idx"
    ON "offline_lesson_student_checks"("crm_class_id");

ALTER TABLE "offline_lesson_student_checks"
    ADD CONSTRAINT "offline_lesson_student_checks_teacher_user_id_fkey"
    FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
