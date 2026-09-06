import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { AppError, BadRequestError, ConflictError } from "../../domain/errors.js";
import {
  postAdminApproveClass,
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
import { finalizeOfflineLessonApproval } from "./offline-lesson-finalization.service.js";
import type { LearningLessonV2ResultsInput } from "./learning-lesson-v2.service.js";
import { notifyOfflineLessonApproved } from "./notification.service.js";

type DbClient = Prisma.TransactionClient | typeof prisma;
type JsonRecord = Record<string, unknown>;

export type CrmOutboxEventType =
  | "teacher_attendance"
  | "admin_attendance"
  | "admin_approve"
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
  approvedBy?: string;
  approvalNotificationDelivery?: ApprovalNotificationDelivery;
};

export type OfflineLessonApprovedNotificationRequest = {
  crmClassId: string;
  crmTeacherId: string;
  reportVersion?: number;
  crmStudentIds?: string[];
  lessonTitle?: string | null;
  date?: string | null;
  startTime?: string | null;
  deliveryFormat?: "offline" | "online";
  meetingUrl?: string | null;
};

type ApprovalNotificationResult = Awaited<ReturnType<typeof notifyOfflineLessonApproved>>;

type ApprovalNotificationDelivery = {
  reportVersion: number;
  request: OfflineLessonApprovedNotificationRequest & { reportVersion: number };
  state: "pending" | "delivered" | "discarded";
  queuedAt: string;
  deliveredAt?: string;
  lastError?: string;
  result?: ApprovalNotificationResult;
};

const APPROVAL_NOTIFICATION_PAYLOAD_KEY = "approvalNotificationDelivery";

function inputJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function outputJson(value: unknown) {
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

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(stableJson(left)) === JSON.stringify(stableJson(right));
}

function crmDeliveryContractPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const payload = { ...(value as JsonRecord) };
  delete payload[APPROVAL_NOTIFICATION_PAYLOAD_KEY];
  return payload;
}

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readApprovalNotificationDelivery(payload: unknown): ApprovalNotificationDelivery | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const delivery = (payload as JsonRecord)[APPROVAL_NOTIFICATION_PAYLOAD_KEY];
  if (!delivery || typeof delivery !== "object" || Array.isArray(delivery)) return null;
  const candidate = delivery as JsonRecord;
  const request = candidate.request;
  if (
    !Number.isInteger(candidate.reportVersion)
    || !request
    || typeof request !== "object"
    || Array.isArray(request)
    || typeof (request as JsonRecord).crmClassId !== "string"
    || typeof (request as JsonRecord).crmTeacherId !== "string"
    || !["pending", "delivered", "discarded"].includes(String(candidate.state))
  ) {
    return null;
  }
  return delivery as ApprovalNotificationDelivery;
}

function withApprovalNotificationDelivery(
  payload: unknown,
  delivery: ApprovalNotificationDelivery,
) {
  const current = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as JsonRecord
    : {};
  return jsonSafe({
    ...current,
    [APPROVAL_NOTIFICATION_PAYLOAD_KEY]: delivery,
  });
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
  const event = await db.crmOutboxEvent.upsert({
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
  if (
    event.aggregateType !== "offline_lesson"
    || event.aggregateId !== params.aggregateId
    || event.eventType !== params.eventType
    || !sameJson(
      crmDeliveryContractPayload(event.payload),
      crmDeliveryContractPayload(params.payload),
    )
  ) {
    throw new ConflictError(
      "Ключ повторной отправки уже занят другим CRM-событием.",
      "CRM_OUTBOX_IDEMPOTENCY_CONFLICT",
    );
  }
  return event;
}

function readApprovalLearningResults(payload: unknown): LearningLessonV2ResultsInput | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as JsonRecord).learningResultsV2;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as JsonRecord;
  if (!Array.isArray(candidate.homeworkDecisions) || !Array.isArray(candidate.topicUpdates)) {
    throw new ConflictError(
      "Снимок учебных результатов подтверждаемой версии повреждён.",
      "LESSON_APPROVAL_SNAPSHOT_INVALID",
    );
  }
  return value as LearningLessonV2ResultsInput;
}

