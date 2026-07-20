import { prisma } from "../../infrastructure/database/prisma.js";

export type OfflineHomeworkStatus =
  | "not_checked"
  | "completed"
  | "partial"
  | "not_completed"
  | "not_assigned";

export type OfflineHomeworkReviewInput = {
  status: OfflineHomeworkStatus;
  completionPercent?: number;
  difficulties?: string;
  notCompletedReason?: string;
};

export async function saveOfflineLessonStudentCheck(params: {
  crmClassId: string;
  crmStudentId: string;
  teacherUserId?: string;
  attendanceStatus: string;
  teacherNote?: string;
  homeworkReview?: OfflineHomeworkReviewInput;
}) {
  const homework = params.homeworkReview;
  const data = {
    attendanceStatus: params.attendanceStatus,
    teacherNote: params.teacherNote?.trim() || null,
    markedAt: new Date(),
    ...(params.teacherUserId ? { teacherUserId: params.teacherUserId } : {}),
    ...(homework
      ? {
          homeworkStatus: homework.status,
          homeworkCompletionPercent: homework.completionPercent ?? null,
          homeworkDifficulties: homework.difficulties?.trim() || null,
          homeworkNotCompletedReason: homework.notCompletedReason?.trim() || null,
        }
      : {}),
  };

  return prisma.offlineLessonStudentCheck.upsert({
    where: {
      crmClassId_crmStudentId: {
        crmClassId: params.crmClassId,
        crmStudentId: params.crmStudentId,
      },
    },
    create: {
      crmClassId: params.crmClassId,
      crmStudentId: params.crmStudentId,
      teacherUserId: params.teacherUserId,
      attendanceStatus: params.attendanceStatus,
      teacherNote: params.teacherNote?.trim() || null,
      homeworkStatus: homework?.status ?? "not_checked",
      homeworkCompletionPercent: homework?.completionPercent ?? null,
      homeworkDifficulties: homework?.difficulties?.trim() || null,
      homeworkNotCompletedReason: homework?.notCompletedReason?.trim() || null,
      markedAt: new Date(),
    },
    update: data,
  });
}

export async function mergeOfflineLessonStudentChecks<T extends {
  students: Array<Record<string, unknown>>;
}>(crmClassId: string, roster: T): Promise<T> {
  const studentIds = roster.students
    .map((student) => typeof student.crmStudentId === "string" ? student.crmStudentId : "")
    .filter(Boolean);

  if (!studentIds.length) return roster;

  const checks = await prisma.offlineLessonStudentCheck.findMany({
    where: { crmClassId, crmStudentId: { in: studentIds } },
  });
  const byStudentId = new Map(checks.map((check) => [check.crmStudentId, check]));

  return {
    ...roster,
    students: roster.students.map((student) => {
      const studentId = typeof student.crmStudentId === "string" ? student.crmStudentId : "";
      const check = byStudentId.get(studentId);
      if (!check) return student;

      return {
        ...student,
        teacherNote: check.teacherNote ?? student.teacherNote,
        homeworkReview: {
          status: check.homeworkStatus,
          completionPercent: check.homeworkCompletionPercent,
          difficulties: check.homeworkDifficulties,
          notCompletedReason: check.homeworkNotCompletedReason,
        },
        appMarkedAt: check.markedAt.toISOString(),
      };
    }),
  };
}
