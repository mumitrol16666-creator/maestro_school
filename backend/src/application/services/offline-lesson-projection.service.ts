import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { AppError, BadRequestError } from "../../domain/errors.js";
import {
  fetchClassCard,
  fetchClassStudents,
} from "../../infrastructure/crm/crm-client.js";
import { reconcileObservedCrmApproval } from "./crm-outbox.service.js";
import { saveOfflineLessonProjectionSnapshot } from "./offline-lesson-projection-store.service.js";

type JsonRecord = Record<string, unknown>;

type OfflineLessonSyncEventSnapshot = {
  eventType: string;
  payload: unknown;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type OfflineLessonSyncConflictSnapshot = {
  outboxEvent: Pick<OfflineLessonSyncEventSnapshot, "eventType" | "payload"> | null;
};

function asJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function isCrmTransportError(error: unknown) {
  return error instanceof AppError
    && (error.code === "CRM_UNAVAILABLE" || error.code === "CRM_TIMEOUT" || error.statusCode >= 500);
}

function reportVersionIdFromOutboxPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const reportVersionId = (payload as JsonRecord).reportVersionId;
  return typeof reportVersionId === "string" && reportVersionId.trim()
    ? reportVersionId
    : null;
}

/**
 * Attendance and other lesson events are independent from report revisions.
 * An approval, however, belongs only to the report version that produced it.
 */
export function isOfflineLessonSyncEventInCurrentChain(
  event: Pick<OfflineLessonSyncEventSnapshot, "eventType" | "payload">,
  currentReportVersionId: string | null,
  reportStatus: string | null,
) {
  if (event.eventType !== "admin_approve") return true;
  if (reportStatus === "editing" || reportStatus === "correcting") return false;

  const eventReportVersionId = reportVersionIdFromOutboxPayload(event.payload);
  // Keep malformed current events visible so an integration problem is not hidden.
  if (!eventReportVersionId) return true;
  return currentReportVersionId !== null && eventReportVersionId === currentReportVersionId;
}

export function summarizeOfflineLessonSyncChain(params: {
  events: OfflineLessonSyncEventSnapshot[];
  conflicts: OfflineLessonSyncConflictSnapshot[];
  currentReportVersionId: string | null;
  reportStatus: string | null;
}) {
  const eventIsCurrent = (event: Pick<OfflineLessonSyncEventSnapshot, "eventType" | "payload">) => (
    isOfflineLessonSyncEventInCurrentChain(
      event,
      params.currentReportVersionId,
      params.reportStatus,
    )
  );
  const currentEvents = params.events
    .filter(eventIsCurrent)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const lastEvent = currentEvents[0] ?? null;

  return {
    pendingCount: currentEvents.filter((event) => (
      ["pending", "processing", "failed"].includes(event.status)
    )).length,
    conflictCount: params.conflicts.filter((conflict) => (
      !conflict.outboxEvent || eventIsCurrent(conflict.outboxEvent)
    )).length,
    lastEvent,
  };
}

async function recordAttendanceConflicts(crmClassId: string, roster: JsonRecord) {
  const students = Array.isArray(roster.students)
    ? roster.students as Array<Record<string, unknown>>
    : [];
  const crmByStudent = new Map(students.map((student) => [
    String(student.crmStudentId ?? ""),
    String(student.attendanceStatus ?? "unmarked"),
  ]));
  const checks = await prisma.offlineLessonStudentCheck.findMany({
    where: { crmClassId, syncStatus: "synced" },
  });
  const existing = await prisma.crmSyncConflict.findMany({
    where: { crmClassId, kind: "attendance_mismatch", status: "open" },
    select: { localPayload: true },
  });
  const openStudents = new Set(existing.map((item) => String(
    (item.localPayload as Record<string, unknown>).crmStudentId ?? "",
  )));

  for (const check of checks) {
    const crmStatus = crmByStudent.get(check.crmStudentId);
    if (!crmStatus || crmStatus === check.attendanceStatus || openStudents.has(check.crmStudentId)) continue;
    const message = `Посещаемость CRM (${crmStatus}) отличается от отправленной (${check.attendanceStatus}).`;
    await prisma.$transaction([
      prisma.crmSyncConflict.create({
        data: {
          crmClassId,
          kind: "attendance_mismatch",
          localPayload: asJson({
            crmStudentId: check.crmStudentId,
            attendanceStatus: check.attendanceStatus,
            syncRevision: check.syncRevision,
          }),
          crmPayload: asJson({
            crmStudentId: check.crmStudentId,
            attendanceStatus: crmStatus,
          }),
          errorMessage: message,
        },
      }),
      prisma.offlineLessonStudentCheck.update({
        where: { id: check.id },
        data: { syncStatus: "conflict", lastSyncError: message },
      }),
    ]);
  }
}

export async function saveOfflineLessonProjection(
  crmClassId: string,
  lesson: JsonRecord,
  roster?: JsonRecord | null,
  options: { processObservedApproval?: boolean } = {},
) {
  const projection = await saveOfflineLessonProjectionSnapshot(crmClassId, lesson, roster);
  const projectedLesson = projection.lessonPayload
    && typeof projection.lessonPayload === "object"
    && !Array.isArray(projection.lessonPayload)
    ? projection.lessonPayload as JsonRecord
    : lesson;
  await reconcileObservedCrmApproval(crmClassId, projectedLesson, {
    processNow: options.processObservedApproval ?? true,
  });
  return projection;
}

