import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";

export type OfflinePlanTopicUpdate = {
  itemId: string;
  status: "in_progress" | "completed";
};

type MonthlyPlanItem = {
  id: string;
  title: string;
  status: "planned" | "in_progress" | "completed" | "moved";
};

export type OfflineHomeworkStatus =
  | "not_checked"
  | "completed"
  | "partial"
  | "not_completed"
  | "not_assigned";

export type OfflineHomeworkReviewInput = {
  status: OfflineHomeworkStatus;
  completionPercent?: number | null;
  difficulties?: string | null;
  notCompletedReason?: string | null;
};

export async function saveOfflineLessonStudentCheck(params: {
  crmClassId: string;
  crmStudentId: string;
  teacherUserId?: string;
  attendanceStatus: string;
  teacherNote?: string;
  homeworkReview?: OfflineHomeworkReviewInput;
  lessonPoints?: number;
  monthlyPlanId?: string | null;
  planTopicUpdates?: OfflinePlanTopicUpdate[];
}) {
  const homework = params.homeworkReview;
  const data = {
    attendanceStatus: params.attendanceStatus,
    teacherNote: params.teacherNote?.trim() || null,
    markedAt: new Date(),
    ...(params.lessonPoints !== undefined ? { lessonPoints: params.lessonPoints } : {}),
    ...(params.monthlyPlanId !== undefined ? { monthlyPlanId: params.monthlyPlanId } : {}),
    ...(params.planTopicUpdates !== undefined
      ? { planTopicUpdates: params.planTopicUpdates as Prisma.InputJsonValue }
      : {}),
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
      lessonPoints: params.lessonPoints ?? 0,
      monthlyPlanId: params.monthlyPlanId ?? null,
      planTopicUpdates: (params.planTopicUpdates ?? []) as Prisma.InputJsonValue,
      markedAt: new Date(),
    },
    update: data,
  });
}

export async function mergeOfflineLessonStudentChecks<T extends {
  students: Array<Record<string, unknown>>;
}>(
  crmClassId: string,
  roster: T,
  context?: { teacherUserId?: string; month?: string },
): Promise<T> {
  const studentIds = roster.students
    .map((student) => typeof student.crmStudentId === "string" ? student.crmStudentId : "")
    .filter(Boolean);

  if (!studentIds.length) return roster;

  const [checks, plans] = await Promise.all([
    prisma.offlineLessonStudentCheck.findMany({
      where: { crmClassId, crmStudentId: { in: studentIds } },
    }),
    context?.teacherUserId && context.month
      ? prisma.studentMonthlyPlan.findMany({
          where: {
            teacherUserId: context.teacherUserId,
            month: context.month,
            crmStudentId: { in: studentIds },
          },
        })
      : Promise.resolve([]),
  ]);
  const byStudentId = new Map(checks.map((check) => [check.crmStudentId, check]));
  const planByStudentId = new Map(plans.map((plan) => [plan.crmStudentId, plan]));

  return {
    ...roster,
    students: roster.students.map((student) => {
      const studentId = typeof student.crmStudentId === "string" ? student.crmStudentId : "";
      const check = byStudentId.get(studentId);
      const plan = planByStudentId.get(studentId);

      return {
        ...student,
        ...(check
          ? {
              teacherNote: check.teacherNote ?? student.teacherNote,
              homeworkReview: {
                status: check.homeworkStatus,
                completionPercent: check.homeworkCompletionPercent,
                difficulties: check.homeworkDifficulties,
                notCompletedReason: check.homeworkNotCompletedReason,
              },
              lessonPoints: check.lessonPoints,
              monthlyPlanId: check.monthlyPlanId,
              planTopicUpdates: check.planTopicUpdates as OfflinePlanTopicUpdate[],
              rewardsAppliedAt: check.rewardsAppliedAt?.toISOString() ?? null,
              appMarkedAt: check.markedAt.toISOString(),
            }
          : {}),
        monthlyPlan: plan
          ? {
              id: plan.id,
              month: plan.month,
              goal: plan.goal,
              items: plan.items as MonthlyPlanItem[],
            }
          : null,
      };
    }),
  };
}
