import type { Prisma } from "@prisma/client";
import { upsertAdminJournalEntry } from "./admin-journal.service.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { assertPersonalExamPlan } from "./exam-admission.js";
import { ConflictError } from "../../domain/errors.js";

/** Both the approved report and the pupil card write the same readiness observations. */
async function recordReadiness(tx: Prisma.TransactionClient, plan: { id: string; examReadyAt: Date | null }, input: {
  actorUserId: string; eventAt: Date; sourceKey: string; crmClassId: string | null; source: string;
}) {
  if (await tx.learningSectorEvent.findUnique({ where: { sourceKey: input.sourceKey } })) return false;
  if (!plan.examReadyAt || input.eventAt < plan.examReadyAt) {
    await tx.learningPlan.update({ where: { id: plan.id }, data: { examReadyAt: input.eventAt, examReadyById: input.actorUserId } });
  }
  await tx.learningSectorEvent.create({ data: { planId: plan.id, kind: "exam_ready", actorUserId: input.actorUserId,
    sourceKey: input.sourceKey, crmClassId: input.crmClassId, occurredAt: input.eventAt, details: { source: input.source } } });
  return true;
}

/** Called only after roster/direction authorization; the transaction rechecks the actual owner. */
export async function recordCardSectorReadiness(input: { planId: string; crmStudentId: string; directionId: string; actorUserId: string }) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM learning_plans WHERE id=${input.planId}::uuid FOR UPDATE`;
    const plan = await tx.learningPlan.findUniqueOrThrow({ where: { id: input.planId } });
    assertPersonalExamPlan(plan, input.crmStudentId);
    if (plan.directionId !== input.directionId) throw new ConflictError("Направление сектора изменилось. Обновите карточку.", "SECTOR_DIRECTION_CHANGED");
    const changed = await recordReadiness(tx, plan, { actorUserId: input.actorUserId, eventAt: new Date(),
      sourceKey: `sector-ready:${plan.id}:student-card`, crmClassId: null, source: "student_card" });
    if (changed) await tx.auditLog.create({ data: { entityType: "learning_plan", entityId: plan.id, action: "update", actorId: input.actorUserId,
      payload: { event: "exam_ready", source: "student_card", crmStudentId: input.crmStudentId } } });
    const current = await tx.learningPlan.findUniqueOrThrow({ where: { id: plan.id } });
    return { planId: plan.id, ready: true, readyAt: current.examReadyAt, idempotent: !changed };
  });
}

/** Lesson-origin readiness becomes effective with the immutable CRM-approved report. */
export async function applyApprovedSectorReadiness(input: {
  planIds: readonly string[];
  recipientCrmStudentIds: readonly string[];
  crmClassId: string;
  actorUserId: string;
  reportVersion: number;
  eventAt: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const applied: string[] = [];
    const skipped: string[] = [];
    for (const planId of [...new Set(input.planIds)].sort()) {
      await tx.$queryRaw`SELECT id FROM learning_plans WHERE id = ${planId}::uuid FOR UPDATE`;
      const plan = await tx.learningPlan.findUnique({ where: { id: planId } });
      if (!plan || !plan.crmStudentId || !input.recipientCrmStudentIds.includes(plan.crmStudentId)) {
        skipped.push(planId);
        continue;
      }
      const sourceKey = `sector-ready:${planId}:${input.crmClassId}:v${input.reportVersion}`;
      const receipt = await tx.learningSectorEvent.findUnique({ where: { sourceKey } });
      if (receipt) { applied.push(planId); continue; }
      if (plan.status === "closed") { skipped.push(planId); continue; }
      await recordReadiness(tx, plan, { actorUserId: input.actorUserId, eventAt: input.eventAt,
        sourceKey, crmClassId: input.crmClassId, source: "approved_report" });
      applied.push(planId);
    }
    return { applied, skipped };
  });
}


/** Reverse only the readiness observations of this report; later independent observations survive. */
export async function reverseSectorReadiness(
  tx: Prisma.TransactionClient, crmClassId: string, reportVersion: number,
  actorUserId: string | null, at: Date,
) {
  const events = await tx.learningSectorEvent.findMany({
    where: { crmClassId, kind: "exam_ready", sourceKey: { endsWith: `:v${reportVersion}` } }, orderBy: {planId:"asc"},
  });
  for (const event of events) {
    await tx.$queryRaw`SELECT id FROM learning_plans WHERE id = ${event.planId}::uuid FOR UPDATE`;
    const key = `sector-ready-revoked:${event.id}`;
    if (await tx.learningSectorEvent.findUnique({ where: { sourceKey: key } })) continue;
    await tx.learningSectorEvent.create({ data: {
      planId: event.planId, kind: "exam_ready_revoked", actorUserId,
      crmClassId, sourceKey: key, occurredAt: at, details: { originalEventId: event.id },
    } });
    const used = await tx.sectorExam.count({ where: { planId: event.planId, status: { in: ["in_progress", "completed"] } } });
    if (used) {
      await upsertAdminJournalEntry({
        sourceKey: `sector-readiness-returned:${event.id}`, type: "crm_sync", severity: "high", source: "crm",
        linkedEntityType: "learning_plan", linkedEntityId: event.planId,
        title: "Возвращён урок с готовностью к уже начатому экзамену",
        summary: "Проверьте основание допуска и результат экзамена. Требуется решение администратора.",
        payload: { crmClassId, reportVersion, planId: event.planId },
      }, tx);
      continue;
    }
    const observations = await tx.learningSectorEvent.findMany({ where: { planId: event.planId, kind: "exam_ready" }, orderBy: { occurredAt: "asc" } });
    const revoked = await tx.learningSectorEvent.findMany({ where: { planId: event.planId, kind: "exam_ready_revoked" } });
    const revokedIds = new Set(revoked.map(row => row.details && typeof row.details === "object" && !Array.isArray(row.details) ? row.details.originalEventId : null));
    const first = observations.find(row => !revokedIds.has(row.id));
    await tx.learningPlan.update({ where: { id: event.planId }, data: {
      examReadyAt: first?.occurredAt ?? null, examReadyById: first?.actorUserId ?? null,
    } });
  }
}
