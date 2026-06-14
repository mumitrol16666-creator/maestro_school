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

export async function getTeacherOfflineAgenda(
  appUserId: string,
  params?: { from?: string; to?: string },
) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  const fallback = defaultAgendaRange();
  return fetchTeacherOfflineClasses(crmTeacherId, {
    from: params?.from ?? fallback.from,
    to: params?.to ?? fallback.to,
  });
}

export async function getTeacherOfflineClass(appUserId: string, crmClassId: string) {
  await requireCrmTeacherId(appUserId);
  return fetchClassCard(crmClassId);
}

export async function getTeacherOfflineClassStudents(appUserId: string, crmClassId: string) {
  await requireCrmTeacherId(appUserId);
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
  attended: boolean,
) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  return postTeacherAttendance(crmClassId, { crmTeacherId, studentId, attended });
}
