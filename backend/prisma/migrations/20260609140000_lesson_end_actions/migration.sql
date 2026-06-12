-- CreateEnum
CREATE TYPE "LessonQuestionStatus" AS ENUM ('pending', 'answered');

-- AlterTable
ALTER TABLE "lessons"
ADD COLUMN "enable_ask_teacher" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "enable_lesson_signup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "signup_course_id" UUID,
ADD COLUMN "signup_external_url" VARCHAR(1024),
ADD COLUMN "signup_label" VARCHAR(255);

-- CreateTable
CREATE TABLE "lesson_questions" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "status" "LessonQuestionStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lesson_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lessons_signup_course_id_idx" ON "lessons"("signup_course_id");

-- CreateIndex
CREATE INDEX "lesson_questions_lesson_id_status_created_at_idx" ON "lesson_questions"("lesson_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "lesson_questions_student_id_idx" ON "lesson_questions"("student_id");

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_signup_course_id_fkey" FOREIGN KEY ("signup_course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_questions" ADD CONSTRAINT "lesson_questions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_questions" ADD CONSTRAINT "lesson_questions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
