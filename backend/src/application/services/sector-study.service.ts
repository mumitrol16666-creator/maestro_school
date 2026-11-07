import type { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";

async function refreshStart(tx: Prisma.TransactionClient, planId: string) {
  const rows = await tx.learningSectorEvent.findMany({ where: { planId, kind: { in: ["lesson_studied", "lesson_study_revoked"] } }, orderBy: { occurredAt: "asc" } });
  const revoked = new Set(rows.filter(row => row.kind === "lesson_study_revoked").map(row => row.details && typeof row.details === "object" && !Array.isArray(row.details) ? row.details.originalEventId : null));
  const first = rows.find(row => row.kind === "lesson_studied" && !revoked.has(row.id));
  await tx.learningPlan.update({ where: { id: planId }, data: { studyStartedAt: first?.occurredAt ?? null } });
}

export async function recordApprovedSectorStudy(input: {
  planIds: readonly string[]; crmClassId: string; reportVersion: number;
  actorUserId: string; eventAt: Date; recipientCrmStudentIds: readonly string[];
  groupId?: string | null;
}) {
  await prisma.$transaction(async tx => {
    for (const planId of [...new Set(input.planIds)].sort()) {
      await tx.$queryRaw`SELECT id FROM learning_plans WHERE id=${planId}::uuid FOR UPDATE`;
      const plan = await tx.learningPlan.findUnique({ where: { id: planId } });
      if (!plan || (!plan.crmGroupId && !input.recipientCrmStudentIds.includes(plan.crmStudentId ?? "")) || (plan.crmGroupId && plan.crmGroupId !== input.groupId)) continue;
      if (!input.recipientCrmStudentIds.length) continue;
      const sourceKey = `sector-lesson:${planId}:${input.crmClassId}:v${input.reportVersion}`;
      await tx.learningSectorEvent.upsert({ where: { sourceKey }, update: {}, create: {
        planId, kind: "lesson_studied", sourceKey, actorUserId: input.actorUserId,
        crmClassId: input.crmClassId, occurredAt: input.eventAt,
        details: { recipientCrmStudentIds: [...input.recipientCrmStudentIds] },
      } });
      await refreshStart(tx, planId);
    }
  });
}

export async function reverseSectorStudy(tx: Prisma.TransactionClient, crmClassId: string, reportVersion: number, actorUserId: string | null, at: Date) {
  const events = await tx.learningSectorEvent.findMany({ where: { crmClassId, kind: "lesson_studied", sourceKey: { endsWith: `:v${reportVersion}` } }, orderBy: {planId:"asc"} });
  for (const event of events) {
    await tx.$queryRaw`SELECT id FROM learning_plans WHERE id=${event.planId}::uuid FOR UPDATE`;
    const sourceKey = `sector-study-revoked:${event.id}`;
    await tx.learningSectorEvent.upsert({ where: { sourceKey }, update: {}, create: {
      planId: event.planId, kind: "lesson_study_revoked", sourceKey, actorUserId,
      crmClassId, occurredAt: at, details: { originalEventId: event.id },
    } });
    await refreshStart(tx, event.planId);
  }
}

function days(from: Date | null, to: Date | null) {
  if (!from || !to || to < from) return null;
  const date = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Aqtobe", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  return Math.round((new Date(date(to)).getTime() - new Date(date(from)).getTime()) / 86_400_000) + 1;
}

export async function studentSectorStatistics(crmStudentId: string, now = new Date()) {
  const plans = await prisma.learningPlan.findMany({
    where: { crmStudentId, crmGroupId: null, publishedVersionNumber: { not: null } },
    include: { direction: { select: { title: true } }, lifecycleEvents: { orderBy: { occurredAt: "asc" } }, exams: { orderBy: { attempt: "desc" } } },
    orderBy: [{ directionId: "asc" }, { sequence: "desc" }],
  });
  return plans.map(plan => {
    const revoked = new Set(plan.lifecycleEvents.filter(row => row.kind === "lesson_study_revoked").map(row => row.details && typeof row.details === "object" && !Array.isArray(row.details) ? row.details.originalEventId : null));
    const observations = plan.lifecycleEvents.filter(row => row.kind === "lesson_studied" && !revoked.has(row.id));
    const lastExam = plan.exams[0];
    const examDate = lastExam?.finishedAt ?? lastExam?.scheduledAt ?? null;
    return {
      id: plan.id, sequence: plan.sequence, direction: plan.direction.title, status: plan.status,
      startedAt: plan.studyStartedAt, studyFinishedAt: plan.studyFinishedAt, readyAt: plan.examReadyAt,
      observedLessons: new Set(observations.map(row => row.crmClassId)).size,
      studyDays: days(plan.studyStartedAt, plan.examReadyAt ?? plan.studyFinishedAt),
      examWaitingDays: plan.examReadyAt ? Math.max(0, (days(plan.examReadyAt, examDate && examDate <= now ? examDate : now) ?? 1) - 1) : null,
      attemptsCompleted: plan.exams.filter(exam => exam.status === "completed").length,
      lastExam: lastExam ? { status: lastExam.status, scheduledAt: lastExam.scheduledAt, finishedAt: lastExam.finishedAt, outcome: lastExam.outcome, decision: lastExam.decision } : null,
      timeline: plan.lifecycleEvents.map(row => ({ kind: row.kind, occurredAt: row.occurredAt, recordedAt: row.recordedAt, actorUserId: row.actorUserId, crmClassId: row.crmClassId })),
    };
  });
}
