CREATE TABLE "legacy_homework_resolutions" (
  "id" UUID NOT NULL,
  "crm_student_id" VARCHAR(128) NOT NULL,
  "crm_class_id" VARCHAR(128) NOT NULL,
  "decision" VARCHAR(32) NOT NULL CHECK ("decision" IN ('accepted', 'continue', 'obsolete')),
  "comment" TEXT NOT NULL DEFAULT '',
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "history" JSONB NOT NULL DEFAULT '[]',
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "legacy_homework_resolutions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "legacy_homework_resolutions_crm_student_id_crm_class_id_key"
  ON "legacy_homework_resolutions"("crm_student_id", "crm_class_id");
