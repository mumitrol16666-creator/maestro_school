import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ConflictError } from "../../domain/errors.js";
import type { TeacherSubmitPayload } from "../../infrastructure/crm/crm-client.js";
import {
  enqueueCrmOutboxEvent,
  flushCrmOutboxForLesson,
  processCrmOutboxEvent,
} from "./crm-outbox.service.js";

const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function inputJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableJson(item)]),
    );
  }
  return value;
}

function samePayload(left: unknown, right: unknown) {
  return JSON.stringify(stableJson(left)) === JSON.stringify(stableJson(right));
}

function withoutSyncRevision(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSyncRevision);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "syncRevision")
        .map(([key, item]) => [key, withoutSyncRevision(item)]),
    );
  }
  return value;
}

async function requireProjection(crmClassId: string) {
  const projection = await prisma.offlineLessonProjection.findUnique({ where: { crmClassId } });
  if (!projection) {
    throw new BadRequestError(
      "Урок ещё не загружен. Обновите расписание перед заполнением отчёта.",
      "LESSON_NOT_PROJECTED",
    );
  }
  return projection;
}

async function attendanceSnapshot(crmClassId: string) {
  const checks = await prisma.offlineLessonStudentCheck.findMany({
    where: { crmClassId },
    orderBy: { crmStudentId: "asc" },
  });
  return checks.map((check) => ({
    crmStudentId: check.crmStudentId,
    attendanceStatus: check.attendanceStatus,
    teacherNote: check.teacherNote,
    homeworkStatus: check.homeworkStatus,
    homeworkCompletionPercent: check.homeworkCompletionPercent,
    homeworkDifficulties: check.homeworkDifficulties,
    homeworkNotCompletedReason: check.homeworkNotCompletedReason,
    reviewedHomeworkCrmClassId: check.reviewedHomeworkCrmClassId,
    syncRevision: check.syncRevision,
  }));
}

