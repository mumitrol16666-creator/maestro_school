import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ConflictError } from "../../domain/errors.js";
import type { TeacherSubmitPayload } from "../../infrastructure/crm/crm-client.js";
import {
  withInferredTopicHomeworkAssignment,
  type LearningLessonV2ResultsInput,
} from "./learning-lesson-v2.service.js";
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

export function sameOfflineLessonLearningResultsV2(
  left: LearningLessonV2ResultsInput | null | undefined,
  right: LearningLessonV2ResultsInput | null | undefined,
) {
  return samePayload(left ?? null, right ?? null);
}

export function offlineLessonApprovalIdempotencyKey(
  crmClassId: string,
  version: number,
) {
  return `lesson-report:${crmClassId}:v${version}:approve`;
}

export type OfflineLessonCorrectionReservation = {
  reportId: string;
  crmClassId: string;
  reportVersion: number;
  reason: string;
  state: "reserved" | "already_reserved" | "already_editing";
};

type OfflineLessonCorrectionFinalizationState = {
  status: string;
  confirmedVersion: number | null;
  crmConfirmedAt: Date | null;
  rewardsApplied: boolean;
  approvalDelivered: boolean;
};

export function assertOfflineLessonCorrectionIsSafe(
  state: OfflineLessonCorrectionFinalizationState,
) {
  if (
    state.status === "confirmed"
    || state.confirmedVersion !== null
    || state.crmConfirmedAt !== null
    || state.rewardsApplied
    || state.approvalDelivered
  ) {
    throw new ConflictError(
      "Подтверждённый урок нельзя переоткрыть: темы, домашние задания и награды уже применены. Для исправления нужна отдельная безопасная корректировка без повторного начисления.",
      "LESSON_FINALIZED_CORRECTION_UNSAFE",
    );
  }
}

export function buildOfflineLessonReportPayloads(
  payload: Omit<TeacherSubmitPayload, "crmTeacherId">,
  crmTeacherId: string,
  learningResultsV2?: LearningLessonV2ResultsInput,
) {
  const crmPayload = { ...payload, crmTeacherId };
  const versionPayload = learningResultsV2
    ? withOfflineLessonLearningResultsV2(crmPayload, learningResultsV2)
    : crmPayload;
  return { crmPayload, versionPayload };
}

export function withOfflineLessonLearningResultsV2(
  payload: Record<string, unknown>,
  learningResultsV2: LearningLessonV2ResultsInput,
) {
  return { ...payload, learningResultsV2 };
}

export function withOfflineLessonApprovalSnapshot(
  payload: Record<string, unknown>,
  learningResultsV2: LearningLessonV2ResultsInput,
  approvedBy: string,
) {
  return {
    ...payload,
    learningResultsV2,
    learningResultsApprovedBy: approvedBy,
  };
}

export function readOfflineLessonApprovedBy(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>).learningResultsApprovedBy;
  return typeof value === "string" && value.trim() ? value : null;
}