export async function projectOfflineAgenda(classes: JsonRecord[]) {
  await Promise.all(classes.map((lesson) => {
    const crmClassId = typeof lesson.crmClassId === "string" ? lesson.crmClassId : "";
    return crmClassId
      ? saveOfflineLessonProjection(crmClassId, lesson, null, { processObservedApproval: false })
      : Promise.resolve(null);
  }));
}

export async function getProjectedOfflineLesson(crmClassId: string) {
  return prisma.offlineLessonProjection.findUnique({ where: { crmClassId } });
}

export async function updateProjectedOfflineLesson(
  crmClassId: string,
  patch: Record<string, unknown>,
) {
  const projection = await getProjectedOfflineLesson(crmClassId);
  if (!projection) {
    throw new BadRequestError("Урок ещё не загружен. Обновите расписание и попробуйте снова.", "LESSON_NOT_PROJECTED");
  }
  const lesson = {
    ...(projection.lessonPayload as JsonRecord),
    ...patch,
  };
  return saveOfflineLessonProjection(crmClassId, lesson);
}

export async function fetchOfflineLessonWithProjection(crmClassId: string) {
  try {
    const lesson = await fetchClassCard(crmClassId) as JsonRecord;
    await saveOfflineLessonProjection(crmClassId, lesson);
    return { lesson, source: "crm" as const };
  } catch (error) {
    if (!isCrmTransportError(error)) throw error;
    const projection = await getProjectedOfflineLesson(crmClassId);
    if (!projection) {
      throw new BadRequestError(
        "Не удалось загрузить урок. Попробуйте снова, когда связь восстановится.",
        "LESSON_NOT_PROJECTED",
      );
    }
    await prisma.offlineLessonProjection.update({
      where: { crmClassId },
      data: { lastSyncError: error instanceof Error ? error.message : "CRM недоступна" },
    });
    return {
      lesson: projection.lessonPayload as JsonRecord,
      source: "projection" as const,
    };
  }
}

export async function fetchOfflineRosterWithProjection(
  crmClassId: string,
  lesson?: JsonRecord,
) {
  try {
    const roster = await fetchClassStudents(crmClassId) as JsonRecord;
    await recordAttendanceConflicts(crmClassId, roster);
    const lessonPayload = lesson
      ?? (await fetchOfflineLessonWithProjection(crmClassId)).lesson;
    await saveOfflineLessonProjection(crmClassId, lessonPayload, roster);
    return { roster, source: "crm" as const };
  } catch (error) {
    if (!isCrmTransportError(error)) throw error;
    const projection = await getProjectedOfflineLesson(crmClassId);
    if (!projection?.rosterPayload) {
      throw new BadRequestError(
        "Не удалось загрузить список учеников. Попробуйте снова, когда связь восстановится.",
        "LESSON_ROSTER_NOT_PROJECTED",
      );
    }
    await prisma.offlineLessonProjection.update({
      where: { crmClassId },
      data: { lastSyncError: error instanceof Error ? error.message : "CRM недоступна" },
    });
    return {
      roster: projection.rosterPayload as JsonRecord,
      source: "projection" as const,
    };
  }
}

export async function getOfflineLessonSyncSummary(crmClassId: string, source?: "crm" | "projection") {
  const [projection, report, events, conflicts] = await Promise.all([
    prisma.offlineLessonProjection.findUnique({ where: { crmClassId } }),
    prisma.offlineLessonReport.findUnique({
      where: { crmClassId },
      select: {
        status: true,
        currentVersion: true,
        confirmedVersion: true,
        crmConfirmedAt: true,
        versions: {
          select: { id: true, version: true },
        },
      },
    }),
    prisma.crmOutboxEvent.findMany({
      where: {
        aggregateType: "offline_lesson",
        aggregateId: crmClassId,
      },
      orderBy: { createdAt: "desc" },
      select: {
        eventType: true,
        payload: true,
        status: true,
        attempts: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.crmSyncConflict.findMany({
      where: { crmClassId, status: "open" },
      select: {
        outboxEvent: {
          select: { eventType: true, payload: true },
        },
      },
    }),
  ]);

  const currentReportVersionId = report?.versions.find((version) => (
    version.version === report.currentVersion
  ))?.id ?? null;
  const { pendingCount, conflictCount, lastEvent } = summarizeOfflineLessonSyncChain({
    events,
    conflicts,
    currentReportVersionId,
    reportStatus: report?.status ?? null,
  });

  const state = conflictCount > 0
    ? "conflict"
    : pendingCount > 0 || source === "projection"
      ? "pending_sync"
      : "synced";

  return {
    state,
    source: source ?? "crm",
    pendingCount,
    conflictCount,
    attempts: lastEvent?.attempts ?? 0,
    lastError: lastEvent?.lastError ?? projection?.lastSyncError ?? null,
    lastSyncedAt: projection?.lastSyncedAt?.toISOString() ?? null,
    report: report ? {
      status: report.status,
      currentVersion: report.currentVersion,
      confirmedVersion: report.confirmedVersion,
      crmConfirmedAt: report.crmConfirmedAt?.toISOString() ?? null,
    } : null,
  };
}

export async function withOfflineLessonSync<T extends JsonRecord>(
  crmClassId: string,
  value: T,
  source?: "crm" | "projection",
) {
  return {
    ...value,
    integration: await getOfflineLessonSyncSummary(crmClassId, source),
  };
}
