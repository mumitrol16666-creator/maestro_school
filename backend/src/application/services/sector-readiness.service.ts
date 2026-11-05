import type { Prisma } from "@prisma/client";
import { upsertAdminJournalEntry } from "./admin-journal.service.js";
import { prisma } from "../../infrastructure/database/prisma.js";

/** Readiness is a teacher's decision in an immutable CRM-approved report, never a percentage. */
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
      if (!plan.examReadyAt || input.eventAt < plan.examReadyAt) {
        await tx.learningPlan.update({ where: { id: planId }, data: {
          examReadyAt: input.eventAt, examReadyById: input.actorUserId,
        } });
      }
      await tx.learningSectorEvent.create({ data: {
        planId, kind: "exam_ready", actorUserId: input.actorUserId,
        sourceKey, crmClassId: input.crmClassId, occurredAt: input.eventAt,
      } });
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