function readApprovalActor(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return fallback;
  const approvedBy = (payload as JsonRecord).learningResultsApprovedBy;
  return typeof approvedBy === "string" && approvedBy.trim() ? approvedBy : fallback;
}

async function confirmOfflineLessonApproval(event: {
  aggregateId: string;
  payload: Prisma.JsonValue;
}, database: typeof prisma = prisma) {
  const payload = event.payload as unknown as DeliveryPayload;
  if (!payload.reportVersionId) {
    throw new ConflictError(
      "CRM-подтверждение не связано с версией отчёта.",
      "LESSON_APPROVAL_VERSION_MISSING",
    );
  }
  return database.$transaction(async (tx) => {
    const version = await tx.offlineLessonReportVersion.findUnique({
      where: { id: payload.reportVersionId },
    });
    if (!version || version.state !== "submitted") {
      throw new ConflictError(
        "Подтверждаемая версия отчёта не найдена или уже отозвана.",
        "LESSON_APPROVAL_VERSION_INVALID",
      );
    }
    const report = await tx.offlineLessonReport.findUnique({
      where: { id: version.reportId },
    });
    if (!report || report.crmClassId !== event.aggregateId) {
      throw new ConflictError(
        "Подтверждение CRM связано с другим уроком.",
        "LESSON_APPROVAL_REPORT_MISMATCH",
      );
    }
    if (report.currentVersion !== version.version) {
      throw new ConflictError(
        "CRM ответила на устаревшую версию отчёта.",
        "LESSON_APPROVAL_STALE_VERSION",
      );
    }
    if (["editing", "correcting"].includes(report.status)) {
      throw new ConflictError(
        "Отчёт уже возвращён на исправление.",
        "LESSON_APPROVAL_SUPERSEDED",
      );
    }

    const deliveredAt = new Date();
    await tx.offlineLessonReportVersion.update({
      where: { id: version.id },
      data: { crmDeliveredAt: version.crmDeliveredAt ?? deliveredAt },
    });

    if (
      report.status === "confirmed"
      && report.crmConfirmedAt
      && report.confirmedVersion === version.version
    ) {
      return {
        reportVersion: version.version,
        approvedBy: readApprovalActor(version.payload, payload.approvedBy ?? version.authorUserId),
        learningResultsV2: readApprovalLearningResults(version.payload),
      };
    }
    if (report.crmConfirmedAt || report.confirmedVersion) {
      throw new ConflictError(
        "У урока уже подтверждена другая версия отчёта.",
        "LESSON_APPROVAL_CONFIRMED_VERSION_MISMATCH",
      );
    }

    const confirmed = await tx.offlineLessonReport.updateMany({
      where: {
        id: report.id,
        currentVersion: version.version,
        status: { in: ["approving", "pending_sync", "conflict", "pending_review"] },
        crmConfirmedAt: null,
        confirmedVersion: null,
      },
      data: {
        status: "confirmed",
        confirmedVersion: version.version,
        crmConfirmedAt: deliveredAt,
      },
    });
    if (confirmed.count !== 1) {
      throw new ConflictError(
        "Состояние отчёта изменилось во время подтверждения.",
        "LESSON_REPORT_STATE_CHANGED",
      );
    }
    return {
      reportVersion: version.version,
      approvedBy: readApprovalActor(version.payload, payload.approvedBy ?? version.authorUserId),
      learningResultsV2: readApprovalLearningResults(version.payload),
    };
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
    case "admin_approve":
      return postAdminApproveClass(
        payload.crmClassId,
        payload.body as Parameters<typeof postAdminApproveClass>[1],
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

type ApprovalFreshness =
  | { current: true }
  | { current: false; reason: string };

async function readApprovalFreshness(
  event: { aggregateId: string; eventType: string; payload: Prisma.JsonValue },
  database: DbClient,
): Promise<ApprovalFreshness> {
  if (event.eventType !== "admin_approve") return { current: true };
  const payload = event.payload as unknown as DeliveryPayload;
  if (!payload.reportVersionId) {
    // A malformed event is a real conflict, not a historical event that may be hidden.
    return { current: true };
  }
  const version = await database.offlineLessonReportVersion.findUnique({
    where: { id: payload.reportVersionId },
    select: { reportId: true, version: true, state: true },
  });
  if (!version) {
    return { current: false, reason: "Подтверждение отменено: версия отчёта больше не существует." };
  }
  const report = await database.offlineLessonReport.findUnique({
    where: { id: version.reportId },
    select: { crmClassId: true, currentVersion: true, status: true },
  });
  if (!report || report.crmClassId !== event.aggregateId) {
    return { current: false, reason: "Подтверждение отменено: отчёт больше не относится к этому уроку." };
  }
  if (version.state !== "submitted" || report.currentVersion !== version.version) {
    return { current: false, reason: "Подтверждение отменено: версия отчёта устарела." };
  }
  if (["editing", "correcting"].includes(report.status)) {
    return { current: false, reason: "Подтверждение отменено: отчёт возвращён на исправление." };
  }
  return { current: true };
}

async function cancelStaleApprovalEventIfNeeded(
  eventId: string,
  database: typeof prisma = prisma,
  claimToken?: Date,
) {
  const event = await database.crmOutboxEvent.findUnique({ where: { id: eventId } });
  if (!event || event.eventType !== "admin_approve") return false;
  const freshness = await readApprovalFreshness(event, database);
  if (freshness.current) return false;

  const cancelledAt = new Date();
  const cancelled = await database.$transaction(async (tx) => {
    const where: Prisma.CrmOutboxEventWhereInput = claimToken
      ? { id: event.id, status: "processing", processingAt: claimToken }
      : { id: event.id, status: { in: ["pending", "failed", "conflict"] } };
    const result = await tx.crmOutboxEvent.updateMany({
      where,
      data: {
        status: "cancelled",
        lastError: freshness.reason,
        nextAttemptAt: null,
        processingAt: null,
        completedAt: cancelledAt,
      },
    });
    if (result.count !== 1) return false;
    await tx.crmSyncConflict.updateMany({
      where: {
        outboxEventId: event.id,
        status: { in: ["open", "retrying"] },
      },
      data: {
        status: "resolved",
        resolution: "superseded_by_new_report_version",
        resolutionNote: freshness.reason,
        resolvedAt: cancelledAt,
      },
    });
    return true;
  });
  if (cancelled && curatorWorkspaceV2Enabled()) {
    await resolveAdminJournalEntryBySource({
      sourceKey: `crm-sync:${event.id}`,
      resolution: freshness.reason,
      actionKey: `crm-sync:${event.id}:superseded`,
      payload: { eventType: event.eventType, crmClassId: event.aggregateId },
    });
  }
  return cancelled;
}

async function assertApprovalCurrentBeforeFinalization(
  event: { id: string; aggregateId: string; payload: Prisma.JsonValue },
  claimToken: Date,
  expectedReportVersion: number,
  database: typeof prisma = prisma,
) {
  const payload = event.payload as unknown as DeliveryPayload;
  if (!payload.reportVersionId) {
    throw new ConflictError(
      "Финализация не связана с версией отчёта.",
      "LESSON_APPROVAL_VERSION_MISSING",
    );
  }
  const state = await database.$transaction(async (tx) => {
    const liveEvent = await tx.crmOutboxEvent.findUnique({
      where: { id: event.id },
      select: { status: true, processingAt: true },
    });
    const version = await tx.offlineLessonReportVersion.findUnique({
      where: { id: payload.reportVersionId },
      select: { reportId: true, version: true, state: true },
    });
    const report = version
      ? await tx.offlineLessonReport.findUnique({
          where: { id: version.reportId },
          select: {
            crmClassId: true,
            currentVersion: true,
            status: true,
            confirmedVersion: true,
            crmConfirmedAt: true,
          },
        })
      : null;
    return { liveEvent, version, report };
  });
  const ownsClaim = state.liveEvent?.status === "processing"
    && state.liveEvent.processingAt?.getTime() === claimToken.getTime();
  const current = state.version?.state === "submitted"
    && state.version.version === expectedReportVersion
    && state.report?.crmClassId === event.aggregateId
    && state.report.currentVersion === expectedReportVersion
    && state.report.status === "confirmed"
    && state.report.confirmedVersion === expectedReportVersion
    && Boolean(state.report.crmConfirmedAt);
  if (!ownsClaim || !current) {
    throw new ConflictError(
      "Версия отчёта изменилась перед финализацией. Награды не начислены.",
      "LESSON_APPROVAL_SUPERSEDED",
    );
  }
}

async function markDelivered(event: {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.JsonValue;
}, response: JsonRecord, claimToken: Date, database: typeof prisma = prisma) {
  const payload = event.payload as unknown as DeliveryPayload;
  const ownsClaim = await database.$transaction(async (tx) => {
    const delivered = await tx.crmOutboxEvent.updateMany({
      where: {
        id: event.id,
        status: "processing",
        processingAt: claimToken,
      },
      data: {
        status: "succeeded",
        lastError: null,
        responsePayload: outputJson(response),
        nextAttemptAt: null,
        processingAt: null,
        completedAt: new Date(),
      },
    });
    if (delivered.count !== 1) return false;

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
        select: { reportId: true, version: true },
      });
      if (version && event.eventType !== "admin_approve") {
        const expectedStatuses = event.eventType === "teacher_withdraw"
          ? ["pending_sync"]
          : ["pending_sync", "conflict"];
        await tx.offlineLessonReport.updateMany({
          where: {
            id: version.reportId,
            currentVersion: version.version,
            status: { in: expectedStatuses },
            crmConfirmedAt: null,
          },
          data: {
            status: event.eventType === "teacher_withdraw" ? "editing" : "pending_review",
          },
        });
      }
    }
    return true;
  });
  if (!ownsClaim) return false;

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
  return true;
}

async function markFailed(event: {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.JsonValue;
  attempts: number;
}, error: unknown, claimToken: Date, database: typeof prisma = prisma) {
  const message = errorMessage(error);
  const shouldRetry = retryable(error);
  const payload = event.payload as unknown as DeliveryPayload;

  const ownsClaim = await database.$transaction(async (tx) => {
    const failed = await tx.crmOutboxEvent.updateMany({
      where: {
        id: event.id,
        status: "processing",
        processingAt: claimToken,
      },
      data: {
        status: shouldRetry ? "failed" : "conflict",
        lastError: message,
        nextAttemptAt: shouldRetry ? nextAttempt(event.attempts) : null,
        processingAt: null,
      },
    });
    if (failed.count !== 1) return false;

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
        select: { reportId: true, version: true },
      });
      if (version) {
        await tx.offlineLessonReport.updateMany({
          where: {
            id: version.reportId,
            currentVersion: version.version,
            status: event.eventType === "admin_approve"
              ? { in: ["approving", "pending_sync", "conflict"] }
              : { in: ["pending_sync", "conflict"] },
            crmConfirmedAt: null,
          },
          data: {
            status: event.eventType === "admin_approve" && shouldRetry
              ? "approving"
              : shouldRetry
                ? "pending_sync"
                : "conflict",
          },
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
    return true;
  });
  if (!ownsClaim) return false;
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
  return true;
}

type CrmOutboxProcessorDependencies = {
  database: typeof prisma;
  deliverEvent: typeof deliver;
  confirmApproval: typeof confirmOfflineLessonApproval;
  finalizeApproval: typeof finalizeOfflineLessonApproval;
  notifyApproval: typeof notifyOfflineLessonApproved;
  now: () => Date;
};

const defaultCrmOutboxProcessorDependencies: CrmOutboxProcessorDependencies = {
  database: prisma,
  deliverEvent: deliver,
  confirmApproval: confirmOfflineLessonApproval,
  finalizeApproval: finalizeOfflineLessonApproval,
  notifyApproval: notifyOfflineLessonApproved,
  now: () => new Date(),
};

export type CrmOutboxProcessorOverrides = Partial<CrmOutboxProcessorDependencies>;

function crmOutboxProcessorDependencies(overrides: CrmOutboxProcessorOverrides) {
  return { ...defaultCrmOutboxProcessorDependencies, ...overrides };
}

type ApprovalNotificationDrainResult = {
  state: ApprovalNotificationDelivery["state"];
  reportVersion: number;
  result: ApprovalNotificationResult | null;
  error?: string;
};

async function replaceApprovalNotificationDelivery(
  event: { id: string; status: string; payload: Prisma.JsonValue },
  delivery: ApprovalNotificationDelivery,
  database: typeof prisma,
) {
  const nextPayload = withApprovalNotificationDelivery(event.payload, delivery);
  const updated = await database.crmOutboxEvent.updateMany({
    where: {
      id: event.id,
      status: event.status,
      payload: { equals: inputJson(event.payload) },
    },
    data: { payload: inputJson(nextPayload) },
  });
  return updated.count === 1;
}

export async function deliverQueuedOfflineLessonApprovedNotification(
  eventId: string,
  overrides: CrmOutboxProcessorOverrides = {},
): Promise<ApprovalNotificationDrainResult | null> {
  const dependencies = crmOutboxProcessorDependencies(overrides);
  const event = await dependencies.database.crmOutboxEvent.findUnique({ where: { id: eventId } });
  if (!event || event.eventType !== "admin_approve") return null;

  const delivery = readApprovalNotificationDelivery(event.payload);
  if (!delivery) return null;
  if (delivery.state === "delivered") {
    return {
      state: "delivered",
      reportVersion: delivery.reportVersion,
      result: delivery.result ?? null,
    };
  }
  if (delivery.state === "discarded") {
    return {
      state: "discarded",
      reportVersion: delivery.reportVersion,
      result: null,
      error: delivery.lastError,
    };
  }
  if (event.status !== "succeeded") {
    return { state: "pending", reportVersion: delivery.reportVersion, result: null };
  }

  const report = await dependencies.database.offlineLessonReport.findUnique({
    where: { crmClassId: event.aggregateId },
    select: {
      currentVersion: true,
      status: true,
      confirmedVersion: true,
      crmConfirmedAt: true,
    },
  });
  const approvalIsCurrent = delivery.request.crmClassId === event.aggregateId
    && report?.currentVersion === delivery.reportVersion
    && report.status === "confirmed"
    && report.confirmedVersion === delivery.reportVersion
    && Boolean(report.crmConfirmedAt);
  if (!approvalIsCurrent) {
    const reason = "Уведомление отменено: подтверждение относится к неактуальной версии отчёта.";
    const discarded: ApprovalNotificationDelivery = {
      ...delivery,
      state: "discarded",
      lastError: reason,
    };
    await replaceApprovalNotificationDelivery(event, discarded, dependencies.database);
    return {
      state: "discarded",
      reportVersion: delivery.reportVersion,
      result: null,
      error: reason,
    };
  }

  try {
    const result = await dependencies.notifyApproval({
      ...delivery.request,
      dedupeIdentity: `offline-lesson-approval:${event.aggregateId}:v${delivery.reportVersion}`,
    });
    const delivered: ApprovalNotificationDelivery = {
      ...delivery,
      state: "delivered",
      deliveredAt: dependencies.now().toISOString(),
      lastError: undefined,
      result,
    };
    const stored = await replaceApprovalNotificationDelivery(event, delivered, dependencies.database);
    return stored
      ? { state: "delivered", reportVersion: delivery.reportVersion, result }
      : { state: "pending", reportVersion: delivery.reportVersion, result: null };
  } catch (error) {
    const message = errorMessage(error);
    await replaceApprovalNotificationDelivery(event, {
      ...delivery,
      state: "pending",
      lastError: message,
    }, dependencies.database);
    return {
      state: "pending",
      reportVersion: delivery.reportVersion,
      result: null,
      error: message,
    };
  }
}

function emptyApprovalNotificationResult(): ApprovalNotificationResult {
  return {
    delivered: false,
    teacherLinked: false,
    studentsDelivered: 0,
    parentsDelivered: 0,
    duplicate: false,
    notificationId: null,
  };
}

export async function queueOfflineLessonApprovedNotification(
  request: OfflineLessonApprovedNotificationRequest,
  overrides: CrmOutboxProcessorOverrides = {},
) {
  const dependencies = crmOutboxProcessorDependencies(overrides);
  const queuedAt = dependencies.now().toISOString();
  const staged = await dependencies.database.$transaction(async (tx) => {
    const report = await tx.offlineLessonReport.findUnique({
      where: { crmClassId: request.crmClassId },
    });
    if (!report?.currentVersion) {
      throw new ConflictError(
        "Для урока нет актуального отчёта, который можно подтвердить.",
        "LESSON_APPROVAL_REPORT_NOT_FOUND",
      );
    }
    if (request.reportVersion !== undefined && request.reportVersion !== report.currentVersion) {
      throw new ConflictError(
        "Callback относится к устаревшей версии отчёта.",
        "LESSON_APPROVAL_CALLBACK_STALE_VERSION",
      );
    }
    const version = await tx.offlineLessonReportVersion.findUnique({
      where: {
        reportId_version: {
          reportId: report.id,
          version: report.currentVersion,
        },
      },
    });
    const event = await tx.crmOutboxEvent.findUnique({
      where: {
        idempotencyKey: `lesson-report:${request.crmClassId}:v${report.currentVersion}:approve`,
      },
    });
    const payload = event?.payload as unknown as DeliveryPayload | undefined;
    if (
      !version
      || !event
      || event.eventType !== "admin_approve"
      || event.aggregateId !== request.crmClassId
      || payload?.reportVersionId !== version.id
    ) {
      throw new ConflictError(
        "Подтверждение CRM не связано с актуальной версией отчёта.",
        "LESSON_APPROVAL_CALLBACK_EVENT_MISSING",
      );
    }
    if (!["pending", "failed", "processing", "succeeded"].includes(event.status)) {
      throw new ConflictError(
        "Подтверждение CRM уже отменено или находится в конфликте.",
        "LESSON_APPROVAL_CALLBACK_NOT_DELIVERABLE",
      );
    }

    const existing = readApprovalNotificationDelivery(event.payload);
    if (existing?.state === "delivered") {
      return { event, report, delivery: existing };
    }

    const normalizedRequest = jsonSafe({
      ...request,
      reportVersion: report.currentVersion,
    }) as OfflineLessonApprovedNotificationRequest & { reportVersion: number };
    const delivery: ApprovalNotificationDelivery = {
      reportVersion: report.currentVersion,
      request: normalizedRequest,
      state: "pending",
      queuedAt: existing?.queuedAt ?? queuedAt,
    };
    const updated = await tx.crmOutboxEvent.updateMany({
      where: {
        id: event.id,
        status: { in: ["pending", "failed", "processing", "succeeded"] },
      },
      data: {
        payload: inputJson(withApprovalNotificationDelivery(event.payload, delivery)),
      },
    });
    if (updated.count !== 1) {
      throw new ConflictError(
        "Состояние подтверждения изменилось во время постановки уведомления в очередь.",
        "LESSON_APPROVAL_CALLBACK_STATE_CHANGED",
      );
    }
    const liveEvent = await tx.crmOutboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    return { event: liveEvent, report, delivery };
  });

  let drain: ApprovalNotificationDrainResult | null = null;
  if (staged.event.status === "succeeded") {
    drain = await deliverQueuedOfflineLessonApprovedNotification(staged.event.id, dependencies);
  }
  const liveEvent = await dependencies.database.crmOutboxEvent.findUnique({
    where: { id: staged.event.id },
  });
  const liveDelivery = readApprovalNotificationDelivery(liveEvent?.payload)
    ?? staged.delivery;
  const notification = liveDelivery.state === "delivered"
    ? liveDelivery.result ?? drain?.result ?? emptyApprovalNotificationResult()
    : emptyApprovalNotificationResult();
  const response = liveEvent?.responsePayload
    && typeof liveEvent.responsePayload === "object"
    && !Array.isArray(liveEvent.responsePayload)
    ? liveEvent.responsePayload as JsonRecord
    : null;
  const approvalStatus = liveEvent?.status ?? staged.event.status;
  const confirmed = staged.report.status === "confirmed"
    && staged.report.confirmedVersion === liveDelivery.reportVersion
    && approvalStatus === "succeeded";

  return {
    ...notification,
    queued: liveDelivery.state === "pending",
    deliveryState: liveDelivery.state,
    deliveryError: liveDelivery.lastError ?? drain?.error ?? null,
    learningRewards: response?.learningRewards ?? null,
    reconciliation: {
      reportVersion: liveDelivery.reportVersion,
      reportStatus: staged.report.status,
      approvalStatus,
      current: confirmed,
    },
  };
}

export async function processCrmOutboxEvent(
  eventId: string,
  overrides: CrmOutboxProcessorOverrides = {},
) {
  const dependencies = crmOutboxProcessorDependencies(overrides);
  if (await cancelStaleApprovalEventIfNeeded(eventId, dependencies.database)) {
    return dependencies.database.crmOutboxEvent.findUnique({ where: { id: eventId } });
  }
  const claimToken = dependencies.now();
  const claimed = await dependencies.database.crmOutboxEvent.updateMany({
    where: {
      id: eventId,
      status: { in: ["pending", "failed"] },
    },
    data: {
      status: "processing",
      processingAt: claimToken,
      attempts: { increment: 1 },
    },
  });
  if (!claimed.count) {
    return dependencies.database.crmOutboxEvent.findUnique({ where: { id: eventId } });
  }

  const event = await dependencies.database.crmOutboxEvent.findUniqueOrThrow({
    where: { id: eventId },
  });
  try {
    const response = await dependencies.deliverEvent(event) as JsonRecord;
    if (event.eventType === "admin_approve") {
      const approval = await dependencies.confirmApproval(event, dependencies.database);
      await assertApprovalCurrentBeforeFinalization(
        event,
        claimToken,
        approval.reportVersion,
        dependencies.database,
      );
      const responseClass = response.class;
      const lesson = responseClass && typeof responseClass === "object" && !Array.isArray(responseClass)
        ? responseClass as JsonRecord
        : null;
      const learningRewards = await dependencies.finalizeApproval({
        crmClassId: event.aggregateId,
        approvedBy: approval.approvedBy,
        learningResultsV2: approval.learningResultsV2,
        lesson,
        reportVersion: approval.reportVersion,
      });
      const markedDelivered = await markDelivered(
        event,
        { ...response, learningRewards },
        claimToken,
        dependencies.database,
      );
      if (markedDelivered) {
        await deliverQueuedOfflineLessonApprovedNotification(event.id, dependencies);
      }
    } else {
      await markDelivered(event, response, claimToken, dependencies.database);
    }
  } catch (error) {
    const superseded = event.eventType === "admin_approve"
      && await cancelStaleApprovalEventIfNeeded(event.id, dependencies.database, claimToken);
    if (!superseded) {
      await markFailed(event, error, claimToken, dependencies.database);
    }
  }
  return dependencies.database.crmOutboxEvent.findUnique({ where: { id: eventId } });
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
    if (result?.status !== "succeeded" && result?.status !== "cancelled") break;
  }
  return results;
}

export async function processDueCrmOutboxEvents(
  limit = 25,
  overrides: CrmOutboxProcessorOverrides = {},
) {
  const dependencies = crmOutboxProcessorDependencies(overrides);
  const now = dependencies.now();
  const stale = new Date(now.getTime() - 2 * 60_000);
  await dependencies.database.crmOutboxEvent.updateMany({
    where: {
      status: "processing",
      processingAt: { lt: stale },
    },
    data: { status: "failed", processingAt: null, nextAttemptAt: now },
  });
  const events = await dependencies.database.crmOutboxEvent.findMany({
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
    await processCrmOutboxEvent(event.id, dependencies);
  }
  const notificationEvents = await dependencies.database.crmOutboxEvent.findMany({
    where: {
      eventType: "admin_approve",
      status: "succeeded",
      payload: {
        path: [APPROVAL_NOTIFICATION_PAYLOAD_KEY, "state"],
        equals: "pending",
      },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
  for (const event of notificationEvents) {
    await deliverQueuedOfflineLessonApprovedNotification(event.id, dependencies);
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
  if (await cancelStaleApprovalEventIfNeeded(eventId)) {
    return prisma.crmOutboxEvent.findUnique({ where: { id: eventId } });
  }
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
