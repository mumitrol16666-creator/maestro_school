import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { closeLessonSubstitutions, reopenLessonSubstitutions } from "./teacher-substitution.service.js";
import { ConflictError } from "../../domain/errors.js";
import {
  readOfflineLessonLearningResultsV2,
  reopenOfflineLessonReport,
} from "./offline-lesson-report.service.js";
import { upsertAdminJournalEntry } from "./admin-journal.service.js";

/**
 * Reverses everything a confirmed lesson report version awarded on the Platform:
 * attendance XP/Coins and streak activity, accepted homework decisions, topic
 * progress with mastery Points and plan completion Points.
 *
 * CRM owns money; this is the "отдельная аудируемая корректировка" from
 * LEARN-034 / ECON-037..041. Original rows are never deleted: XP and activity
 * rows get `reversedAt`, Points/Coins get a negative correction transaction, and
 * the original `sourceKey` is renamed to `<key>:reversed:v<n>` so that a later
 * re-approval can award the same source again under its canonical key.
 */

type Tx = Prisma.TransactionClient;

export type OfflineLessonReversalSummary = {
  crmClassId: string;
  reportVersion: number;
  reversed: boolean;
  attendance: Array<{ crmStudentId: string; xp: number; coins: number }>;
  homework: Array<{ recipientId: string; xp: number }>;
  topics: Array<{ topicId: string; fromPercent: number; toPercent: number; masteryPoints: number }>;
  planCompletions: Array<{ planId: string; points: number }>;
};

function reversedKey(sourceKey: string, reportVersion: number) {
  return `${sourceKey}:reversed:v${reportVersion}`;
}

/**
 * The renamed key of a reversed row must stay unique. Keys that are not bound to
 * a lesson (homework recipient, topic mastery, plan completion) can be awarded
 * again by a later lesson and reversed again under the same report version, so
 * the rename takes the first free suffix: `:reversed:v1`, then `:reversed:v1-2`…
 */
async function freeReversedKey(
  exists: (candidate: string) => Promise<boolean>,
  sourceKey: string,
  reportVersion: number,
) {
  const base = reversedKey(sourceKey, reportVersion);
  let candidate = base;
  for (let attempt = 2; await exists(candidate); attempt += 1) {
    candidate = `${base}-${attempt}`;
  }
  return candidate;
}

function reversalKey(sourceKey: string, reportVersion: number) {
  return `${sourceKey}:reversal:v${reportVersion}`;
}

async function reverseXpEvent(tx: Tx, sourceKey: string, reportVersion: number, reason: string, at: Date) {
  const event = await tx.leagueXpEvent.findUnique({ where: { sourceKey } });
  if (!event || event.reversedAt) return 0;
  await tx.leagueXpEvent.update({
    where: { id: event.id },
    data: {
      reversedAt: at,
      reversalReason: reason.slice(0, 500),
      sourceKey: await freeReversedKey(
        async (candidate) => Boolean(await tx.leagueXpEvent.findUnique({ where: { sourceKey: candidate }, select: { id: true } })),
        sourceKey,
        reportVersion,
      ),
    },
  });
  return event.amount;
}

async function reverseActivity(tx: Tx, sourceKeySuffix: string, reportVersion: number, at: Date) {
  const events = await tx.weeklyLeagueActivityEvent.findMany({
    where: { sourceKey: { endsWith: `:${sourceKeySuffix}` }, reversedAt: null },
  });
  for (const event of events) {
    await tx.weeklyLeagueActivityEvent.update({
      where: { id: event.id },
      data: {
        reversedAt: at,
        sourceKey: await freeReversedKey(
          async (candidate) => Boolean(await tx.weeklyLeagueActivityEvent.findUnique({ where: { sourceKey: candidate }, select: { id: true } })),
          event.sourceKey,
          reportVersion,
        ),
      },
    });
  }
}

