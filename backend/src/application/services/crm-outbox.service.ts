import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { AppError, BadRequestError } from "../../domain/errors.js";
import {
  postAdminAttendance,
  postTeacherAttendance,
  postTeacherMarkNotHeld,
  postTeacherSubmit,
  postTeacherWithdraw,
  type TeacherSubmitPayload,
} from "../../infrastructure/crm/crm-client.js";
import { saveOfflineLessonProjection } from "./offline-lesson-projection.service.js";
import {
  curatorWorkspaceV2Enabled,
  resolveAdminJournalEntryBySource,
  upsertAdminJournalEntry,
} from "./admin-journal.service.js";

type DbClient = Prisma.TransactionClient | typeof prisma;
type JsonRecord = Record<string, unknown>;

export type CrmOutboxEventType =
  | "teacher_attendance"
  | "admin_attendance"
  | "teacher_submit"
  | "teacher_not_held"
  | "teacher_withdraw";

type DeliveryPayload = {
  crmClassId: string;
  body: JsonRecord;
  reportVersionId?: string;
  studentCheckId?: string;
  studentId?: string;
  syncRevision?: number;
};

function inputJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function outputJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function retryable(error: unknown) {
  return !(error instanceof AppError) || error.statusCode >= 500 || error.statusCode === 409;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Неизвестная ошибка синхронизации CRM";
}

function nextAttempt(attempts: number) {
  const delayMs = Math.min(5 * 60_000, Math.max(15_000, attempts * 30_000));
  return new Date(Date.now() + delayMs);
}

export async function enqueueCrmOutboxEvent(
  params: {
    aggregateId: string;
    eventType: CrmOutboxEventType;
    payload: DeliveryPayload;
    idempotencyKey: string;
  },
  db: DbClient = prisma,
) {
  return db.crmOutboxEvent.upsert({
    where: { idempotencyKey: params.idempotencyKey },
    create: {
      aggregateType: "offline_lesson",
      aggregateId: params.aggregateId,
      eventType: params.eventType,
      payload: inputJson(params.payload),
      idempotencyKey: params.idempotencyKey,
    },
    update: {},
  });
}

async function deliver(event: {
  eventType: string;
  idempotencyKey: string;
  payload: Prisma.JsonValue;
}) {
  const payload = event.payload as unknown as DeliveryPayload;
  switch (event.eventType as CrmOutboxEventType) {
    case "teacher_attendance":
      return postTeacherAttendance(
        payload.crmClassId,
        payload.body as Parameters<typeof postTeacherAttendance>[1],
        event.idempotencyKey,
      );
    case "admin_attendance":
      return postAdminAttendance(
        payload.crmClassId,
        payload.body as Parameters<typeof postAdminAttendance>[1],
        event.idempotencyKey,
      );
    case "teacher_submit":
      return postTeacherSubmit(
        payload.crmClassId,
        payload.body as TeacherSubmitPayload,
        event.idempotencyKey,
      );
    case "teacher_not_held":
      return postTeacherMarkNotHeld(
        payload.crmClassId,
        payload.body as Parameters<typeof postTeacherMarkNotHeld>[1],
        event.idempotencyKey,
      );
    case "teacher_withdraw":
      return postTeacherWithdraw(
        payload.crmClassId,
        payload.body as Parameters<typeof postTeacherWithdraw>[1],
        event.idempotencyKey,
      );
    default:
      throw new BadRequestError("Неизвестный тип CRM-события", "CRM_OUTBOX_EVENT_UNKNOWN");
  }
}