export function readOfflineLessonLearningResultsV2(
  payload: unknown,
): LearningLessonV2ResultsInput | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>).learningResultsV2;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.homeworkDecisions) || !Array.isArray(candidate.topicUpdates)) {
    throw new BadRequestError(
      "Сохранённые учебные результаты повреждены",
      "LESSON_LEARNING_RESULTS_INVALID",
    );
  }
  return withInferredTopicHomeworkAssignment(
    payload,
    value as LearningLessonV2ResultsInput,
  );
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
  learningResultsV2?: LearningLessonV2ResultsInput;
  eventType?: "teacher_submit" | "teacher_not_held";
}) {
  const projection = await requireProjection(params.crmClassId);
  const snapshot = await attendanceSnapshot(params.crmClassId);
  const eventType = params.eventType ?? "teacher_submit";
  const { crmPayload, versionPayload } = buildOfflineLessonReportPayloads(
    params.payload,
    params.crmTeacherId,
    params.learningResultsV2,
  );

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
      && samePayload(latest.payload, versionPayload)
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
    if (existing && existing.status !== "editing") {
      throw new ConflictError(
        "Отчёт уже отправлен. Сначала отзовите или переоткройте его.",
        "LESSON_REPORT_NOT_EDITABLE",
      );
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
        payload: inputJson(versionPayload),
        attendancePayload: inputJson(snapshot),
        rosterVersion: projection.rosterVersion,
      },
    });
    const reportUpdated = await tx.offlineLessonReport.updateMany({
      where: {
        id: report.id,
        currentVersion: report.currentVersion,
        status: report.status,
        crmConfirmedAt: null,
        confirmedVersion: null,
      },
      data: {
        authorUserId: params.authorUserId,
        status: "pending_sync",
        currentVersion: versionNumber,
        correctionReason: null,
      },
    });
    if (reportUpdated.count !== 1) {
      throw new ConflictError(
        "Состояние отчёта изменилось. Обновите урок и повторите отправку.",
        "LESSON_REPORT_STATE_CHANGED",
      );
    }
    const updatedReport = await tx.offlineLessonReport.findUniqueOrThrow({
      where: { id: report.id },
    });
    await tx.offlineLessonDraft.deleteMany({
      where: { reportId: report.id, ownerUserId: params.authorUserId },
    });
    const event = await enqueueCrmOutboxEvent({
      aggregateId: params.crmClassId,
      eventType,
      payload: {
        crmClassId: params.crmClassId,
        body: crmPayload,
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

export async function getCurrentOfflineLessonLearningResultsV2(crmClassId: string) {
  const report = await prisma.offlineLessonReport.findUnique({
    where: { crmClassId },
  });
  const version = report?.currentVersion
    ? await prisma.offlineLessonReportVersion.findUnique({
        where: {
          reportId_version: {
            reportId: report.id,
            version: report.currentVersion,
          },
        },
      })
    : null;
  return {
    report,
    version,
    learningResultsV2: version ? readOfflineLessonLearningResultsV2(version.payload) : null,
  };
}

export async function prepareOfflineLessonApproval(params: {
  crmClassId: string;
  expectedVersion: number;
  crmPayload: Record<string, unknown>;
  learningResultsV2: LearningLessonV2ResultsInput;
  approvedBy: string;
}) {
  return prisma.$transaction(async (tx) => {
    const idempotencyKey = offlineLessonApprovalIdempotencyKey(
      params.crmClassId,
      params.expectedVersion,
    );
    const report = await tx.offlineLessonReport.findUnique({
      where: { crmClassId: params.crmClassId },
    });
    if (!report || report.currentVersion !== params.expectedVersion) {
      throw new ConflictError(
        "Версия отчёта изменилась. Обновите урок и повторите подтверждение.",
        "LESSON_REPORT_VERSION_CHANGED",
      );
    }
    const version = await tx.offlineLessonReportVersion.findUnique({
      where: {
        reportId_version: {
          reportId: report.id,
          version: params.expectedVersion,
        },
      },
    });
    if (!version || version.state !== "submitted" || !version.crmDeliveredAt) {
      throw new ConflictError(
        "Версия отчёта ещё не доставлена в CRM.",
        "LESSON_REPORT_NOT_DELIVERED",
      );
    }

    const existingApproval = await tx.crmOutboxEvent.findUnique({
      where: { idempotencyKey },
    });
    if (existingApproval) {
      const existingPayload = existingApproval.payload as unknown as {
        body?: unknown;
      };
      const existingResults = readOfflineLessonLearningResultsV2(version.payload);
      if (
        !samePayload(existingPayload.body ?? null, params.crmPayload)
        || !sameOfflineLessonLearningResultsV2(existingResults, params.learningResultsV2)
      ) {
        throw new ConflictError(
          "Эту версию уже подтверждает другой администратор с другими данными.",
          "LESSON_APPROVAL_PAYLOAD_CONFLICT",
        );
      }
      return existingApproval;
    }

    if (report.crmConfirmedAt) {
      throw new BadRequestError("Отчёт уже подтверждён", "LESSON_REPORT_CONFIRMED");
    }

    const claimed = await tx.offlineLessonReport.updateMany({
      where: {
        id: report.id,
        currentVersion: params.expectedVersion,
        status: "pending_review",
        crmConfirmedAt: null,
        confirmedVersion: null,
      },
      data: { status: "approving" },
    });
    if (claimed.count !== 1) {
      const concurrentApproval = await tx.crmOutboxEvent.findUnique({
        where: { idempotencyKey },
      });
      const concurrentVersion = await tx.offlineLessonReportVersion.findUnique({
        where: { id: version.id },
      });
      if (concurrentApproval && concurrentVersion) {
        const concurrentPayload = concurrentApproval.payload as unknown as { body?: unknown };
        const concurrentResults = readOfflineLessonLearningResultsV2(concurrentVersion.payload);
        if (
          samePayload(concurrentPayload.body ?? null, params.crmPayload)
          && sameOfflineLessonLearningResultsV2(concurrentResults, params.learningResultsV2)
        ) {
          return concurrentApproval;
        }
        throw new ConflictError(
          "Эту версию уже подтверждает другой администратор с другими данными.",
          "LESSON_APPROVAL_PAYLOAD_CONFLICT",
        );
      }
      throw new ConflictError(
        "Отчёт уже изменяется или больше не ожидает проверки.",
        "LESSON_REPORT_STATE_CHANGED",
      );
    }
    await tx.offlineLessonReportVersion.update({
      where: { id: version.id },
      data: {
        payload: inputJson(withOfflineLessonApprovalSnapshot(
          version.payload as Record<string, unknown>,
          params.learningResultsV2,
          params.approvedBy,
        )),
      },
    });

    return enqueueCrmOutboxEvent({
      aggregateId: params.crmClassId,
      eventType: "admin_approve",
      payload: {
        crmClassId: params.crmClassId,
        body: params.crmPayload,
        reportVersionId: version.id,
        approvedBy: params.approvedBy,
      },
      idempotencyKey,
    }, tx);
  });
}

export async function getCurrentOfflineLessonApprovalState(crmClassId: string) {
  return prisma.$transaction(async (tx) => {
    const report = await tx.offlineLessonReport.findUnique({ where: { crmClassId } });
    if (!report?.currentVersion) return { report, version: null, event: null };
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
        idempotencyKey: offlineLessonApprovalIdempotencyKey(
          crmClassId,
          report.currentVersion,
        ),
      },
    });
    return { report, version, event };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function assertCurrentOfflineLessonApprovalForFinalization(
  crmClassId: string,
  expectedVersion: number,
) {
  const state = await prisma.$transaction(async (tx) => {
    const report = await tx.offlineLessonReport.findUnique({ where: { crmClassId } });
    const version = report
      ? await tx.offlineLessonReportVersion.findUnique({
          where: {
            reportId_version: { reportId: report.id, version: expectedVersion },
          },
        })
      : null;
    return { report, version };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  if (
    !state.report
    || !state.version
    || state.version.state !== "submitted"
    || state.report.currentVersion !== expectedVersion
    || state.report.status !== "confirmed"
    || state.report.confirmedVersion !== expectedVersion
    || !state.report.crmConfirmedAt
  ) {
    throw new ConflictError(
      "Версия отчёта изменилась перед финализацией. Награды не начислены.",
      "LESSON_APPROVAL_SUPERSEDED",
    );
  }
  return state;
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
    const claimed = await tx.offlineLessonReport.updateMany({
      where: {
        id: report.id,
        currentVersion: version.version,
        status: { in: ["pending_sync", "pending_review", "conflict"] },
        crmConfirmedAt: null,
        confirmedVersion: null,
      },
      data: { status: "editing", correctionReason: params.reason },
    });
    if (claimed.count !== 1) {
      throw new ConflictError(
        "Состояние отчёта изменилось. Обновите урок и повторите отзыв.",
        "LESSON_REPORT_STATE_CHANGED",
      );
    }
    const versionUpdated = await tx.offlineLessonReportVersion.updateMany({
      where: { id: version.id, state: "submitted" },
      data: {
        state: "withdrawn",
        withdrawnAt: new Date(),
        withdrawnById: params.actorUserId,
        withdrawReason: params.reason,
      },
    });
    if (versionUpdated.count !== 1) {
      throw new ConflictError(
        "Версия отчёта уже изменена. Обновите урок и повторите отзыв.",
        "LESSON_REPORT_VERSION_CHANGED",
      );
    }
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

export async function reserveOfflineLessonCorrection(
  crmClassId: string,
  actorUserId: string,
  reason: string,
): Promise<OfflineLessonCorrectionReservation | null> {
  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new BadRequestError(
      "Укажите причину возврата отчёта на исправление.",
      "LESSON_CORRECTION_REASON_REQUIRED",
    );
  }

  return prisma.$transaction(async (tx) => {
    const report = await tx.offlineLessonReport.findUnique({ where: { crmClassId } });
    if (!report) return null;
    const [appliedReward, deliveredApproval] = await Promise.all([
      tx.offlineLessonStudentCheck.findFirst({
        where: { crmClassId, rewardsAppliedAt: { not: null } },
        select: { id: true },
      }),
      tx.crmOutboxEvent.findFirst({
        where: {
          aggregateType: "offline_lesson",
          aggregateId: crmClassId,
          eventType: "admin_approve",
          status: "succeeded",
        },
        select: { id: true },
      }),
    ]);
    assertOfflineLessonCorrectionIsSafe({
      status: report.status,
      confirmedVersion: report.confirmedVersion,
      crmConfirmedAt: report.crmConfirmedAt,
      rewardsApplied: Boolean(appliedReward),
      approvalDelivered: Boolean(deliveredApproval),
    });
    if (report.status === "editing" && !report.crmConfirmedAt && !report.confirmedVersion) {
      return {
        reportId: report.id,
        crmClassId,
        reportVersion: report.currentVersion,
        reason: normalizedReason,
        state: "already_editing" as const,
      };
    }
    if (report.status === "correcting" && report.correctionReason !== normalizedReason) {
      throw new ConflictError(
        "Отчёт уже возвращается на исправление по другой причине.",
        "LESSON_CORRECTION_ALREADY_RESERVED",
      );
    }

    const approvalKey = offlineLessonApprovalIdempotencyKey(crmClassId, report.currentVersion);
    const approvalBeforeClaim = await tx.crmOutboxEvent.findUnique({
      where: { idempotencyKey: approvalKey },
    });
    if (approvalBeforeClaim?.status === "processing") {
      throw new ConflictError(
        "Подтверждение уже передаётся в CRM. Дождитесь завершения и повторите возврат.",
        "LESSON_APPROVAL_IN_PROGRESS",
      );
    }

    const alreadyReserved = report.status === "correcting";
    if (!alreadyReserved) {
      const updatedCount = await tx.offlineLessonReport.updateMany({
        where: {
          id: report.id,
          currentVersion: report.currentVersion,
          status: { in: ["pending_review", "confirmed", "approving", "conflict"] },
        },
        data: {
          status: "correcting",
          correctionReason: normalizedReason,
          crmConfirmedAt: null,
          confirmedVersion: null,
        },
      });
      if (updatedCount.count !== 1) {
        throw new ConflictError(
          "Отчёт уже изменяется. Обновите урок и повторите действие.",
          "LESSON_REPORT_STATE_CHANGED",
        );
      }
    }

    const cancelledAt = new Date();
    await tx.crmOutboxEvent.updateMany({
      where: {
        idempotencyKey: approvalKey,
        status: { in: ["pending", "failed", "conflict"] },
      },
      data: {
        status: "cancelled",
        nextAttemptAt: null,
        processingAt: null,
        completedAt: cancelledAt,
        lastError: "Подтверждение отменено: отчёт возвращён на исправление.",
      },
    });
    const approvalAfterClaim = await tx.crmOutboxEvent.findUnique({
      where: { idempotencyKey: approvalKey },
    });
    if (approvalAfterClaim?.status === "processing") {
      throw new ConflictError(
        "Подтверждение уже передаётся в CRM. Дождитесь завершения и повторите возврат.",
        "LESSON_APPROVAL_IN_PROGRESS",
      );
    }
    if (approvalAfterClaim?.status === "cancelled") {
      await tx.crmSyncConflict.updateMany({
        where: {
          outboxEventId: approvalAfterClaim.id,
          status: { in: ["open", "retrying"] },
        },
        data: {
          status: "resolved",
          resolution: "superseded_by_correction",
          resolutionNote: normalizedReason,
          resolvedById: actorUserId,
          resolvedAt: cancelledAt,
        },
      });
    }

    const currentVersion = report.currentVersion
      ? await tx.offlineLessonReportVersion.findUnique({
          where: {
            reportId_version: {
              reportId: report.id,
              version: report.currentVersion,
            },
          },
        })
      : null;
    if (currentVersion) {
      const draftKey = {
        reportId_ownerUserId: { reportId: report.id, ownerUserId: actorUserId },
      };
      if (alreadyReserved) {
        const existingDraft = await tx.offlineLessonDraft.findUnique({ where: draftKey });
        if (!existingDraft) {
          await tx.offlineLessonDraft.create({
            data: {
              reportId: report.id,
              ownerUserId: actorUserId,
              payload: inputJson(currentVersion.payload),
              revision: 1,
              rosterVersion: currentVersion.rosterVersion,
              expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
            },
          });
        }
      } else {
        await tx.offlineLessonDraft.upsert({
          where: draftKey,
          create: {
            reportId: report.id,
            ownerUserId: actorUserId,
            payload: inputJson(currentVersion.payload),
            revision: 1,
            rosterVersion: currentVersion.rosterVersion,
            expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
          },
          update: {
            payload: inputJson(currentVersion.payload),
            revision: { increment: 1 },
            rosterVersion: currentVersion.rosterVersion,
            expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
          },
        });
      }
    }
    return {
      reportId: report.id,
      crmClassId,
      reportVersion: report.currentVersion,
      reason: normalizedReason,
      state: alreadyReserved ? "already_reserved" as const : "reserved" as const,
    };
  });
}

export async function completeOfflineLessonCorrection(
  reservation: OfflineLessonCorrectionReservation | null,
) {
  if (!reservation || reservation.state === "already_editing") return null;
  const completed = await prisma.offlineLessonReport.updateMany({
    where: {
      id: reservation.reportId,
      crmClassId: reservation.crmClassId,
      currentVersion: reservation.reportVersion,
      status: "correcting",
      correctionReason: reservation.reason,
      crmConfirmedAt: null,
      confirmedVersion: null,
    },
    data: { status: "editing" },
  });
  if (completed.count === 1) {
    return prisma.offlineLessonReport.findUniqueOrThrow({
      where: { id: reservation.reportId },
    });
  }
  const current = await prisma.offlineLessonReport.findUnique({
    where: { id: reservation.reportId },
  });
  if (
    current?.status === "editing"
    && current.currentVersion === reservation.reportVersion
    && current.correctionReason === reservation.reason
  ) {
    return current;
  }
  throw new ConflictError(
    "Состояние отчёта изменилось во время возврата на исправление.",
    "LESSON_REPORT_STATE_CHANGED",
  );
}

export async function reopenOfflineLessonReport(
  crmClassId: string,
  actorUserId: string,
  reason: string,
) {
  const reservation = await reserveOfflineLessonCorrection(crmClassId, actorUserId, reason);
  return completeOfflineLessonCorrection(reservation);
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