async function reverseCoinTransaction(
  tx: Tx,
  sourceKey: string,
  reportVersion: number,
  reason: string,
  actorUserId: string | null,
  at: Date,
) {
  const original = await tx.maestroCoinTransaction.findUnique({ where: { sourceKey } });
  if (!original || original.amount <= 0) return 0;
  const correctionKey = reversalKey(sourceKey, reportVersion);
  const existing = await tx.maestroCoinTransaction.findUnique({ where: { sourceKey: correctionKey } });
  if (existing) return 0;

  const [balanceRow] = await tx.$queryRaw<Array<{ balance: number }>>`
    SELECT balance FROM student_coin_balances WHERE student_id = ${original.studentId}::uuid FOR UPDATE
  `;
  const balanceBefore = balanceRow?.balance ?? 0;
  const balanceAfter = balanceBefore - original.amount;
  await tx.maestroCoinTransaction.update({
    where: { id: original.id },
    data: {
      sourceKey: await freeReversedKey(
        async (candidate) => Boolean(await tx.maestroCoinTransaction.findUnique({ where: { sourceKey: candidate }, select: { id: true } })),
        sourceKey,
        reportVersion,
      ),
    },
  });
  await tx.maestroCoinTransaction.create({
    data: {
      economicEpochId: original.economicEpochId,
      studentId: original.studentId,
      amount: -original.amount,
      transactionType: "correction",
      reason: `Отмена: ${original.reason}. ${reason}`.slice(0, 500),
      sourceType: original.sourceType,
      sourceId: original.sourceId,
      sourceKey: correctionKey,
      createdById: actorUserId,
      balanceBefore,
      balanceAfter,
      createdAt: at,
    },
  });
  await tx.studentCoinBalance.update({
    where: { studentId: original.studentId },
    data: { balance: balanceAfter },
  });
  return original.amount;
}

async function reversePointsTransaction(
  tx: Tx,
  sourceKey: string,
  reportVersion: number,
  reason: string,
  actorUserId: string | null,
  at: Date,
) {
  const original = await tx.pointsTransaction.findUnique({ where: { sourceKey } });
  if (!original || original.amount <= 0) return 0;
  const correctionKey = reversalKey(sourceKey, reportVersion);
  const existing = await tx.pointsTransaction.findUnique({ where: { sourceKey: correctionKey } });
  if (existing) return 0;
  await tx.pointsTransaction.update({
    where: { id: original.id },
    data: {
      sourceKey: await freeReversedKey(
        async (candidate) => Boolean(await tx.pointsTransaction.findUnique({ where: { sourceKey: candidate }, select: { id: true } })),
        sourceKey,
        reportVersion,
      ),
    },
  });
  await tx.pointsTransaction.create({
    data: {
      economicEpochId: original.economicEpochId,
      studentId: original.studentId,
      amount: -original.amount,
      reason: `Отмена: ${original.reason}. ${reason}`.slice(0, 500),
      sourceKey: correctionKey,
      lessonId: null,
      awardedBy: actorUserId,
      createdAt: at,
    },
  });
  return original.amount;
}

async function reverseAttendanceRewards(
  tx: Tx,
  crmClassId: string,
  reportVersion: number,
  reason: string,
  actorUserId: string | null,
  at: Date,
) {
  const checks = await tx.offlineLessonStudentCheck.findMany({
    where: { crmClassId, rewardsAppliedAt: { not: null } },
  });
  const results: OfflineLessonReversalSummary["attendance"] = [];
  for (const check of checks) {
    const sourceKey = `offline-lesson:${crmClassId}:${check.crmStudentId}`;
    const xp = await reverseXpEvent(tx, sourceKey, reportVersion, reason, at);
    await reverseActivity(tx, sourceKey, reportVersion, at);
    const coinRows = await tx.maestroCoinTransaction.findMany({
      where: { sourceKey: { startsWith: "weekly-attendance-coins:", endsWith: `:${sourceKey}` } },
      select: { sourceKey: true },
    });
    let coins = 0;
    for (const row of coinRows) {
      if (!row.sourceKey) continue;
      coins += await reverseCoinTransaction(tx, row.sourceKey, reportVersion, reason, actorUserId, at);
    }
    await tx.offlineLessonStudentCheck.update({
      where: { id: check.id },
      data: { rewardsAppliedAt: null },
    });
    results.push({ crmStudentId: check.crmStudentId, xp, coins });
  }
  return results;
}