export async function submitOfflineLessonReportVersion(params: {
  crmClassId: string;
  authorUserId: string;
  crmTeacherId: string;
  payload: Omit<TeacherSubmitPayload, "crmTeacherId">;
  eventType?: "teacher_submit" | "teacher_not_held";
}) {
  const projection = await requireProjection(params.crmClassId);
  const snapshot = await attendanceSnapshot(params.crmClassId);
  const eventType = params.eventType ?? "teacher_submit";
  const fullPayload = { ...params.payload, crmTeacherId: params.crmTeacherId };

  const created = await prisma.$transaction(async (tx) => {
    const existing = await tx.offlineLessonReport.findUnique({
      where: { crmClassId: params.crmClassId },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (existing?.crmConfirmedAt) {
      throw new BadRequestError(
        "Подтверждённый отчёт может переоткрыть только куратор с указанием причины.",
        "LESSON_REPORT_CONFIRMED",
      );
    }
    const latest = existing?.versions[0];
    if (
      latest
      && ["pending_sync", "pending_review"].includes(existing.status)
      && samePayload(latest.payload, fullPayload)
      && samePayload(
        withoutSyncRevision(latest.attendancePayload),
        withoutSyncRevision(snapshot),
      )
    ) {
      const event = await tx.crmOutboxEvent.findUnique({
        where: { idempotencyKey: `lesson-report:${params.crmClassId}:v${latest.version}` },
      });
      return { report: existing, version: latest, event, idempotent: true };
    }

    const report = existing ?? await tx.offlineLessonReport.create({
      data: {
        crmClassId: params.crmClassId,
        authorUserId: params.authorUserId,
      },
    });
    const versionNumber = report.currentVersion + 1;
    const version = await tx.offlineLessonReportVersion.create({
      data: {
        reportId: report.id,
        version: versionNumber,
        authorUserId: params.authorUserId,
        payload: inputJson(fullPayload),
        attendancePayload: inputJson(snapshot),
        rosterVersion: projection.rosterVersion,
      },
    });
    const updatedReport = await tx.offlineLessonReport.update({
      where: { id: report.id },
      data: {
        authorUserId: params.authorUserId,
        status: "pending_sync",
        currentVersion: versionNumber,
        correctionReason: null,
      },
    });
    await tx.offlineLessonDraft.deleteMany({
      where: { reportId: report.id, ownerUserId: params.authorUserId },
    });
    const event = await enqueueCrmOutboxEvent({
      aggregateId: params.crmClassId,
      eventType,
      payload: {
        crmClassId: params.crmClassId,
        body: fullPayload,
        reportVersionId: version.id,
      },
      idempotencyKey: `lesson-report:${params.crmClassId}:v${versionNumber}`,
    }, tx);
    return { report: updatedReport, version, event, idempotent: false };
  });

  if (created.event) {
    await flushCrmOutboxForLesson(params.crmClassId);
  }
  const finalEvent = created.event
    ? await prisma.crmOutboxEvent.findUnique({ where: { id: created.event.id } })
    : null;
  const finalReport = await prisma.offlineLessonReport.findUnique({
    where: { crmClassId: params.crmClassId },
  });
  return {
    crmClassId: params.crmClassId,
    status: finalEvent?.status === "succeeded" ? "pending_admin_review" : "pending_sync",
    syncState: finalEvent?.status ?? "pending",
    report: finalReport,
    version: created.version,
    idempotent: created.idempotent,
  };
}

export async function withdrawOfflineLessonReport(params: {
  crmClassId: string;
  actorUserId: string;
  crmTeacherId: string;
  reason: string;
}) {
  await requireProjection(params.crmClassId);
  const created = await prisma.$transaction(async (tx) => {
    const report = await tx.offlineLessonReport.findUnique({
      where: { crmClassId: params.crmClassId },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!report || !report.versions[0]) {
      throw new BadRequestError("Отправленная версия отчёта не найдена", "LESSON_REPORT_NOT_FOUND");
    }
    if (report.authorUserId !== params.actorUserId) {
      throw new BadRequestError("Отозвать отчёт может только его автор", "LESSON_REPORT_AUTHOR_ONLY");
    }
    if (report.crmConfirmedAt) {
      throw new BadRequestError(
        "После подтверждения отчёт переоткрывает куратор.",
        "LESSON_REPORT_CONFIRMED",
      );
    }
    if (!['pending_sync', 'pending_review', 'conflict'].includes(report.status)) {
      throw new BadRequestError("Этот отчёт уже открыт для редактирования", "LESSON_REPORT_NOT_SUBMITTED");
    }
    const version = report.versions[0];
    await tx.offlineLessonReportVersion.update({
      where: { id: version.id },
      data: {
        state: "withdrawn",
        withdrawnAt: new Date(),
        withdrawnById: params.actorUserId,
        withdrawReason: params.reason,
      },
    });
    await tx.offlineLessonReport.update({
      where: { id: report.id },
      data: { status: "editing", correctionReason: params.reason },
    });
    await tx.offlineLessonDraft.upsert({
      where: { reportId_ownerUserId: { reportId: report.id, ownerUserId: params.actorUserId } },
      create: {
        reportId: report.id,
        ownerUserId: params.actorUserId,
        payload: inputJson(version.payload),
        revision: 1,
        rosterVersion: version.rosterVersion,
        expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
      },
      update: {
        payload: inputJson(version.payload),
        revision: { increment: 1 },
        rosterVersion: version.rosterVersion,
        expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
      },
    });
    const submitEvent = await tx.crmOutboxEvent.findUnique({
      where: { idempotencyKey: `lesson-report:${params.crmClassId}:v${version.version}` },
    });
    if (submitEvent?.status === "processing") {
      throw new ConflictError(
        "Отчёт сейчас передаётся в CRM. Подождите несколько секунд и повторите отзыв.",
        "LESSON_REPORT_SYNC_IN_PROGRESS",
      );
    }
    if (submitEvent && submitEvent.status !== "succeeded") {
      await tx.crmOutboxEvent.update({
        where: { id: submitEvent.id },
        data: {
          status: "cancelled",
          nextAttemptAt: null,
          processingAt: null,
          completedAt: new Date(),
          lastError: null,
        },
      });
      return { event: null, localOnly: true };
    }
    const event = await enqueueCrmOutboxEvent({
      aggregateId: params.crmClassId,
      eventType: "teacher_withdraw",
      payload: {
        crmClassId: params.crmClassId,
        body: { crmTeacherId: params.crmTeacherId, reason: params.reason },
        reportVersionId: version.id,
      },
      idempotencyKey: `lesson-report:${params.crmClassId}:v${version.version}:withdraw`,
    }, tx);
    await tx.offlineLessonReport.update({
      where: { id: report.id },
      data: { status: "pending_sync" },
    });
    return { event, localOnly: false };
  });
  if (created.event) await processCrmOutboxEvent(created.event.id);
  const event = created.event
    ? await prisma.crmOutboxEvent.findUnique({ where: { id: created.event.id } })
    : null;
  return {
    crmClassId: params.crmClassId,
    status: created.localOnly || event?.status === "succeeded" ? "started" : "pending_sync",
    syncState: created.localOnly ? "local" : event?.status ?? "pending",
  };
}

export async function markOfflineLessonReportConfirmed(crmClassId: string) {
  const report = await prisma.offlineLessonReport.findUnique({ where: { crmClassId } });
  if (!report) return null;
  return prisma.offlineLessonReport.update({
    where: { id: report.id },
    data: {
      status: "confirmed",
      confirmedVersion: report.currentVersion,
      crmConfirmedAt: new Date(),
    },
  });
}

export async function reopenOfflineLessonReport(
  crmClassId: string,
  actorUserId: string,
  reason: string,
) {
  const report = await prisma.offlineLessonReport.findUnique({
    where: { crmClassId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!report) return null;
  const latest = report.versions[0];
  return prisma.$transaction(async (tx) => {
    const updated = await tx.offlineLessonReport.update({
      where: { id: report.id },
      data: {
        status: "editing",
        correctionReason: reason,
        crmConfirmedAt: null,
      },
    });
    if (latest) {
      await tx.offlineLessonDraft.upsert({
        where: { reportId_ownerUserId: { reportId: report.id, ownerUserId: actorUserId } },
        create: {
          reportId: report.id,
          ownerUserId: actorUserId,
          payload: inputJson(latest.payload),
          revision: 1,
          rosterVersion: latest.rosterVersion,
          expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
        },
        update: {
          payload: inputJson(latest.payload),
          revision: { increment: 1 },
          rosterVersion: latest.rosterVersion,
          expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
        },
      });
    }
    return updated;
  });
}

export async function getOfflineLessonDraft(crmClassId: string, ownerUserId: string) {
  const report = await prisma.offlineLessonReport.findUnique({ where: { crmClassId } });
  if (!report) return null;
  const draft = await prisma.offlineLessonDraft.findUnique({
    where: { reportId_ownerUserId: { reportId: report.id, ownerUserId } },
  });
  if (draft && draft.expiresAt < new Date()) {
    await prisma.offlineLessonDraft.delete({ where: { id: draft.id } });
    return null;
  }
  return draft;
}

export async function saveOfflineLessonDraft(params: {
  crmClassId: string;
  ownerUserId: string;
  payload: Record<string, unknown>;
  expectedRevision: number;
}) {
  const projection = await requireProjection(params.crmClassId);
  const report = await prisma.offlineLessonReport.upsert({
    where: { crmClassId: params.crmClassId },
    create: {
      crmClassId: params.crmClassId,
      authorUserId: params.ownerUserId,
      status: "editing",
    },
    update: {},
  });
  if (report.authorUserId !== params.ownerUserId && report.status !== "editing") {
    throw new BadRequestError("Черновик другого автора недоступен", "LESSON_DRAFT_OWNER_ONLY");
  }
  const current = await prisma.offlineLessonDraft.findUnique({
    where: { reportId_ownerUserId: { reportId: report.id, ownerUserId: params.ownerUserId } },
  });
  if (current && current.revision !== params.expectedRevision) {
    throw new ConflictError(
      `Черновик уже изменён на другом устройстве. Текущая ревизия: ${current.revision}.`,
      "LESSON_DRAFT_REVISION_CONFLICT",
    );
  }
  if (!current && params.expectedRevision !== 0) {
    throw new ConflictError("Черновик не найден. Начните с ревизии 0.", "LESSON_DRAFT_REVISION_CONFLICT");
  }
  return prisma.offlineLessonDraft.upsert({
    where: { reportId_ownerUserId: { reportId: report.id, ownerUserId: params.ownerUserId } },
    create: {
      reportId: report.id,
      ownerUserId: params.ownerUserId,
      payload: inputJson(params.payload),
      revision: 1,
      rosterVersion: projection.rosterVersion,
      expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
    },
    update: {
      payload: inputJson(params.payload),
      revision: { increment: 1 },
      rosterVersion: projection.rosterVersion,
      expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
    },
  });
}

export async function deleteOfflineLessonDraft(crmClassId: string, ownerUserId: string) {
  const report = await prisma.offlineLessonReport.findUnique({ where: { crmClassId } });
  if (!report) return { deleted: 0 };
  const result = await prisma.offlineLessonDraft.deleteMany({
    where: { reportId: report.id, ownerUserId },
  });
  return { deleted: result.count };
}

export async function listOfflineLessonReportVersions(crmClassId: string) {
  const report = await prisma.offlineLessonReport.findUnique({
    where: { crmClassId },
    include: { versions: { orderBy: { version: "desc" } } },
  });
  return report;
}
