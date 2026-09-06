import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { fetchClassCard } from "../../infrastructure/crm/crm-client.js";
import { awardManualPoints } from "./points.service.js";
import { addMaestroCoins } from "./coins.service.js";
import {
  awardLeagueXp,
  awardOfflineLessonAttendanceXp,
} from "./weekly-league.service.js";
import { evaluateAchievements } from "./achievement.service.js";
import { buildMonthlyPlanSnapshot } from "../../domain/monthly-plan.js";
import {
  applyApprovedLearningLessonV2Results,
  offlineLessonEventAt,
  type LearningLessonV2ResultsInput,
} from "./learning-lesson-v2.service.js";
import { rewardEconomyV2AppliesToEvent } from "../../config/product-features.js";

export type FinalizedOfflineLesson = {
  teacher?: { crmTeacherId?: string; name?: string } | null;
  classType?: string | null;
  group?: unknown;
  [key: string]: unknown;
};

type StoredPlanTopicUpdate = {
  itemId: string;
  status: "in_progress" | "completed";
};

type StoredMonthlyPlanItem = {
  id: string;
  title: string;
  status: "planned" | "in_progress" | "completed" | "moved";
};

async function applyOfflineLessonAttendanceRewards(
  crmClassId: string,
  approvedBy: string,
  lesson: FinalizedOfflineLesson,
) {
  const checks = await prisma.offlineLessonStudentCheck.findMany({
    where: { crmClassId, rewardsAppliedAt: null },
  });
  const results: Array<{
    crmStudentId: string;
    points: number;
    coins: number;
    xp: number;
    planTopics: number;
  }> = [];
  const eventAt = offlineLessonEventAt(lesson as Parameters<typeof offlineLessonEventAt>[0]);
  const useV2Economy = rewardEconomyV2AppliesToEvent(eventAt);
  const trialLesson = ["trial", "repeat_trial"].includes(String(lesson.classType ?? ""));

  for (const check of checks) {
    const attended = ["present", "late"].includes(check.attendanceStatus);
    if (!attended) {
      await prisma.offlineLessonStudentCheck.update({
        where: { id: check.id },
        data: { rewardsAppliedAt: new Date() },
      });
      results.push({ crmStudentId: check.crmStudentId, points: 0, coins: 0, xp: 0, planTopics: 0 });
      continue;
    }

    if (useV2Economy) {
      const student = await prisma.user.findUnique({
        where: { crmStudentId: check.crmStudentId },
        select: { id: true },
      });
      let awardedXp = 0;
      if (student && !trialLesson) {
        const xpResult = await awardOfflineLessonAttendanceXp({
          studentId: student.id,
          crmStudentId: check.crmStudentId,
          crmClassId,
          eventAt,
          awardedById: check.teacherUserId ?? approvedBy,
        });
        awardedXp = xpResult.awarded ? xpResult.amount : 0;
      }
      await prisma.offlineLessonStudentCheck.update({
        where: { id: check.id },
        data: { rewardsAppliedAt: new Date() },
      });
      results.push({
        crmStudentId: check.crmStudentId,
        points: 0,
        coins: 0,
        xp: awardedXp,
        planTopics: 0,
      });
      continue;
    }

    const updates = Array.isArray(check.planTopicUpdates)
      ? check.planTopicUpdates as StoredPlanTopicUpdate[]
      : [];
    let appliedPlanTopics = 0;
    let completedPlanId: string | null = null;
    const completedPlanTopics: Array<{ id: string; title: string }> = [];

    if (check.monthlyPlanId && updates.length) {
      const plan = await prisma.studentMonthlyPlan.findFirst({
        where: {
          id: check.monthlyPlanId,
          crmStudentId: check.crmStudentId,
        },
      });
      if (plan) {
        completedPlanId = plan.id;
        const byId = new Map(updates.map((item) => [item.itemId, item.status]));
        const items = (Array.isArray(plan.items) ? plan.items : []) as StoredMonthlyPlanItem[];
        const nextItems = items.map((item) => {
          const nextStatus = byId.get(item.id);
          if (!nextStatus || item.status === "moved") return item;
          appliedPlanTopics += 1;
          if (nextStatus === "completed" && item.status !== "completed") {
            completedPlanTopics.push({ id: item.id, title: item.title });
          }
          return {
            ...item,
            status: item.status === "completed" ? "completed" : nextStatus,
          };
        });
        const nextRevision = plan.draftRevision + 1;
        const publishedSnapshot = plan.publishedAt && plan.publishedSnapshot
          ? buildMonthlyPlanSnapshot({ ...plan, items: nextItems })
          : null;
        await prisma.studentMonthlyPlan.update({
          where: { id: plan.id },
          data: {
            items: nextItems as Prisma.InputJsonValue,
            draftRevision: nextRevision,
            ...(publishedSnapshot ? {
              publishedSnapshot: publishedSnapshot as unknown as Prisma.InputJsonValue,
              publishedRevision: nextRevision,
              publishedAt: new Date(),
            } : {}),
          },
        });
      }
    }

    const student = await prisma.user.findUnique({
      where: { crmStudentId: check.crmStudentId },
      select: { id: true },
    });
    let awardedPoints = 0;
    let awardedCoins = 0;
    let awardedXp = 0;

    if (student) {
      const xpResult = await awardLeagueXp({
        studentId: student.id,
        amount: 20,
        sourceType: "offline_lesson",
        sourceKey: `offline-lesson:${crmClassId}:${check.crmStudentId}`,
        description: "Посещение урока с преподавателем",
        awardedById: check.teacherUserId ?? approvedBy,
      });
      awardedXp = xpResult.awarded ? 20 : 0;
      if (completedPlanId) {
        for (const topic of completedPlanTopics) {
          await awardLeagueXp({
            studentId: student.id,
            amount: 3,
            sourceType: "monthly_plan",
            sourceKey: `monthly-plan-topic:${completedPlanId}:${topic.id}`,
            description: `Освоена тема плана «${topic.title}»`,
            awardedById: check.teacherUserId ?? approvedBy,
          });
        }
      }
      const pointsResult = await awardManualPoints({
        studentId: student.id,
        amount: check.lessonPoints,
        reason: "Урок с преподавателем",
        awardedBy: check.teacherUserId ?? approvedBy,
        idempotencyKey: `offline-lesson-points:${crmClassId}:${check.crmStudentId}`,
      });
      awardedPoints = pointsResult.awarded ? check.lessonPoints : 0;

      const coinResult = await addMaestroCoins({
        studentId: student.id,
        amount: 1,
        reason: "Посещение урока с преподавателем",
        sourceType: "offline_lesson",
        sourceId: check.id,
        sourceKey: `offline-lesson:${crmClassId}:${check.crmStudentId}`,
        createdBy: approvedBy,
      });
      awardedCoins = coinResult.awarded ? 1 : 0;
      await evaluateAchievements(student.id);
    }

    await prisma.offlineLessonStudentCheck.update({
      where: { id: check.id },
      data: { rewardsAppliedAt: new Date() },
    });
    results.push({
      crmStudentId: check.crmStudentId,
      points: awardedPoints,
      coins: awardedCoins,
      xp: awardedXp,
      planTopics: appliedPlanTopics,
    });
  }

  return results;
}

