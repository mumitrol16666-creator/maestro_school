import type { HomeworkAttachmentType, HomeworkSubmissionStatus, Prisma } from "@prisma/client";
import { formatFio } from "../../domain/name.js";
import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import { NotFoundError } from "../../domain/errors.js";

export async function getHomeworkById(homeworkId: string) {
  const homework = await prisma.homework.findFirst({
    where: { id: homeworkId, ...notDeleted },
    include: { lesson: { select: { id: true, title: true } } },
  });
  if (!homework) throw new NotFoundError("Homework");
  return homework;
}

export async function createHomeworkSubmission(params: {
  homeworkId: string;
  studentId: string;
  comment?: string;
  attachmentUrl?: string;
  attachmentType?: HomeworkAttachmentType;
  testAnswers?: Record<string, string>;
  testScore?: number;
  testPassed?: boolean;
  status?: HomeworkSubmissionStatus;
  reviewComment?: string;
  reviewedAt?: Date;
}) {
  return prisma.homeworkSubmission.create({
    data: {
      homeworkId: params.homeworkId,
      studentId: params.studentId,
      comment: params.comment,
      attachmentUrl: params.attachmentUrl,
      attachmentType: params.attachmentType,
      testAnswers: params.testAnswers as Prisma.InputJsonValue | undefined,
      testScore: params.testScore,
      testPassed: params.testPassed,
      status: params.status ?? "submitted",
      reviewComment: params.reviewComment,
      reviewedAt: params.reviewedAt,
    },
  });
}

export interface HomeworkAttemptItem {
  id: string;
  homeworkId: string;
  attemptNumber: number;
  comment: string | null;
  attachmentUrl: string | null;
  attachmentType: HomeworkAttachmentType | null;
  testScore: number | null;
  testPassed: boolean | null;
  status: string;
  reviewComment: string | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  createdAt: Date;
}

function mapAttempts(
  rows: Array<{
    id: string;
    homeworkId: string;
    comment: string | null;
    attachmentUrl: string | null;
    attachmentType: HomeworkAttachmentType | null;
    testScore: number | null;
    testPassed: boolean | null;
    status: string;
    reviewComment: string | null;
    reviewedAt: Date | null;
    reviewedBy: { firstName: string; lastName: string; middleName?: string | null } | null;
    createdAt: Date;
  }>,
): HomeworkAttemptItem[] {
  return rows.map((row, index) => ({
    id: row.id,
    homeworkId: row.homeworkId,
    attemptNumber: index + 1,
    comment: row.comment,
    attachmentUrl: row.attachmentUrl,
    attachmentType: row.attachmentType,
    testScore: row.testScore,
    testPassed: row.testPassed,
    status: row.status,
    reviewComment: row.reviewComment,
    reviewedAt: row.reviewedAt,
    reviewedBy: row.reviewedBy
      ? formatFio(row.reviewedBy)
      : null,
    createdAt: row.createdAt,
  }));
}

export async function listStudentHomeworkSubmissions(homeworkId: string, studentId: string) {
  const rows = await prisma.homeworkSubmission.findMany({
    where: { homeworkId, studentId },
    orderBy: { createdAt: "asc" },
    include: {
      reviewedBy: { select: { firstName: true, lastName: true, middleName: true } },
    },
  });
  return mapAttempts(rows);
}

export async function listHomeworkAttemptsBySubmission(submissionId: string) {
  const submission = await prisma.homeworkSubmission.findUnique({
    where: { id: submissionId },
    select: { homeworkId: true, studentId: true },
  });
  if (!submission) return null;

  const rows = await prisma.homeworkSubmission.findMany({
    where: {
      homeworkId: submission.homeworkId,
      studentId: submission.studentId,
    },
    orderBy: { createdAt: "asc" },
    include: {
      reviewedBy: { select: { firstName: true, lastName: true, middleName: true } },
    },
  });

  return {
    homeworkId: submission.homeworkId,
    studentId: submission.studentId,
    attempts: mapAttempts(rows),
  };
}
