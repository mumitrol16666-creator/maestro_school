import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";

type JsonRecord = Record<string, unknown>;

function asJson(value: unknown) {
  return value as Prisma.InputJsonValue;
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

/**
 * Persists the CRM snapshot without starting any follow-up synchronization.
 * Outbox delivery uses this primitive to avoid recursively re-processing an
 * approval while its response is being saved.
 */
export async function saveOfflineLessonProjectionSnapshot(
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
