import { LearningTopicProgressSource } from "@prisma/client";
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

type OfflineLearningTopicProgressEvent = {
  topicId: string;
  fromPercent: number | null;
  toPercent: number;
  comment: string | null;
  sourceKey: string;
  occurredAt: Date;
  topic: { title: string };
};

type OfflineLearningTopicReward = {
  sourceKey: string | null;
  amount: number;
};

type OfflineLearningPlanCompletionReward = OfflineLearningTopicReward & {
  createdAt: Date;
};

type OfflineCompletedLearningPlan = {
  id: string;
  month: string;
  completedAt: Date | null;
  publishedVersionNumber: number | null;
  versions: Array<{
    version: number;
    topics: Array<{ topicId: string; state: string }>;
  }>;
};

export type OfflineLearningTopicResult = {
  topicId: string;
  title: string;
  fromPercent: number | null;
  toPercent: number;
  comment: string | null;
  occurredAt: string;
  mastered: boolean;
  masteryPointsAwarded: number;
};

export type OfflineLearningPlanCompletionResult = {
  planId: string;
  month: string;
  completedAt: string;
  pointsAwarded: number;
};

export function lessonIdFromTopicProgressSourceKey(sourceKey: string, topicId: string) {
  const prefix = "offline-lesson:";
  const suffix = `:topic:${topicId}`;
  if (!sourceKey.startsWith(prefix) || !sourceKey.endsWith(suffix)) return null;
  const crmClassId = sourceKey.slice(prefix.length, sourceKey.length - suffix.length);
  return crmClassId || null;
}

export function learningTopicResultsByClassId(
  classIds: readonly string[],
  appUserId: string,
  events: readonly OfflineLearningTopicProgressEvent[],
  rewards: readonly OfflineLearningTopicReward[],
) {
  const allowedClassIds = new Set(classIds);
  const rewardAmountBySourceKey = new Map(
    rewards
      .filter((reward): reward is OfflineLearningTopicReward & { sourceKey: string } => Boolean(reward.sourceKey))
      .map((reward) => [reward.sourceKey, reward.amount]),
  );
  const resultsByClassId = new Map<string, OfflineLearningTopicResult[]>();

  for (const event of events) {
    const crmClassId = lessonIdFromTopicProgressSourceKey(event.sourceKey, event.topicId);
    if (!crmClassId || !allowedClassIds.has(crmClassId)) continue;
    const masterySourceKey = `learning-topic-mastery:${event.topicId}:${appUserId}`;
    const result: OfflineLearningTopicResult = {
      topicId: event.topicId,
      title: event.topic.title,
      fromPercent: event.fromPercent,
      toPercent: event.toPercent,
      comment: event.comment,
      occurredAt: event.occurredAt.toISOString(),
      mastered: event.toPercent === 100,
      masteryPointsAwarded: event.toPercent === 100
        ? rewardAmountBySourceKey.get(masterySourceKey) ?? 0
        : 0,
    };
    const current = resultsByClassId.get(crmClassId) ?? [];
    current.push(result);
    resultsByClassId.set(crmClassId, current);
  }

  return resultsByClassId;
}

export function learningPlanIdFromCompletionRewardSourceKey(
  sourceKey: string,
  appUserId: string,
) {
  const prefix = "learning-plan-completion:";
  const suffix = `:${appUserId}`;
  if (!sourceKey.startsWith(prefix) || !sourceKey.endsWith(suffix)) return null;
  const planId = sourceKey.slice(prefix.length, sourceKey.length - suffix.length);
  return planId || null;
}

/**
 * Links a factual plan-completion ledger receipt to the lesson that closed it.
 * The link is deliberately conservative: if the completed plan cannot be tied
 * to exactly one CRM class at the recorded completion instant, no bonus is
 * claimed in lesson history.
 */
