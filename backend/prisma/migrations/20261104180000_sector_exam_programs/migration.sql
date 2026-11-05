CREATE TABLE "sector_exam_programs" (
 "id" UUID PRIMARY KEY, "direction_id" UUID NOT NULL, "sector_number" INTEGER NOT NULL,
 "title" VARCHAR(255) NOT NULL, "duration_minutes" INTEGER NOT NULL DEFAULT 15,
 "items" JSONB NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
 "archived_at" TIMESTAMPTZ(6), "created_by_id" UUID NOT NULL,
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "sector_exam_programs_direction_fkey" FOREIGN KEY ("direction_id") REFERENCES "directions"("id") ON DELETE RESTRICT,
 CONSTRAINT "sector_exam_programs_positive_sector" CHECK ("sector_number" > 0),
 CONSTRAINT "sector_exam_programs_positive_duration" CHECK ("duration_minutes" > 0)
);
CREATE INDEX "sector_exam_programs_direction_id_sector_number_idx" ON "sector_exam_programs"("direction_id", "sector_number");
CREATE TABLE "sector_exam_sessions" (
 "id" UUID PRIMARY KEY, "program_id" UUID NOT NULL, "program_revision" INTEGER NOT NULL,
 "title" VARCHAR(255) NOT NULL, "program_snapshot" JSONB NOT NULL,
 "request_key" UUID NOT NULL, "request_fingerprint" VARCHAR(64) NOT NULL, "created_by_id" UUID NOT NULL,
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "sector_exam_sessions_program_fkey" FOREIGN KEY ("program_id") REFERENCES "sector_exam_programs"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "sector_exam_sessions_request_key_key" ON "sector_exam_sessions"("request_key");
ALTER TABLE "sector_exams" ADD COLUMN "session_id" UUID, ADD COLUMN "student_name_snapshot" VARCHAR(255), ADD COLUMN "program_title_snapshot" VARCHAR(255);
ALTER TABLE "sector_exams" ADD CONSTRAINT "sector_exams_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sector_exam_sessions"("id") ON DELETE RESTRICT;
