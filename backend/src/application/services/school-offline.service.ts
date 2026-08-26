import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError } from "../../domain/errors.js";
import { linkOfflineHomeworkResults } from "../../domain/offline-homework-progress.js";
import { fetchStudentOfflineSummary } from "../../infrastructure/crm/crm-client.js";
import { aqtobeMonthKey } from "../../lib/aqtobe-month.js";

type OfflineSummaryLesson = {
  crmClassId?: string;
  date?: string;
  startTime?: string | null;
  homework?: string | null;
  crmGroupId?: string | null;
  crmTeacherId?: string | null;
  groupName?: string | null;
  teacherName?: string | null;
  homeworkReview?: {
    sourceCrmClassId?: string | null;
    status?: string | null;
    completionPercent?: number | null;
    reviewedAt?: string | Date | null;
  } | null;
  [key: string]: unknown;
};

type OfflineSummaryReview = {
  crmClassId: string;
  sourceCrmClassId?: string | null;
  status: string;
  completionPercent?: number | null;
  reviewedAt?: Date | null;
};

function reviewDate(value?: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hasHomeworkResult(status?: string | null) {
  return ["completed", "partial", "not_completed"].includes(status ?? "");
}

type OfflinePlanItem = {
  id: string;
  title: string;
  status: "planned" | "in_progress" | "completed" | "moved";
};

type OfflinePlanTopicUpdate = {
  itemId: string;
  status: "in_progress" | "completed";
};

export async function getStudentSchoolOfflineSummary(appUserId: string) {
  const user = await prisma.user.findFirst({
    where: { id: appUserId },
    select: { crmStudentId: true, externalLinkStatus: true },
  });

  if (!user?.crmStudentId) {
    throw new BadRequestError(
      "Профиль школы не подключён. Обратитесь к администратору Maestro.",
      "CRM_NOT_LINKED",
    );
  }

  const summary = await fetchStudentOfflineSummary(user.crmStudentId);
  const lessonHistory = Array.isArray(summary.lessonHistory)
    ? summary.lessonHistory as OfflineSummaryLesson[]
    : [];
  const classIds = lessonHistory
    .map((lesson) => lesson.crmClassId)
    .filter((value): value is string => Boolean(value));
  const month = aqtobeMonthKey();
  const [checks, monthlyPlan] = await Promise.all([
    classIds.length
      ? prisma.offlineLessonStudentCheck.findMany({
          where: {
            crmStudentId: user.crmStudentId,
            crmClassId: { in: classIds },
          },
        })
      : Promise.resolve([]),
    prisma.studentMonthlyPlan.findFirst({
      where: { crmStudentId: user.crmStudentId, month },
      include: {
        teacherUser: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  const planIds = [...new Set(
    checks.map((check) => check.monthlyPlanId).filter((value): value is string => Boolean(value)),
  )];
  const plans = planIds.length
    ? await prisma.studentMonthlyPlan.findMany({ where: { id: { in: planIds } } })
    : [];
  const planItemsById = new Map(
    plans.map((plan) => [
      plan.id,
      new Map(((Array.isArray(plan.items) ? plan.items : []) as OfflinePlanItem[])
        .map((item) => [item.id, item])),
    ]),
  );
  const checksByClassId = new Map(checks.map((check) => [check.crmClassId, check]));
  const reviewsByClassId = new Map<string, OfflineSummaryReview>();
  for (const lesson of lessonHistory) {
    const review = lesson.homeworkReview;
    if (!lesson.crmClassId || !review?.status) continue;
    reviewsByClassId.set(lesson.crmClassId, {
      crmClassId: lesson.crmClassId,
      sourceCrmClassId: review.sourceCrmClassId,
      status: review.status,
      completionPercent: review.completionPercent,
      reviewedAt: reviewDate(review.reviewedAt),
    });
  }
  for (const check of checks) {
    const remote = reviewsByClassId.get(check.crmClassId);
    if (!hasHomeworkResult(check.homeworkStatus) && remote && hasHomeworkResult(remote.status)) continue;
    reviewsByClassId.set(check.crmClassId, {
      crmClassId: check.crmClassId,
      sourceCrmClassId: check.reviewedHomeworkCrmClassId ?? remote?.sourceCrmClassId,
      status: check.homeworkStatus,
      completionPercent: check.homeworkCompletionPercent,
      reviewedAt: check.markedAt,
    });
  }
  const homeworkResultsByClassId = linkOfflineHomeworkResults(
    lessonHistory
      .filter((lesson): lesson is OfflineSummaryLesson & { crmClassId: string; date: string } =>
        Boolean(lesson.crmClassId && lesson.date))
      .map((lesson) => ({
        crmClassId: lesson.crmClassId,
        date: lesson.date,
        startTime: lesson.startTime,
        homework: lesson.homework,
        crmGroupId: lesson.crmGroupId,
        crmTeacherId: lesson.crmTeacherId,
        groupName: lesson.groupName,
        teacherName: lesson.teacherName,
      })),
    Array.from(reviewsByClassId.values()),
  );
  const mergedLessonHistory = lessonHistory.map((lesson) => {
    const check = lesson.crmClassId ? checksByClassId.get(lesson.crmClassId) : null;
    const homeworkResult = lesson.crmClassId
      ? homeworkResultsByClassId.get(lesson.crmClassId) ?? null
      : null;
    if (!check && !homeworkResult) return lesson;
    const planItems = check?.monthlyPlanId ? planItemsById.get(check.monthlyPlanId) : null;
    const updates = Array.isArray(check?.planTopicUpdates)
      ? check.planTopicUpdates as OfflinePlanTopicUpdate[]
      : [];
    return {
      ...lesson,
      lessonPoints: check?.lessonPoints,
      lessonPointsAwarded: check?.rewardsAppliedAt ? check.lessonPoints : null,
      homeworkResult,
      planTopicResults: updates.map((update) => ({
        itemId: update.itemId,
        title: planItems?.get(update.itemId)?.title ?? "Тема учебного плана",
        status: update.status,
      })),
    };
  });
  const planItems = monthlyPlan && Array.isArray(monthlyPlan.items)
    ? monthlyPlan.items as OfflinePlanItem[]
    : [];
  const activePlanItems = planItems.filter((item) => item.status !== "moved");
  const completedCount = activePlanItems.filter((item) => item.status === "completed").length;
  const inProgressCount = activePlanItems.filter((item) => item.status === "in_progress").length;

  return {
    ...summary,
    lessonHistory: mergedLessonHistory,
    monthlyPlan: monthlyPlan
      ? {
          id: monthlyPlan.id,
          month: monthlyPlan.month,
          goal: monthlyPlan.goal,
          expectedResult: monthlyPlan.expectedResult,
          skills: monthlyPlan.skills,
          checkpoint: monthlyPlan.checkpoint,
          items: planItems,
          teacherName: [monthlyPlan.teacherUser.firstName, monthlyPlan.teacherUser.lastName]
            .filter(Boolean)
            .join(" "),
          completedCount,
          inProgressCount,
          plannedCount: activePlanItems.length - completedCount - inProgressCount,
          progressPercent: activePlanItems.length
            ? Math.round((completedCount / activePlanItems.length) * 100)
            : 0,
        }
      : null,
    linkStatus: user.externalLinkStatus ?? "linked",
  };
}
