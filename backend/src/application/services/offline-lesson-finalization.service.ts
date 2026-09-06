import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { ConflictError } from "../../domain/errors.js";
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
import {
  buildOfflineLessonApprovalSnapshot,
  type OfflineLessonApprovalSnapshot,
} from "./offline-lesson-approval-snapshot.js";

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

export function awardedOfflineLessonAttendanceAmounts(result: {
  awarded: boolean;
  amount: number;
  coins?: number;
}) {
  return result.awarded
    ? { xp: result.amount, coins: result.coins ?? 0 }
    : { xp: 0, coins: 0 };
}

export type OfflineLessonAttendanceRewardEligibility = "attended" | "not_attended" | "ignore";

/**
 * Once a report version has been submitted, its attendance snapshot is the source of truth for
 * reward recipients. A later edit to the mutable lesson check must neither remove an originally
 * present student nor add a student who was absent in the approved version.
 */
export function offlineLessonAttendanceRewardEligibility(
  check: { crmStudentId: string; attendanceStatus: string },
  approvalSnapshot?: Pick<OfflineLessonApprovalSnapshot, "recipientCrmStudentIds">,
): OfflineLessonAttendanceRewardEligibility {
  if (approvalSnapshot) {
    return approvalSnapshot.recipientCrmStudentIds.includes(check.crmStudentId)
      ? "attended"
      : "ignore";
  }
  return ["present", "late"].includes(check.attendanceStatus)
    ? "attended"
    : "not_attended";
}

async function resolveOfflineLessonApprovalSnapshot(params: {
  crmClassId: string;
  reportVersion?: number;
  approvalSnapshot?: OfflineLessonApprovalSnapshot;
}) {
  if (params.approvalSnapshot) {
    if (
      params.reportVersion !== undefined
      && params.approvalSnapshot.reportVersion !== params.reportVersion
    ) {
      throw new ConflictError(
        "Снимок посещаемости относится к другой версии отчёта.",
        "LESSON_APPROVAL_ATTENDANCE_SNAPSHOT_MISMATCH",
      );
    }
    return params.approvalSnapshot;
  }
  if (params.reportVersion === undefined) return undefined;

  const report = await prisma.offlineLessonReport.findUnique({
    where: { crmClassId: params.crmClassId },
    select: { id: true, confirmedVersion: true },
  });
  if (!report || report.confirmedVersion !== params.reportVersion) {
    throw new ConflictError(
      "Подтверждённая версия отчёта для снимка посещаемости не найдена.",
      "LESSON_APPROVAL_ATTENDANCE_SNAPSHOT_MISSING",
    );
  }
  const version = await prisma.offlineLessonReportVersion.findUnique({
    where: {
      reportId_version: {
        reportId: report.id,
        version: params.reportVersion,
      },
    },
    select: {
      version: true,
      authorUserId: true,
      attendancePayload: true,
    },
  });
  if (!version) {
    throw new ConflictError(
      "Подтверждённая версия отчёта для снимка посещаемости не найдена.",
      "LESSON_APPROVAL_ATTENDANCE_SNAPSHOT_MISSING",
    );
  }
  return buildOfflineLessonApprovalSnapshot(version);
}

async function applyOfflineLessonAttendanceRewards(
  crmClassId: string,
  approvedBy: string,
  lesson: FinalizedOfflineLesson,
  approvalSnapshot?: OfflineLessonApprovalSnapshot,
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
    const eligibility = offlineLessonAttendanceRewardEligibility(check, approvalSnapshot);
    if (eligibility === "ignore") continue;
    if (eligibility === "not_attended") {
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
      let awardedCoins = 0;
      if (student && !trialLesson) {
        const xpResult = await awardOfflineLessonAttendanceXp({
          studentId: student.id,
          crmStudentId: check.crmStudentId,
          crmClassId,
          eventAt,
          awardedById: check.teacherUserId ?? approvedBy,
        });
        const awarded = awardedOfflineLessonAttendanceAmounts(xpResult);
        awardedXp = awarded.xp;
        awardedCoins = awarded.coins;
      }
      await prisma.offlineLessonStudentCheck.update({
        where: { id: check.id },
        data: { rewardsAppliedAt: new Date() },
      });
      results.push({
        crmStudentId: check.crmStudentId,
        points: 0,
        coins: awardedCoins,
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
  reportVersion?: number;
  homeworkApproval?: OfflineLessonApprovalSnapshot;
}) {
  const approvalSnapshot = await resolveOfflineLessonApprovalSnapshot({
    crmClassId: params.crmClassId,
    reportVersion: params.reportVersion,
    approvalSnapshot: params.homeworkApproval,
  });
  if (params.learningResultsV2?.homeworkAssignment) {
    if (!approvalSnapshot) {
      throw new ConflictError(
        "Для назначения домашнего задания отсутствует снимок подтверждённой версии отчёта.",
        "LESSON_APPROVAL_ATTENDANCE_SNAPSHOT_MISSING",
      );
    }
  }
  const lesson = params.lesson ?? await fetchClassCard(params.crmClassId) as FinalizedOfflineLesson;
  const learningV2 = params.learningResultsV2
    ? await applyApprovedLearningLessonV2Results(
        params.approvedBy,
        params.crmClassId,
        params.learningResultsV2,
        approvalSnapshot,
      )
    : null;
  const attendance = await applyOfflineLessonAttendanceRewards(
    params.crmClassId,
    params.approvedBy,
    lesson,
    approvalSnapshot,
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
  homeworkApproval?: OfflineLessonApprovalSnapshot;
}) {
  const key = `${params.crmClassId}:v${params.homeworkApproval?.reportVersion
    ?? params.reportVersion
    ?? "legacy"}`;
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