async function reverseHomeworkDecisions(
  tx: Tx,
  crmClassId: string,
  reportVersion: number,
  decisions: Array<{ recipientId: string; cycleNumber: number; decision?: string; completionPercent?: number | null }>,
  reason: string,
  at: Date,
) {
  const results: OfflineLessonReversalSummary["homework"] = [];
  for (const decision of decisions) {
    const review = await tx.learningHomeworkReview.findUnique({
      where: { recipientId_cycleNumber: { recipientId: decision.recipientId, cycleNumber: decision.cycleNumber } },
    });
    if (!review || review.idempotencyKey !== `offline-lesson:${crmClassId}:homework:${decision.recipientId}:${decision.cycleNumber}`) {
      continue;
    }
    const recipient = await tx.learningHomeworkRecipient.findUnique({ where: { id: decision.recipientId } });
    if (!recipient) continue;

    let xp = 0;
    if (["accepted", "accepted_with_comment"].includes(review.decision)) {
      const sourceKey = `learning-homework:${decision.recipientId}`;
      xp = await reverseXpEvent(tx, sourceKey, reportVersion, reason, at);
      await reverseActivity(tx, sourceKey, reportVersion, at);
    }
    // The review row must go: (recipientId, cycleNumber) is unique and the next
    // lesson will decide the same cycle again. Its content is kept in the journal payload.
    await tx.learningHomeworkReview.delete({ where: { id: review.id } });
    await tx.learningHomeworkRecipient.update({
      where: { id: recipient.id },
      data: {
        state: "waiting_review",
        currentCycle: decision.cycleNumber,
        acceptedAt: null,
        completionPercent: null,
        finalReviewerId: null,
        rewardSourceKey: null,
      },
    });
    // The reviewed attempt goes back to the queue as well, otherwise the next
    // lesson sees a pending homework without an answer it may decide on.
    const reviewedAttempt = await tx.learningHomeworkAttempt.findFirst({
      where: { recipientId: recipient.id, cycleNumber: decision.cycleNumber, status: { not: "superseded" } },
      orderBy: [{ versionInCycle: "desc" }, { attemptNumber: "desc" }],
      select: { id: true, status: true },
    });
    if (reviewedAttempt && reviewedAttempt.status !== "waiting_review") {
      await tx.learningHomeworkAttempt.update({
        where: { id: reviewedAttempt.id },
        data: { status: "waiting_review" },
      });
    }
    results.push({ recipientId: decision.recipientId, xp });
  }
  return results;
}

