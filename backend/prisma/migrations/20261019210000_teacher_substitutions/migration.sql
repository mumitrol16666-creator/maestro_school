-- Plan 1.9: a substitute teacher works with the lesson's students until the lesson is approved.
CREATE TABLE "teacher_substitutions" (
    "id" UUID NOT NULL,
    "crm_teacher_id" VARCHAR(128) NOT NULL,
    "crm_class_id" VARCHAR(128) NOT NULL,
    "original_crm_teacher_id" VARCHAR(128) NOT NULL,
    "crm_student_id" VARCHAR(128),
    "crm_group_id" VARCHAR(128),
    "lesson_date" TIMESTAMPTZ(6),
    "lesson_status" VARCHAR(64) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "close_reason" VARCHAR(32),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teacher_substitutions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "teacher_substitutions_crm_teacher_id_crm_class_id_key" ON "teacher_substitutions"("crm_teacher_id", "crm_class_id");
CREATE INDEX "teacher_substitutions_crm_teacher_id_closed_at_idx" ON "teacher_substitutions"("crm_teacher_id", "closed_at");
CREATE INDEX "teacher_substitutions_crm_class_id_idx" ON "teacher_substitutions"("crm_class_id");
