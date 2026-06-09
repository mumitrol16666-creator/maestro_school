-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('pdf', 'image', 'file', 'link');
CREATE TYPE "DifficultyLevel" AS ENUM ('beginner', 'intermediate', 'advanced', 'all_levels');
CREATE TYPE "StudentCourseStatus" AS ENUM ('enrolled', 'active', 'completed', 'paused', 'cancelled');
CREATE TYPE "LessonProgressStatus" AS ENUM ('locked', 'available', 'in_progress', 'submitted', 'reviewed', 'completed');
CREATE TYPE "HomeworkSubmissionStatus" AS ENUM ('pending', 'submitted', 'under_review', 'approved', 'rejected');
CREATE TYPE "AuditAction" AS ENUM ('create', 'update', 'delete', 'restore', 'publish', 'unpublish');
CREATE TYPE "AchievementCriteriaType" AS ENUM ('first_lesson_completed', 'points_threshold', 'first_module_completed', 'lessons_completed_count');

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "schools" (
    "id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(128) NOT NULL,
    "address" VARCHAR(512),
    "phone" VARCHAR(32),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(32),
    "password_hash" VARCHAR(255) NOT NULL,
    "first_name" VARCHAR(128) NOT NULL,
    "last_name" VARCHAR(128) NOT NULL,
    "avatar" VARCHAR(512),
    "role_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "teachers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "branch_id" UUID,
    "title" VARCHAR(255),
    "bio" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "directions" (
    "id" UUID NOT NULL,
    "school_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "directions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "direction_id" UUID NOT NULL,
    "branch_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "thumbnail" VARCHAR(512),
    "difficulty_level" "DifficultyLevel" NOT NULL DEFAULT 'beginner',
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_modules" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "course_modules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "video_url" VARCHAR(512),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "points_reward" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lesson_materials" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "type" "MaterialType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "url" VARCHAR(1024) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "lesson_materials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_courses" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "status" "StudentCourseStatus" NOT NULL DEFAULT 'enrolled',
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "student_courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lesson_progress" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "status" "LessonProgressStatus" NOT NULL DEFAULT 'locked',
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "homeworks" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "homeworks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "homework_submissions" (
    "id" UUID NOT NULL,
    "homework_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "comment" TEXT,
    "attachment_url" VARCHAR(1024),
    "status" "HomeworkSubmissionStatus" NOT NULL DEFAULT 'submitted',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "homework_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "points_transactions" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" VARCHAR(512) NOT NULL,
    "lesson_id" UUID,
    "awarded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "points_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "achievements" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "criteria_type" "AchievementCriteriaType" NOT NULL,
    "threshold" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_achievements" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "achievement_id" UUID NOT NULL,
    "earned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_achievements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "news_posts" (
    "id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL,
    "author_id" UUID NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "news_posts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "actor_id" UUID,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_slug_key" ON "roles"("slug");
CREATE INDEX "roles_slug_idx" ON "roles"("slug");
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");
CREATE INDEX "permissions_code_idx" ON "permissions"("code");
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");
CREATE INDEX "role_permissions_role_id_idx" ON "role_permissions"("role_id");
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");
CREATE UNIQUE INDEX "schools_slug_key" ON "schools"("slug");
CREATE INDEX "schools_slug_idx" ON "schools"("slug");
CREATE INDEX "schools_deleted_at_idx" ON "schools"("deleted_at");
CREATE UNIQUE INDEX "branches_school_id_slug_key" ON "branches"("school_id", "slug");
CREATE INDEX "branches_school_id_idx" ON "branches"("school_id");
CREATE INDEX "branches_deleted_at_idx" ON "branches"("deleted_at");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_role_id_idx" ON "users"("role_id");
CREATE INDEX "users_email_idx" ON "users"("email");
CREATE INDEX "users_is_active_idx" ON "users"("is_active");
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
CREATE UNIQUE INDEX "teachers_user_id_key" ON "teachers"("user_id");
CREATE INDEX "teachers_branch_id_idx" ON "teachers"("branch_id");
CREATE INDEX "teachers_deleted_at_idx" ON "teachers"("deleted_at");
CREATE UNIQUE INDEX "directions_slug_key" ON "directions"("slug");
CREATE INDEX "directions_slug_idx" ON "directions"("slug");
CREATE INDEX "directions_is_published_idx" ON "directions"("is_published");
CREATE INDEX "directions_school_id_idx" ON "directions"("school_id");
CREATE INDEX "directions_deleted_at_idx" ON "directions"("deleted_at");
CREATE INDEX "courses_direction_id_idx" ON "courses"("direction_id");
CREATE INDEX "courses_branch_id_idx" ON "courses"("branch_id");
CREATE INDEX "courses_is_published_idx" ON "courses"("is_published");
CREATE INDEX "courses_deleted_at_idx" ON "courses"("deleted_at");
CREATE INDEX "course_modules_course_id_sort_order_idx" ON "course_modules"("course_id", "sort_order");
CREATE INDEX "course_modules_deleted_at_idx" ON "course_modules"("deleted_at");
CREATE INDEX "lessons_module_id_sort_order_idx" ON "lessons"("module_id", "sort_order");
CREATE INDEX "lessons_is_published_idx" ON "lessons"("is_published");
CREATE INDEX "lessons_deleted_at_idx" ON "lessons"("deleted_at");
CREATE INDEX "lesson_materials_lesson_id_sort_order_idx" ON "lesson_materials"("lesson_id", "sort_order");
CREATE UNIQUE INDEX "student_courses_student_id_course_id_key" ON "student_courses"("student_id", "course_id");
CREATE INDEX "student_courses_student_id_status_idx" ON "student_courses"("student_id", "status");
CREATE INDEX "student_courses_course_id_idx" ON "student_courses"("course_id");
CREATE UNIQUE INDEX "lesson_progress_student_id_lesson_id_key" ON "lesson_progress"("student_id", "lesson_id");
CREATE INDEX "lesson_progress_student_id_status_idx" ON "lesson_progress"("student_id", "status");
CREATE INDEX "lesson_progress_lesson_id_idx" ON "lesson_progress"("lesson_id");
CREATE INDEX "homeworks_lesson_id_idx" ON "homeworks"("lesson_id");
CREATE INDEX "homeworks_deleted_at_idx" ON "homeworks"("deleted_at");
CREATE INDEX "homework_submissions_homework_id_idx" ON "homework_submissions"("homework_id");
CREATE INDEX "homework_submissions_student_id_status_idx" ON "homework_submissions"("student_id", "status");
CREATE INDEX "homework_submissions_reviewed_by_idx" ON "homework_submissions"("reviewed_by");
CREATE INDEX "points_transactions_student_id_created_at_idx" ON "points_transactions"("student_id", "created_at");
CREATE INDEX "points_transactions_student_id_lesson_id_idx" ON "points_transactions"("student_id", "lesson_id");
CREATE INDEX "points_transactions_awarded_by_idx" ON "points_transactions"("awarded_by");
CREATE UNIQUE INDEX "achievements_code_key" ON "achievements"("code");
CREATE INDEX "achievements_code_idx" ON "achievements"("code");
CREATE INDEX "achievements_criteria_type_idx" ON "achievements"("criteria_type");
CREATE UNIQUE INDEX "student_achievements_student_id_achievement_id_key" ON "student_achievements"("student_id", "achievement_id");
CREATE INDEX "student_achievements_student_id_idx" ON "student_achievements"("student_id");
CREATE INDEX "student_achievements_achievement_id_idx" ON "student_achievements"("achievement_id");
CREATE INDEX "news_posts_is_published_published_at_idx" ON "news_posts"("is_published", "published_at");
CREATE INDEX "news_posts_author_id_idx" ON "news_posts"("author_id");
CREATE INDEX "news_posts_deleted_at_idx" ON "news_posts"("deleted_at");
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "directions" ADD CONSTRAINT "directions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "courses" ADD CONSTRAINT "courses_direction_id_fkey" FOREIGN KEY ("direction_id") REFERENCES "directions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "courses" ADD CONSTRAINT "courses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "course_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_materials" ADD CONSTRAINT "lesson_materials_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_courses" ADD CONSTRAINT "student_courses_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_courses" ADD CONSTRAINT "student_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homeworks" ADD CONSTRAINT "homeworks_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_homework_id_fkey" FOREIGN KEY ("homework_id") REFERENCES "homeworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "points_transactions" ADD CONSTRAINT "points_transactions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "points_transactions" ADD CONSTRAINT "points_transactions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "points_transactions" ADD CONSTRAINT "points_transactions_awarded_by_fkey" FOREIGN KEY ("awarded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "student_achievements" ADD CONSTRAINT "student_achievements_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_achievements" ADD CONSTRAINT "student_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "achievements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "news_posts" ADD CONSTRAINT "news_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
