-- User Link: CRM integration fields on users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "crm_student_id" VARCHAR(64);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "crm_teacher_id" VARCHAR(64);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_normalized" VARCHAR(32);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "external_link_status" VARCHAR(32);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "linked_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX IF NOT EXISTS "users_crm_student_id_key" ON "users"("crm_student_id");
CREATE UNIQUE INDEX IF NOT EXISTS "users_crm_teacher_id_key" ON "users"("crm_teacher_id");
CREATE INDEX IF NOT EXISTS "users_phone_normalized_idx" ON "users"("phone_normalized");
CREATE INDEX IF NOT EXISTS "users_crm_student_id_idx" ON "users"("crm_student_id");
CREATE INDEX IF NOT EXISTS "users_crm_teacher_id_idx" ON "users"("crm_teacher_id");