async function reverseTopicUpdates(
  tx: Tx,
  crmClassId: string,
  reportVersion: number,
  updates: Array<{ topicId: string }>,
  reason: string,
  actorUserId: string | null,
  at: Date,
) {
  const topics: OfflineLessonReversalSummary["topics"] = [];
  const planCompletions: OfflineLessonReversalSummary["planCompletions"] = [];
  for (const update of updates) {
    const sourceKey = `offline-lesson:${crmClassId}:topic:${update.topicId}`;
    const progress = await tx.learningTopicProgress.findUnique({ where: { sourceKey } });
    if (!progress) continue;
    const topic = await tx.learningTopic.findUnique({ where: { id: update.topicId } });
    if (!topic) continue;

    await tx.learningTopicProgress.update({
      where: { id: progress.id },
      data: { sourceKey: reversedKey(sourceKey, reportVersion) },
    });
    const restoredPercent = progress.fromPercent ?? 0;
    await tx.learningTopicProgress.create({
      data: {
        topicId: topic.id,
        fromPercent: topic.progressPercent ?? progress.toPercent,
        toPercent: restoredPercent,
        source: "correction",
        sourceKey: reversalKey(sourceKey, reportVersion),
        changedById: actorUserId,
        comment: reason.slice(0, 1000),
        occurredAt: at,
        createdAt: at,
      },
    });

    let masteryPoints = 0;
    const masteredHere = progress.toPercent === 100 && restoredPercent < 100;
    if (masteredHere) {
      const masteryRows = await tx.pointsTransaction.findMany({
        where: { sourceKey: { startsWith: `learning-topic-mastery:${topic.id}:` } },
        select: { sourceKey: true },
      });
      for (const row of masteryRows) {
        if (!row.sourceKey) continue;
        if (row.sourceKey.includes(":reversed:") || row.sourceKey.includes(":reversal:")) continue;
        masteryPoints += await reversePointsTransaction(tx, row.sourceKey, reportVersion, reason, actorUserId, at);
      }
      const plans = await tx.learningPlan.findMany({
        where: {
          completedAt: { not: null },
          versions: { some: { topics: { some: { topicId: topic.id } } } },
        },
        select: { id: true, completionRewardSourceKey: true, completedAt: true },
      });
      for (const plan of plans) {
        const completionKey = `learning-plan-completion:${plan.id}`;
        if (plan.completionRewardSourceKey !== completionKey) continue;
        if (plan.completedAt && progress.createdAt && Math.abs(plan.completedAt.getTime() - progress.createdAt.getTime()) > 60_000) {
          // Completed by another lesson; this topic was not the closing one.
          continue;
        }
        let points = 0;
        const completionRows = await tx.pointsTransaction.findMany({
          where: { sourceKey: { startsWith: `${completionKey}:` } },
          select: { sourceKey: true },
        });
        for (const row of completionRows) {
          if (!row.sourceKey) continue;
          if (row.sourceKey.includes(":reversed:") || row.sourceKey.includes(":reversal:")) continue;
          points += await reversePointsTransaction(tx, row.sourceKey, reportVersion, reason, actorUserId, at);
        }
        // The sector reopens unless a later sector was already opened after it.
        const sector = await tx.learningPlan.findUniqueOrThrow({
          where: { id: plan.id },
          select: { directionId: true, crmStudentId: true, crmGroupId: true },
        });
        const laterActive = await tx.learningPlan.count({
          where: {
            directionId: sector.directionId,
            crmStudentId: sector.crmStudentId,
            crmGroupId: sector.crmGroupId,
            status: "active",
            id: { not: plan.id },
          },
        });
        await tx.learningPlan.update({
          where: { id: plan.id },
          data: {
            completionRewardSourceKey: null,
            completedAt: null,
            lockedAt: null,
            ...(laterActive === 0 ? { status: "active", closedAt: null, closeReason: null } : {}),
          },
        });
        planCompletions.push({ planId: plan.id, points });
      }
    }

    await tx.learningTopic.update({
      where: { id: topic.id },
      data: {
        progressPercent: restoredPercent,
        ...(masteredHere ? { masteredAt: null, masteryRewardSourceKey: null } : {}),
      },
    });
    topics.push({
      topicId: topic.id,
      fromPercent: topic.progressPercent ?? progress.toPercent,
      toPercent: restoredPercent,
      masteryPoints,
    });
  }
  return { topics, planCompletions };
}

