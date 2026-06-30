import type { HomeworkSubmissionStatus, Prisma } from "@prisma/client";
import { formatFio } from "../../domain/name.js";
import { prisma } from "../../infrastructure/database/prisma.js";

export type AdminSubmissionFilterStatus = "submitted" | "reviewed" | "completed" | "rejected";

const STATUS_MAP: Record<AdminSubmissionFilterStatus, HomeworkSubmissionStatus> = {
  submitted: "submitted",
  reviewed: "under_review",
  completed: "approved",
  rejected: "rejected",
};

export interface ListAdminSubmissionsInput {
  status?: AdminSubmissionFilterStatus;
  courseId?: string;
  studentId?: string;
  search?: string;
  page: number;
  limit: number;
}

function buildSearchWhere(search: string): Prisma.HomeworkSubmissionWhereInput {
  const insensitive = { contains: search, mode: "insensitive" as const };

  return {
    OR: [
      { student: { firstName: insensitive } },
      { student: { lastName: insensitive } },
      { student: { middleName: insensitive } },
      { student: { email: insensitive } },
      { homework: { lesson: { title: insensitive } } },
      { homework: { lesson: { module: { course: { title: insensitive } } } } },
      { homework: { lesson: { module: { title: insensitive } } } },
    ],
  };
}

export async function listAdminHomeworkSubmissions(input: ListAdminSubmissionsInput) {
  const where: Prisma.HomeworkSubmissionWhereInput = {
    ...(input.status ? { status: STATUS_MAP[input.status] } : {}),
    ...(input.studentId ? { studentId: input.studentId } : {}),
    ...(input.courseId
      ? { homework: { lesson: { module: { courseId: input.courseId } } } }
      : {}),
    ...(input.search ? buildSearchWhere(input.search) : {}),
  };

  const skip = (input.page - 1) * input.limit;

  const [items, total] = await prisma.$transaction([
    prisma.homeworkSubmission.findMany({
      where,
      skip,
      take: input.limit,
      orderBy: { createdAt: "desc" },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, middleName: true, email: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true, middleName: true } },
        homework: {
          include: {
            lesson: {
              include: {
                module: {
                  include: {
                    course: { select: { id: true, title: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.homeworkSubmission.count({ where }),
  ]);

  const lessonIds = items.map((s) => s.homework.lesson.id);
  const studentIds = [...new Set(items.map((s) => s.studentId))];

  const progressRows = lessonIds.length
    ? await prisma.lessonProgress.findMany({
        where: { studentId: { in: studentIds }, lessonId: { in: lessonIds } },
        select: { studentId: true, lessonId: true, status: true },
      })
    : [];

  const progressKey = (studentId: string, lessonId: string) => `${studentId}:${lessonId}`;
  const progressMap = new Map(
    progressRows.map((p) => [progressKey(p.studentId, p.lessonId), p.status]),
  );

  return {
    items: items.map((s) => {
      const lesson = s.homework.lesson;
      const lessonProgressStatus = progressMap.get(progressKey(s.studentId, lesson.id)) ?? null;
      return {
        submissionId: s.id,
        studentId: s.student.id,
        studentName: formatFio(s.student),
        studentEmail: s.student.email,
        courseId: lesson.module.course.id,
        courseTitle: lesson.module.course.title,
        moduleId: lesson.module.id,
        moduleTitle: lesson.module.title,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        homeworkId: s.homeworkId,
        homeworkDescription: s.homework.description,
        studentComment: s.comment,
        attachmentUrl: s.attachmentUrl,
        attachmentType: s.attachmentType,
        homeworkType: s.homework.type,
        testScore: s.testScore,
        testPassed: s.testPassed,
        status: s.status,
        lessonProgressStatus,
        submittedAt: s.createdAt,
        reviewedAt: s.reviewedAt,
        reviewedBy: s.reviewedBy
          ? formatFio(s.reviewedBy)
          : null,
        reviewComment: s.reviewComment,
      };
    }),
    total,
  };
}

export async function getAdminHomeworkSubmission(submissionId: string) {
  const submission = await prisma.homeworkSubmission.findUnique({
    where: { id: submissionId },
    include: {
      student: { select: { id: true, firstName: true, lastName: true, middleName: true, email: true } },
      reviewedBy: { select: { id: true, firstName: true, lastName: true, middleName: true } },
      homework: {
        include: {
          lesson: {
            include: {
              module: {
                include: {
                  course: { select: { id: true, title: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!submission) return null;

  const lesson = submission.homework.lesson;
  const lessonProgress = await prisma.lessonProgress.findUnique({
    where: {
      studentId_lessonId: {
        studentId: submission.studentId,
        lessonId: lesson.id,
      },
    },
    select: { status: true },
  });

  return {
    submissionId: submission.id,
    studentId: submission.student.id,
    studentName: formatFio(submission.student),
    studentEmail: submission.student.email,
    courseId: lesson.module.course.id,
    courseTitle: lesson.module.course.title,
    moduleId: lesson.module.id,
    moduleTitle: lesson.module.title,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    homeworkId: submission.homeworkId,
    homeworkDescription: submission.homework.description,
    studentComment: submission.comment,
    attachmentUrl: submission.attachmentUrl,
    attachmentType: submission.attachmentType,
    homeworkType: submission.homework.type,
    testScore: submission.testScore,
    testPassed: submission.testPassed,
    status: submission.status,
    lessonProgressStatus: lessonProgress?.status ?? null,
    submittedAt: submission.createdAt,
    reviewedAt: submission.reviewedAt,
    reviewedBy: submission.reviewedBy
      ? formatFio(submission.reviewedBy)
      : null,
    reviewComment: submission.reviewComment,
    pointsReward: lesson.pointsReward,
  };
}