async function markDelivered(event: {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.JsonValue;
}, response: JsonRecord) {
  const payload = event.payload as unknown as DeliveryPayload;
  await prisma.$transaction(async (tx) => {
    await tx.crmOutboxEvent.update({
      where: { id: event.id },
      data: {
        status: "succeeded",
        lastError: null,
        responsePayload: outputJson(response),
        nextAttemptAt: null,
        processingAt: null,
        completedAt: new Date(),
      },
    });

    if (payload.studentCheckId && payload.syncRevision !== undefined) {
      await tx.offlineLessonStudentCheck.updateMany({
        where: {
          id: payload.studentCheckId,
          syncRevision: payload.syncRevision,
        },
        data: {
          syncStatus: "synced",
          lastSyncError: null,
          syncedAt: new Date(),
        },
      });
    }

    if (payload.reportVersionId) {
      await tx.offlineLessonReportVersion.update({
        where: { id: payload.reportVersionId },
        data: { crmDeliveredAt: new Date() },
      });
      const version = await tx.offlineLessonReportVersion.findUnique({
        where: { id: payload.reportVersionId },
        select: { reportId: true },
      });
      if (version) {
        await tx.offlineLessonReport.update({
          where: { id: version.reportId },
          data: {
            status: event.eventType === "teacher_withdraw" ? "editing" : "pending_review",
          },
        });
      }
    }
  });

  const responseClass = response.class;
  if (responseClass && typeof responseClass === "object" && !Array.isArray(responseClass)) {
    await saveOfflineLessonProjection(event.aggregateId, responseClass as JsonRecord);
  }
  if (curatorWorkspaceV2Enabled()) {
    await resolveAdminJournalEntryBySource({
      sourceKey: `crm-sync:${event.id}`,
      resolution: "CRM приняла событие; синхронизация восстановлена",
      actionKey: `crm-sync:${event.id}:resolved`,
      payload: { eventType: event.eventType, crmClassId: event.aggregateId },
    });
  }
}

async function markFailed(event: {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.JsonValue;
  attempts: number;
}, error: unknown) {
  const message = errorMessage(error);
  const shouldRetry = retryable(error);
  const payload = event.payload as unknown as DeliveryPayload;

  await prisma.$transaction(async (tx) => {
    await tx.crmOutboxEvent.update({
      where: { id: event.id },
      data: {
        status: shouldRetry ? "failed" : "conflict",
        lastError: message,
        nextAttemptAt: shouldRetry ? nextAttempt(event.attempts) : null,
        processingAt: null,
      },
    });

    if (payload.studentCheckId) {
      await tx.offlineLessonStudentCheck.update({
        where: { id: payload.studentCheckId },
        data: {
          syncStatus: shouldRetry ? "pending_sync" : "conflict",
          lastSyncError: message,
        },
      });
    }

    if (payload.reportVersionId) {
      const version = await tx.offlineLessonReportVersion.findUnique({
        where: { id: payload.reportVersionId },
        select: { reportId: true },
      });
      if (version) {
        await tx.offlineLessonReport.update({
          where: { id: version.reportId },
          data: { status: shouldRetry ? "pending_sync" : "conflict" },
        });
      }
    }

    if (!shouldRetry) {
      const existing = await tx.crmSyncConflict.findFirst({
        where: { outboxEventId: event.id, status: { not: "resolved" } },
      });
      if (existing) {
        await tx.crmSyncConflict.update({
          where: { id: existing.id },
          data: { status: "open", errorMessage: message },
        });
      } else {
        await tx.crmSyncConflict.create({
          data: {
            outboxEventId: event.id,
            crmClassId: event.aggregateId,
            kind: event.eventType,
            localPayload: inputJson(payload),
            errorMessage: message,
          },
        });
      }
    }
  });
  if (curatorWorkspaceV2Enabled()) {
    await upsertAdminJournalEntry({
      sourceKey: `crm-sync:${event.id}`,
      type: "crm_sync",
      severity: shouldRetry ? "high" : "critical",
      source: "crm",
      linkedEntityType: "crm_outbox_event",
      linkedEntityId: event.id,
      title: shouldRetry ? "Данные ещё не переданы" : "Данные урока расходятся с расписанием",
      summary: message.replace(/\s+/g, " ").trim().slice(0, 1000),
      payload: {
        eventType: event.eventType,
        crmClassId: event.aggregateId,
        retryable: shouldRetry,
      },
    });
  }
}