export async function reverseOfflineLessonApproval(params: {
  crmClassId: string;
  reason: string;
  actorUserId?: string | null;
  now?: Date;
}): Promise<OfflineLessonReversalSummary> {
  const reason = params.reason.trim() || "Урок возвращён из CRM";
  const at = params.now ?? new Date();
  // Correction rows reference the actor by FK; a CRM-side actor is not a Platform user.
  const actorUserId = params.actorUserId
    ? (await prisma.user.findUnique({ where: { id: params.actorUserId }, select: { id: true } }))?.id ?? null
    : null;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`offline-lesson-reversal:${params.crmClassId}`}))`;
    const report = await tx.offlineLessonReport.findUnique({ where: { crmClassId: params.crmClassId } });
    if (!report?.confirmedVersion) {
      return {
        crmClassId: params.crmClassId,
        reportVersion: report?.currentVersion ?? 0,
        reversed: false,
        attendance: [],
        homework: [],
        topics: [],
        planCompletions: [],
      };
    }
    const reportVersion = report.confirmedVersion;
    const version = await tx.offlineLessonReportVersion.findUnique({
      where: { reportId_version: { reportId: report.id, version: reportVersion } },
    });
    if (!version) {
      throw new ConflictError("Подтверждённая версия отчёта не найдена", "LESSON_REPORT_VERSION_MISSING");
    }
    const learningResults = readOfflineLessonLearningResultsV2(version.payload);

    const attendance = await reverseAttendanceRewards(tx, params.crmClassId, reportVersion, reason, actorUserId, at);
    const homework = learningResults
      ? await reverseHomeworkDecisions(tx, params.crmClassId, reportVersion, learningResults.homeworkDecisions, reason, at)
      : [];
    const { topics, planCompletions } = learningResults
      ? await reverseTopicUpdates(tx, params.crmClassId, reportVersion, learningResults.topicUpdates, reason, actorUserId, at)
      : { topics: [], planCompletions: [] };

    const summary: OfflineLessonReversalSummary = {
      crmClassId: params.crmClassId,
      reportVersion,
      reversed: true,
      attendance,
      homework,
      topics,
      planCompletions,
    };
    await upsertAdminJournalEntry({
      sourceKey: `lesson-reversal:${params.crmClassId}:v${reportVersion}`,
      type: "reward_correction",
      severity: "high",
      source: "crm",
      linkedEntityType: "offline_lesson",
      linkedEntityId: params.crmClassId,
      title: "Награды урока отменены после возврата из CRM",
      summary: `${reason}. Версия отчёта ${reportVersion}: посещения ${attendance.length}, ДЗ ${homework.length}, темы ${topics.length}, планы ${planCompletions.length}.`.slice(0, 1000),
      payload: summary,
    }, tx);
    return summary;
  });
}

/**
 * Applies the state side of a CRM lesson event before the notification goes out.
 *
 * - `returned`: CRM sent the lesson back to the teacher. A report that is still
 *   pending becomes editable; a confirmed report first loses its rewards and then
 *   becomes editable, so the teacher can resubmit and the next approval awards again.
 * - `reopened`: CRM is revising a confirmed lesson (money only). Nothing changes on
 *   the Platform until CRM returns the lesson or re-approves it.
 */
export async function applyCrmOfflineLessonEvent(params: {
  event: "returned" | "reopened" | "cancelled" | "rescheduled";
  crmClassId: string;
  message?: string | null;
}) {
  if (params.event === "cancelled") await closeLessonSubstitutions(params.crmClassId, "cancelled");
  if (params.event === "returned" || params.event === "reopened") await reopenLessonSubstitutions(params.crmClassId);
  if (params.event !== "returned") return { reportState: null, reversal: null };
  const report = await prisma.offlineLessonReport.findUnique({ where: { crmClassId: params.crmClassId } });
  if (!report || report.currentVersion === 0) return { reportState: null, reversal: null };
  const reason = params.message?.trim() || "Урок возвращён преподавателю из CRM";
  const version = await prisma.offlineLessonReportVersion.findUnique({
    where: { reportId_version: { reportId: report.id, version: report.currentVersion } },
    select: { authorUserId: true },
  });
  const actorUserId = version?.authorUserId ?? null;

  let reversal: OfflineLessonReversalSummary | null = null;
  if (report.confirmedVersion) {
    reversal = await reverseOfflineLessonApproval({ crmClassId: params.crmClassId, reason, actorUserId });
  }
  if (!actorUserId) return { reportState: report.status, reversal };
  const reopened = await reopenOfflineLessonReport(params.crmClassId, actorUserId, reason, {
    afterReversal: Boolean(reversal?.reversed),
  });
  return { reportState: reopened?.status ?? report.status, reversal };
}
