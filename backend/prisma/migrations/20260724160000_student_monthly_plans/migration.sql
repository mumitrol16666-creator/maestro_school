CREATE TABLE "student_monthly_plans" (
    "id" UUID NOT NULL,
    "crm_student_id" VARCHAR(128) NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "goal" TEXT NOT NULL DEFAULT '',
    "expected_result" TEXT NOT NULL DEFAULT '',
    "skills" TEXT NOT NULL DEFAULT '',
    "checkpoint" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "items" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_monthly_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_monthly_plans_crm_student_id_teacher_user_id_month_key"
    ON "student_monthly_plans"("crm_student_id", "teacher_user_id", "month");

CREATE INDEX "student_monthly_plans_teacher_user_id_month_idx"
    ON "student_monthly_plans"("teacher_user_id", "month");

CREATE INDEX "student_monthly_plans_crm_student_id_month_idx"
    ON "student_monthly_plans"("crm_student_id", "month");

ALTER TABLE "student_monthly_plans"
    ADD CONSTRAINT "student_monthly_plans_teacher_user_id_fkey"
    FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