export async function processCrmOutboxEvent(eventId: string) {
  const claimed = await prisma.crmOutboxEvent.updateMany({
    where: {
      id: eventId,
      status: { in: ["pending", "failed"] },
    },
    data: {
      status: "processing",
      processingAt: new Date(),
      attempts: { increment: 1 },
    },
  });
  if (!claimed.count) {
    return prisma.crmOutboxEvent.findUnique({ where: { id: eventId } });
  }

  const event = await prisma.crmOutboxEvent.findUniqueOrThrow({ where: { id: eventId } });
  try {
    const response = await deliver(event) as JsonRecord;
    await markDelivered(event, response);
  } catch (error) {
    await markFailed(event, error);
  }
  return prisma.crmOutboxEvent.findUnique({ where: { id: eventId } });
}

export async function flushCrmOutboxForLesson(crmClassId: string) {
  const events = await prisma.crmOutboxEvent.findMany({
    where: {
      aggregateType: "offline_lesson",
      aggregateId: crmClassId,
      status: { in: ["pending", "failed"] },
    },
    orderBy: { createdAt: "asc" },
  });
  const results = [];
  for (const event of events) {
    const result = await processCrmOutboxEvent(event.id);
    results.push(result);
    if (result?.status !== "succeeded") break;
  }
  return results;
}

