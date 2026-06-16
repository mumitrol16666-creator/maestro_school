import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError } from "../../domain/errors.js";
import {
  fetchClassCard,
  fetchClassStudents,
  fetchTeacherOfflineClasses,
  postTeacherFinish,
  postTeacherMarkNotHeld,
  postTeacherStart,
  postTeacherSubmit,
  postTeacherAttendance,
  type TeacherSubmitPayload,
} from "../../infrastructure/crm/crm-client.js";

async function requireCrmTeacherId(appUserId: string) {
  const user = await prisma.user.findFirst({
    where: { id: appUserId },
    select: { crmTeacherId: true },
  });

  if (!user?.crmTeacherId) {
    throw new BadRequestError(
      "Аккаунт не связан с преподавателем в CRM. Обратитесь к администратору Maestro.",
      "CRM_NOT_LINKED",
    );
  }

  return user.crmTeacherId;
}

function defaultAgendaRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 14);
  return { from: start.toISOString(), to: end.toISOString() };
}

function dedupeOfflineClasses<T extends {
  crmClassId?: unknown;
  title?: unknown;
  date?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  teacher?: { crmTeacherId?: unknown } | null;
  group?: { crmGroupId?: unknown; name?: unknown } | null;
  crmIndividualStudentId?: unknown;
}>(classes: T[]): T[] {
  const seenIds = new Set<string>();
  const seenSignatures = new Set<string>();
  return classes.filter((item) => {
    const crmClassId = typeof item.crmClassId === "string" ? item.crmClassId : "";
    if (crmClassId) {
      if (seenIds.has(crmClassId)) return false;
      seenIds.add(crmClassId);
    }

    const signature = [
      item.date,
      item.startTime,
      item.endTime,
      item.title,
      item.teacher?.crmTeacherId,
      item.group?.crmGroupId ?? item.group?.name,
      item.crmIndividualStudentId,
    ].map((value) => String(value ?? "").trim()).join("|");

    if (signature.replace(/\|/g, "")) {
      if (seenSignatures.has(signature)) return false;
      seenSignatures.add(signature);
    }

    return true;
  });
}

export async function getTeacherOfflineAgenda(
  appUserId: string,
  params?: { from?: string; to?: string },
) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  const fallback = defaultAgendaRange();
  const agenda = await fetchTeacherOfflineClasses(crmTeacherId, {
    from: params?.from ?? fallback.from,
    to: params?.to ?? fallback.to,
  });
  return {
    ...agenda,
    classes: Array.isArray(agenda.classes) ? dedupeOfflineClasses(agenda.classes) : [],
  };
}

export async function getTeacherOfflineClass(appUserId: string, crmClassId: string) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  const lesson = await fetchClassCard(crmClassId) as {
    teacher?: { crmTeacherId?: string } | null;
  };
  if (lesson.teacher?.crmTeacherId !== crmTeacherId) {
    throw new BadRequestError("Этот урок назначен другому преподавателю", "LESSON_NOT_ASSIGNED");
  }
  return lesson;
}

export async function getTeacherOfflineClassStudents(appUserId: string, crmClassId: string) {
  await getTeacherOfflineClass(appUserId, crmClassId);
  return fetchClassStudents(crmClassId);
}

export async function teacherOfflineStart(appUserId: string, crmClassId: string) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  return postTeacherStart(crmClassId, crmTeacherId);
}

export async function teacherOfflineFinish(
  appUserId: string,
  crmClassId: string,
  comment?: string,
) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  return postTeacherFinish(crmClassId, { crmTeacherId, comment });
}

export async function teacherOfflineSubmit(
  appUserId: string,
  crmClassId: string,
  payload: Omit<TeacherSubmitPayload, "crmTeacherId">,
) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  return postTeacherSubmit(crmClassId, { ...payload, crmTeacherId });
}

export async function teacherOfflineMarkNotHeld(
  appUserId: string,
  crmClassId: string,
  comment?: string,
) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  return postTeacherMarkNotHeld(crmClassId, { crmTeacherId, comment });
}

export async function teacherOfflineSetAttendance(
  appUserId: string,
  crmClassId: string,
  studentId: string,
  attendanceStatus: string,
  teacherNote?: string,
) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  return postTeacherAttendance(crmClassId, {
    crmTeacherId,
    studentId,
    attendanceStatus,
    teacherNote,
    attended: ["present", "late"].includes(attendanceStatus),
  });
}