async function executeOfflineLessonFinalization(params: {
  crmClassId: string;
  approvedBy: string;
  learningResultsV2?: LearningLessonV2ResultsInput | null;
  lesson?: FinalizedOfflineLesson | null;
}) {
  const lesson = params.lesson ?? await fetchClassCard(params.crmClassId) as FinalizedOfflineLesson;
  const learningV2 = params.learningResultsV2
    ? await applyApprovedLearningLessonV2Results(
        params.approvedBy,
        params.crmClassId,
        params.learningResultsV2,
      )
    : null;
  const attendance = await applyOfflineLessonAttendanceRewards(
    params.crmClassId,
    params.approvedBy,
    lesson,
  );
  return { attendance, learningV2 };
}

type OfflineLessonFinalization = Awaited<ReturnType<typeof executeOfflineLessonFinalization>>;
const activeFinalizations = new Map<string, Promise<OfflineLessonFinalization>>();

export function finalizeOfflineLessonApproval(params: {
  crmClassId: string;
  approvedBy: string;
  learningResultsV2?: LearningLessonV2ResultsInput | null;
  lesson?: FinalizedOfflineLesson | null;
  reportVersion?: number;
}) {
  const key = `${params.crmClassId}:v${params.reportVersion ?? "legacy"}`;
  const active = activeFinalizations.get(key);
  if (active) return active;
  const pending = executeOfflineLessonFinalization(params);
  activeFinalizations.set(key, pending);
  const clear = () => {
    if (activeFinalizations.get(key) === pending) activeFinalizations.delete(key);
  };
  void pending.then(clear, clear);
  return pending;
}
