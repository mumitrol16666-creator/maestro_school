import { BadRequestError } from "../../domain/errors.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import {
  completeTeacherStaffTask,
  fetchTeacherStaffTasks,
} from "../../infrastructure/crm/crm-client.js";

async function requireCrmTeacherId(appUserId: string) {
  const user = await prisma.user.findFirst({
    where: { id: appUserId, isActive: true, deletedAt: null },
    select: { crmTeacherId: true },
  });
  if (!user?.crmTeacherId) {
    throw new BadRequestError(
      "Профиль преподавателя не подключён. Обратитесь к администратору Maestro.",
      "CRM_NOT_LINKED",
    );
  }
  return user.crmTeacherId;
}

export async function listTeacherStaffTasks(appUserId: string) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  return fetchTeacherStaffTasks(crmTeacherId);
}

export async function completeTeacherStaffTaskFromApp(appUserId: string, crmTaskId: string) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  const result = await completeTeacherStaffTask(crmTeacherId, crmTaskId);

  await prisma.userNotification.updateMany({
    where: {
      userId: appUserId,
      type: "staff_task_assigned",
      url: `/admin?task=${encodeURIComponent(crmTaskId)}`,
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return result;
}
