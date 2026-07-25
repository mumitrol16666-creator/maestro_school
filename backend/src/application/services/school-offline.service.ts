import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError } from "../../domain/errors.js";
import { fetchStudentOfflineSummary } from "../../infrastructure/crm/crm-client.js";
import { aqtobeMonthKey } from "../../lib/aqtobe-month.js";

type OfflineSummaryLesson = {
  crmClassId?: string;
  [key: string]: unknown;
};

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
  const mergedLessonHistory = lessonHistory.map((lesson) => {
    const check = lesson.crmClassId ? checksByClassId.get(lesson.crmClassId) : null;
    if (!check) return lesson;
    const planItems = check.monthlyPlanId ? planItemsById.get(check.monthlyPlanId) : null;
    const updates = Array.isArray(check.planTopicUpdates)
      ? check.planTopicUpdates as OfflinePlanTopicUpdate[]
      : [];
    return {
      ...lesson,
      lessonPoints: check.lessonPoints,
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
