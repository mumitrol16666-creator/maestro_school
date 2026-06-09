-- CreateEnum
CREATE TYPE "HomeworkAttachmentType" AS ENUM ('text', 'video', 'audio', 'file');

-- AlterTable
ALTER TABLE "homework_submissions" ADD COLUMN "attachment_type" "HomeworkAttachmentType";