export function learningPlanCompletionResultsByClassId(
  classIds: readonly string[],
  appUserId: string,
  events: readonly OfflineLearningTopicProgressEvent[],
  rewards: readonly OfflineLearningPlanCompletionReward[],
  plans: readonly OfflineCompletedLearningPlan[],
) {
  const allowedClassIds = new Set(classIds);
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));
  const resultsByClassId = new Map<string, OfflineLearningPlanCompletionResult[]>();

  for (const reward of rewards) {
    if (!reward.sourceKey || reward.amount <= 0) continue;
    const planId = learningPlanIdFromCompletionRewardSourceKey(reward.sourceKey, appUserId);
    if (!planId) continue;
    const plan = plansById.get(planId);
    if (!plan?.completedAt || plan.publishedVersionNumber === null) continue;
    if (reward.createdAt.getTime() !== plan.completedAt.getTime()) continue;
    const publishedVersion = plan.versions.find(
      (version) => version.version === plan.publishedVersionNumber,
    );
    const activeTopicIds = new Set(
      publishedVersion?.topics
        .filter((topic) => topic.state === "active")
        .map((topic) => topic.topicId) ?? [],
    );
    if (activeTopicIds.size === 0) continue;

    const matchingClassIds = new Set<string>();
    for (const event of events) {
      if (
        event.toPercent !== 100
        || event.occurredAt.getTime() !== plan.completedAt.getTime()
        || !activeTopicIds.has(event.topicId)
      ) continue;
      const crmClassId = lessonIdFromTopicProgressSourceKey(event.sourceKey, event.topicId);
      if (crmClassId && allowedClassIds.has(crmClassId)) matchingClassIds.add(crmClassId);
    }
    if (matchingClassIds.size !== 1) continue;
    const [crmClassId] = matchingClassIds;
    const result: OfflineLearningPlanCompletionResult = {
      planId,
      month: plan.month,
      completedAt: plan.completedAt.toISOString(),
      pointsAwarded: reward.amount,
    };
    const current = resultsByClassId.get(crmClassId) ?? [];
    current.push(result);
    resultsByClassId.set(crmClassId, current);
  }

  return resultsByClassId;
}

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
  const classIds = [...new Set(lessonHistory
    .map((lesson) => lesson.crmClassId)
    .filter((value): value is string => Boolean(value)))];
  const month = aqtobeMonthKey();
  const [checks, monthlyPlan, learningTopicProgress, planCompletionRewards] = await Promise.all([
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
    classIds.length
      ? prisma.learningTopicProgress.findMany({
          where: {
            source: LearningTopicProgressSource.lesson,
            OR: classIds.map((crmClassId) => ({
              sourceKey: { startsWith: `offline-lesson:${crmClassId}:topic:` },
            })),
          },
          select: {
            topicId: true,
            fromPercent: true,
            toPercent: true,
            comment: true,
            sourceKey: true,
            occurredAt: true,
            topic: { select: { title: true } },
          },
          orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
        })
      : Promise.resolve([]),
    classIds.length
      ? prisma.pointsTransaction.findMany({
          where: {
            studentId: appUserId,
            sourceKey: { startsWith: "learning-plan-completion:" },
          },
          select: { sourceKey: true, amount: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);
  const masterySourceKeys = learningTopicProgress
    .filter((event) => event.toPercent === 100)
    .map((event) => `learning-topic-mastery:${event.topicId}:${appUserId}`);
  const masteryRewards = masterySourceKeys.length
    ? await prisma.pointsTransaction.findMany({
        where: {
          studentId: appUserId,
          sourceKey: { in: masterySourceKeys },
        },
        select: { sourceKey: true, amount: true },
      })
    : [];
  const learningTopicResults = learningTopicResultsByClassId(
    classIds,
    appUserId,
    learningTopicProgress,
    masteryRewards,
  );
  const completedLearningPlanIds = [...new Set(planCompletionRewards
    .map((reward) => reward.sourceKey
      ? learningPlanIdFromCompletionRewardSourceKey(reward.sourceKey, appUserId)
      : null)
    .filter((value): value is string => Boolean(value)))];
  const completedLearningPlans = completedLearningPlanIds.length
    ? await prisma.learningPlan.findMany({
        where: { id: { in: completedLearningPlanIds } },
        select: {
          id: true,
          month: true,
          completedAt: true,
          publishedVersionNumber: true,
          versions: {
            select: {
              version: true,
              topics: { select: { topicId: true, state: true } },
            },
          },
        },
      })
    : [];
  const learningPlanCompletionResults = learningPlanCompletionResultsByClassId(
    classIds,
    appUserId,
    learningTopicProgress,
    planCompletionRewards,
    completedLearningPlans,
  );
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
    const topicResults = lesson.crmClassId
      ? learningTopicResults.get(lesson.crmClassId) ?? []
      : [];
    const planCompletionResults = lesson.crmClassId
      ? learningPlanCompletionResults.get(lesson.crmClassId) ?? []
      : [];
    if (
      !check
      && !homeworkResult
      && topicResults.length === 0
      && planCompletionResults.length === 0
    ) return lesson;
    const planItems = check?.monthlyPlanId ? planItemsById.get(check.monthlyPlanId) : null;
    const updates = Array.isArray(check?.planTopicUpdates)
      ? check.planTopicUpdates as OfflinePlanTopicUpdate[]
      : [];
    return {
      ...lesson,
      lessonPoints: check?.lessonPoints,
      lessonPointsAwarded: check?.rewardsAppliedAt ? check.lessonPoints : null,
      homeworkResult,
      learningTopicResults: topicResults,
      learningPlanCompletionResults: planCompletionResults,
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
