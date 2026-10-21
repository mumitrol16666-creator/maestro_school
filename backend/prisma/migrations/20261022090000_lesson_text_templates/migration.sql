-- Plan 1.14: summary and homework phrases for the lesson — a teacher's own and the school's per direction.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "LessonTextTemplateKind" AS ENUM ('summary', 'homework');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "lesson_text_templates" (
    "id" UUID NOT NULL,
    "kind" "LessonTextTemplateKind" NOT NULL,
    "text" VARCHAR(500) NOT NULL,
    "owner_id" UUID,
    "crm_direction_id" VARCHAR(64),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lesson_text_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "lesson_text_templates_owner_id_kind_archived_at_idx" ON "lesson_text_templates"("owner_id", "kind", "archived_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "lesson_text_templates_crm_direction_id_kind_archived_at_idx" ON "lesson_text_templates"("crm_direction_id", "kind", "archived_at");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "lesson_text_templates" ADD CONSTRAINT "lesson_text_templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
