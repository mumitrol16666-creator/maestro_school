import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { AppError, BadRequestError } from "../../domain/errors.js";
import {
  fetchClassCard,
  fetchClassStudents,
} from "../../infrastructure/crm/crm-client.js";

type JsonRecord = Record<string, unknown>;

function asJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function isCrmTransportError(error: unknown) {
  return error instanceof AppError
    && (error.code === "CRM_UNAVAILABLE" || error.code === "CRM_TIMEOUT" || error.statusCode >= 500);
}

function lessonTeacherId(lesson: JsonRecord) {
  const teacher = lesson.teacher as { crmTeacherId?: unknown } | null | undefined;
  return typeof teacher?.crmTeacherId === "string" ? teacher.crmTeacherId : null;
}

function lessonStatus(lesson: JsonRecord) {
  return typeof lesson.status === "string" ? lesson.status : "scheduled";
}

function lessonCrmUpdatedAt(lesson: JsonRecord) {
  const value = lesson.updatedAt;
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function stableRosterVersion(roster: unknown) {
  const students = Array.isArray((roster as { students?: unknown })?.students)
    ? (roster as { students: Array<Record<string, unknown>> }).students
    : [];
  const stable = students
    .map((student) => ({
      id: String(student.crmStudentId ?? student.id ?? ""),
      groupStatus: String(student.groupStatus ?? ""),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
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
) {
  const rosterVersion = roster ? stableRosterVersion(roster) : undefined;
  const incomingUpdatedAt = lessonCrmUpdatedAt(lesson);
  const existing = await prisma.offlineLessonProjection.findUnique({ where: { crmClassId } });
  if (
    existing?.crmUpdatedAt
    && incomingUpdatedAt
    && incomingUpdatedAt < existing.crmUpdatedAt
  ) {
    await prisma.crmSyncConflict.create({
      data: {
        crmClassId,
        kind: "stale_projection_ignored",
        status: "resolved",
        localPayload: existing.lessonPayload as Prisma.InputJsonValue,
        crmPayload: asJson(lesson),
        errorMessage: "Получена устаревшая версия урока; сохранённые данные не изменены.",
        resolution: "stale_event_ignored",
        resolutionNote: `CRM updatedAt ${incomingUpdatedAt.toISOString()} older than ${existing.crmUpdatedAt.toISOString()}`,
        resolvedAt: new Date(),
      },
    });
    return existing;
  }
  return prisma.offlineLessonProjection.upsert({
    where: { crmClassId },
    create: {
      crmClassId,
      crmTeacherId: lessonTeacherId(lesson),
      status: lessonStatus(lesson),
      lessonPayload: asJson(lesson),
      rosterPayload: roster ? asJson(roster) : undefined,
      rosterVersion,
      crmUpdatedAt: incomingUpdatedAt,
      lastSyncedAt: new Date(),
      lastSyncError: null,
    },
    update: {
      crmTeacherId: lessonTeacherId(lesson),
      status: lessonStatus(lesson),
      lessonPayload: asJson(lesson),
      ...(roster ? {
        rosterPayload: asJson(roster),
        rosterVersion,
      } : {}),
      crmUpdatedAt: incomingUpdatedAt,
      lastSyncedAt: new Date(),
      lastSyncError: null,
    },
  });
}

export async function projectOfflineAgenda(classes: JsonRecord[]) {
  await Promise.all(classes.map((lesson) => {
    const crmClassId = typeof lesson.crmClassId === "string" ? lesson.crmClassId : "";
    return crmClassId ? saveOfflineLessonProjection(crmClassId, lesson) : Promise.resolve(null);
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
  const [projection, report, pendingCount, conflictCount, lastEvent] = await Promise.all([
    prisma.offlineLessonProjection.findUnique({ where: { crmClassId } }),
    prisma.offlineLessonReport.findUnique({
      where: { crmClassId },
      select: {
        status: true,
        currentVersion: true,
        confirmedVersion: true,
        crmConfirmedAt: true,
      },
    }),
    prisma.crmOutboxEvent.count({
      where: {
        aggregateType: "offline_lesson",
        aggregateId: crmClassId,
        status: { in: ["pending", "processing", "failed"] },
      },
    }),
    prisma.crmSyncConflict.count({ where: { crmClassId, status: "open" } }),
    prisma.crmOutboxEvent.findFirst({
      where: { aggregateType: "offline_lesson", aggregateId: crmClassId },
      orderBy: { createdAt: "desc" },
      select: { attempts: true, lastError: true, status: true, updatedAt: true },
    }),
  ]);

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
      ...report,
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