export async function processDueCrmOutboxEvents(limit = 25) {
  const stale = new Date(Date.now() - 2 * 60_000);
  await prisma.crmOutboxEvent.updateMany({
    where: { status: "processing", processingAt: { lt: stale } },
    data: { status: "failed", processingAt: null, nextAttemptAt: new Date() },
  });
  const now = new Date();
  const events = await prisma.crmOutboxEvent.findMany({
    where: {
      OR: [
        { status: "pending" },
        { status: "failed", nextAttemptAt: { lte: now } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  for (const event of events) {
    await processCrmOutboxEvent(event.id);
  }
  return events.length;
}

export function startCrmOutboxWorker() {
  if (!process.env.INTEGRATION_SERVICE_SECRET) return () => undefined;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await processDueCrmOutboxEvents();
    } finally {
      running = false;
    }
  };
  void run();
  const interval = setInterval(() => void run(), 15_000);
  interval.unref();
  return () => clearInterval(interval);
}

export async function listCrmSyncJournal(crmClassId?: string) {
  const [events, conflicts] = await Promise.all([
    prisma.crmOutboxEvent.findMany({
      where: crmClassId ? { aggregateId: crmClassId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.crmSyncConflict.findMany({
      where: crmClassId ? { crmClassId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return { events, conflicts };
}

export async function retryCrmOutboxEvent(eventId: string) {
  const event = await prisma.crmOutboxEvent.findUnique({ where: { id: eventId } });
  if (!event) throw new BadRequestError("Запись для повторной отправки не найдена", "CRM_OUTBOX_NOT_FOUND");
  if (!["failed", "conflict"].includes(event.status)) {
    throw new BadRequestError("Повтор для этого события сейчас не требуется", "CRM_OUTBOX_NOT_RETRYABLE");
  }
  await prisma.$transaction([
    prisma.crmOutboxEvent.update({
      where: { id: eventId },
      data: { status: "pending", nextAttemptAt: new Date(), lastError: null },
    }),
    prisma.crmSyncConflict.updateMany({
      where: { outboxEventId: eventId, status: "open" },
      data: { status: "retrying" },
    }),
  ]);
  const result = await processCrmOutboxEvent(eventId);
  if (result?.status === "succeeded") {
    await prisma.crmSyncConflict.updateMany({
      where: { outboxEventId: eventId, status: { in: ["open", "retrying"] } },
      data: { status: "resolved", resolvedAt: new Date() },
    });
  }
  return result;
}

export async function resolveCrmSyncConflict(
  conflictId: string,
  actorId: string,
  resolution: "accept_crm" | "retry_local",
  reason: string,
) {
  const conflict = await prisma.crmSyncConflict.findUnique({ where: { id: conflictId } });
  if (!conflict) throw new BadRequestError("Конфликт не найден", "CRM_CONFLICT_NOT_FOUND");
  if (conflict.status === "resolved") return conflict;

  const localPayload = conflict.localPayload as Record<string, unknown>;
  const crmPayload = conflict.crmPayload as Record<string, unknown> | null;

  if (
    resolution === "retry_local"
    && !conflict.outboxEventId
    && conflict.kind === "attendance_mismatch"
  ) {
    const crmStudentId = String(localPayload.crmStudentId ?? "");
    const queued = await prisma.$transaction(async (tx) => {
      const check = await tx.offlineLessonStudentCheck.findUnique({
        where: {
          crmClassId_crmStudentId: { crmClassId: conflict.crmClassId, crmStudentId },
        },
      });
      if (!check) throw new BadRequestError("Локальная отметка не найдена", "ATTENDANCE_CHECK_NOT_FOUND");
      const updated = await tx.offlineLessonStudentCheck.update({
        where: { id: check.id },
        data: {
          syncRevision: { increment: 1 },
          syncStatus: "pending_sync",
          lastSyncError: null,
        },
      });
      const event = await enqueueCrmOutboxEvent({
        aggregateId: conflict.crmClassId,
        eventType: "admin_attendance",
        payload: {
          crmClassId: conflict.crmClassId,
          body: {
            studentId: crmStudentId,
            attendanceStatus: updated.attendanceStatus,
            attended: ["present", "late"].includes(updated.attendanceStatus),
            teacherNote: updated.teacherNote ?? undefined,
            homeworkReview: {
              sourceCrmClassId: updated.reviewedHomeworkCrmClassId,
              status: updated.homeworkStatus,
              completionPercent: updated.homeworkCompletionPercent,
              difficulties: updated.homeworkDifficulties,
              notCompletedReason: updated.homeworkNotCompletedReason,
            },
          },
          studentCheckId: updated.id,
          studentId: crmStudentId,
          syncRevision: updated.syncRevision,
        },
        idempotencyKey: `lesson-attendance:${conflict.crmClassId}:${crmStudentId}:r${updated.syncRevision}`,
      }, tx);
      await tx.crmSyncConflict.update({
        where: { id: conflictId },
        data: {
          outboxEventId: event.id,
          status: "retrying",
          resolution,
          resolutionNote: reason,
          resolvedById: actorId,
        },
      });
      return event;
    });
    const result = await processCrmOutboxEvent(queued.id);
    if (result?.status === "succeeded") {
      await prisma.crmSyncConflict.update({
        where: { id: conflictId },
        data: { status: "resolved", resolvedAt: new Date() },
      });
    }
    return result;
  }

  if (resolution === "retry_local" && conflict.outboxEventId) {
    await prisma.crmSyncConflict.update({
      where: { id: conflictId },
      data: {
        status: "retrying",
        resolution,
        resolutionNote: reason,
        resolvedById: actorId,
      },
    });
    return retryCrmOutboxEvent(conflict.outboxEventId);
  }

  const resolved = await prisma.$transaction(async (tx) => {
    if (conflict.kind === "attendance_mismatch") {
      const crmStudentId = String(localPayload.crmStudentId ?? "");
      const crmStatus = String(crmPayload?.attendanceStatus ?? "unmarked");
      await tx.offlineLessonStudentCheck.updateMany({
        where: { crmClassId: conflict.crmClassId, crmStudentId },
        data: {
          attendanceStatus: crmStatus,
          syncStatus: "synced",
          lastSyncError: null,
          syncedAt: new Date(),
        },
      });
    }
    if (conflict.outboxEventId) {
      await tx.crmOutboxEvent.update({
        where: { id: conflict.outboxEventId },
        data: { status: "resolved", nextAttemptAt: null },
      });
    }
    return tx.crmSyncConflict.update({
      where: { id: conflictId },
      data: {
        status: "resolved",
        resolution,
        resolutionNote: reason,
        resolvedById: actorId,
        resolvedAt: new Date(),
      },
    });
  });
  if (curatorWorkspaceV2Enabled() && conflict.outboxEventId) {
    await resolveAdminJournalEntryBySource({
      sourceKey: `crm-sync:${conflict.outboxEventId}`,
      resolution: reason,
      actionKey: `crm-sync:${conflict.outboxEventId}:conflict:${conflict.id}:resolved`,
      payload: { conflictId: conflict.id, resolution },
    });
  }
  return resolved;
}
