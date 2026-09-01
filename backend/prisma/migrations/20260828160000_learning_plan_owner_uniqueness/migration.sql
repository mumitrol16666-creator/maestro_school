CREATE UNIQUE INDEX "learning_plans_student_direction_month_key"
ON "learning_plans" ("crm_student_id", "direction_id", "month")
WHERE "crm_student_id" IS NOT NULL AND "crm_group_id" IS NULL;

CREATE UNIQUE INDEX "learning_plans_group_direction_month_key"
ON "learning_plans" ("crm_group_id", "direction_id", "month")
WHERE "crm_group_id" IS NOT NULL AND "crm_student_id" IS NULL;
