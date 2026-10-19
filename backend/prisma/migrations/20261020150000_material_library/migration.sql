-- Plan 1.12: the shared library of materials, course lessons sent to students, and media links
-- made relative so files are served to signed-in users from the same site.

-- CreateEnum
CREATE TYPE "MaterialKind" AS ENUM ('video', 'image', 'pdf', 'audio', 'file', 'link');

-- AlterEnum
ALTER TYPE "UserNotificationType" ADD VALUE IF NOT EXISTS 'material_shared';

-- CreateTable
CREATE TABLE "material_library_items" (
    "id" UUID NOT NULL,
    "kind" "MaterialKind" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "mime_type" VARCHAR(128),
    "size_bytes" INTEGER,
    "media_folder" VARCHAR(16),
    "media_filename" VARCHAR(255),
    "created_by_id" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "material_library_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_shares" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "student_user_id" UUID NOT NULL,
    "shared_by_id" UUID,
    "note" TEXT,
    "viewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "material_library_items_archived_at_created_at_idx" ON "material_library_items"("archived_at", "created_at");

-- CreateIndex
CREATE INDEX "material_library_items_url_idx" ON "material_library_items"("url");

-- CreateIndex
CREATE INDEX "lesson_shares_student_user_id_created_at_idx" ON "lesson_shares"("student_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_shares_lesson_id_student_user_id_key" ON "lesson_shares"("lesson_id", "student_user_id");

-- AddForeignKey
ALTER TABLE "material_library_items" ADD CONSTRAINT "material_library_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_shares" ADD CONSTRAINT "lesson_shares_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_shares" ADD CONSTRAINT "lesson_shares_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_shares" ADD CONSTRAINT "lesson_shares_shared_by_id_fkey" FOREIGN KEY ("shared_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Uploaded media used to be stored as absolute URLs, often with an http scheme behind the TLS
-- proxy. Keep the path only: the files are served from the same site to signed-in users.
UPDATE "lesson_materials" SET "url" = regexp_replace("url", '^https?://[^/]+(/api/v1/media/)', '\1') WHERE "url" ~ '^https?://[^/]+/api/v1/media/';
UPDATE "online_lesson_assignment_materials" SET "url" = regexp_replace("url", '^https?://[^/]+(/api/v1/media/)', '\1') WHERE "url" ~ '^https?://[^/]+/api/v1/media/';
UPDATE "courses" SET "thumbnail" = regexp_replace("thumbnail", '^https?://[^/]+(/api/v1/media/)', '\1') WHERE "thumbnail" ~ '^https?://[^/]+/api/v1/media/';
UPDATE "directions" SET "image_url" = regexp_replace("image_url", '^https?://[^/]+(/api/v1/media/)', '\1') WHERE "image_url" ~ '^https?://[^/]+/api/v1/media/';
UPDATE "news_posts" SET "content" = regexp_replace("content", 'https?://[^/\s)"]+(/api/v1/media/)', '\1', 'g') WHERE "content" ~ 'https?://[^/\s)"]+/api/v1/media/';
UPDATE "learning_plan_versions" SET "materials" = regexp_replace("materials"::text, '"https?://[^/"]+(/api/v1/media/)', '"\1', 'g')::jsonb WHERE "materials"::text ~ '"https?://[^/"]+/api/v1/media/';
UPDATE "sector_template_topics" SET "materials" = regexp_replace("materials"::text, '"https?://[^/"]+(/api/v1/media/)', '"\1', 'g')::jsonb WHERE "materials"::text ~ '"https?://[^/"]+/api/v1/media/';
UPDATE "learning_homework_assignments" SET "materials" = regexp_replace("materials"::text, '"https?://[^/"]+(/api/v1/media/)', '"\1', 'g')::jsonb WHERE "materials"::text ~ '"https?://[^/"]+/api/v1/media/';
UPDATE "learning_homework_attempts" SET "materials" = regexp_replace("materials"::text, '"https?://[^/"]+(/api/v1/media/)', '"\1', 'g')::jsonb WHERE "materials"::text ~ '"https?://[^/"]+/api/v1/media/';
