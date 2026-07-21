import type { UserNotificationType } from "@prisma/client";
import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import { NotFoundError } from "../../domain/errors.js";
import { findUserByCrmStudentId, findUserByCrmTeacherId } from "../repositories/user-link.repository.js";
import { sendPushToUser } from "./push-notification.service.js";

export async function createUserNotification(params: {
  userId: string;
  type: UserNotificationType;
  title: string;
  body: string;
  url?: string | null;
}) {
  return prisma.userNotification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      url: params.url ?? null,
    },
  });
}

/**
 * Store an in-app notification and best-effort deliver the same event as a
 * browser push. The in-app record is the source of truth, so a missing push
 * subscription never prevents the business operation from completing.
 */
export async function deliverUserNotification(params: {
  userId: string;
  type: UserNotificationType;
  title: string;
  body: string;
  url?: string | null;
  tag?: string;
  dedupeWindowMs?: number;
}) {
  if (params.dedupeWindowMs && params.url) {
    const duplicate = await prisma.userNotification.findFirst({
      where: {
        userId: params.userId,
        type: params.type,
        url: params.url,
        createdAt: { gte: new Date(Date.now() - params.dedupeWindowMs) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (duplicate) {
      return { notification: duplicate, duplicate: true as const };
    }
  }

  const notification = await createUserNotification(params);
  await sendPushToUser(params.userId, {
    title: params.title,
    body: params.body,
    url: params.url ?? undefined,
    tag: params.tag,
  }).catch(() => undefined);

  return { notification, duplicate: false as const };
}

export async function deliverNotificationsToUsers(
  userIds: string[],
  params: Omit<Parameters<typeof deliverUserNotification>[0], "userId">,
) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  return Promise.all(uniqueIds.map((userId) => deliverUserNotification({ userId, ...params })));
}

export async function listUsersWithPermission(permissionCode: string) {
  return prisma.user.findMany({
    where: {
      ...notDeleted,
      isActive: true,
      role: { rolePermissions: { some: { permission: { code: permissionCode } } } },
    },
    select: { id: true },
  });
}

export async function countUnreadNotifications(userId: string, type?: UserNotificationType) {
  return prisma.userNotification.count({
    where: { userId, readAt: null, ...(type ? { type } : {}) },
  });
}

export async function listUserNotifications(userId: string, limit = 20) {
  return prisma.userNotification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      url: true,
      readAt: true,
      createdAt: true,
    },
  });
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const item = await prisma.userNotification.findFirst({
    where: { id: notificationId, userId },
  });
  if (!item) throw new NotFoundError("Notification");
  if (item.readAt) return item;

  return prisma.userNotification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string, type?: UserNotificationType) {
  await prisma.userNotification.updateMany({
    where: { userId, readAt: null, ...(type ? { type } : {}) },
    data: { readAt: new Date() },
  });
}

export type OfflineLessonNotificationEvent =
  | "approved"
  | "returned"
  | "cancelled"
  | "rescheduled";

export async function notifyOfflineLessonEvent(params: {
  crmClassId: string;
  crmTeacherId?: string;
  crmStudentIds?: string[];
  event: OfflineLessonNotificationEvent;
  lessonTitle?: string | null;
  date?: string | null;
  startTime?: string | null;
  message?: string | null;
}) {
  const teacher = params.crmTeacherId
    ? await findUserByCrmTeacherId(params.crmTeacherId)
    : null;
  const url = `/admin/offline-lessons/${encodeURIComponent(params.crmClassId)}`;
  const studentUrl = `/school-lessons?tab=history&lesson=${encodeURIComponent(params.crmClassId)}`;
  const lessonTitle = params.lessonTitle?.trim() || "Урок";
  const when = [params.date, params.startTime].filter(Boolean).join(" · ");
  const context = when ? ` (${when})` : "";
  const teacherCopy = {
    approved: {
      type: "offline_lesson_approved" as const,
      title: "Отчёт по уроку принят",
      body: `${lessonTitle}${context}. Отчёт принят, урок учтён в вашей работе.`,
      tag: "offline-lesson-approved",
    },
    returned: {
      type: "offline_lesson_returned" as const,
      title: "Отчёт по уроку возвращён",
      body: `${lessonTitle}${context}. Администратор вернул отчёт на доработку.${params.message?.trim() ? ` ${params.message.trim()}` : ""}`,
      tag: "offline-lesson-returned",
    },
    cancelled: {
      type: "offline_lesson_cancelled" as const,
      title: "Офлайн-урок отменён",
      body: `${lessonTitle}${context}. Занятие отменено, проверьте расписание.`,
      tag: "offline-lesson-cancelled",
    },
    rescheduled: {
      type: "offline_lesson_rescheduled" as const,
      title: "Офлайн-урок перенесён",
      body: `${lessonTitle}${context}. Проверьте обновлённое расписание.`,
      tag: "offline-lesson-rescheduled",
    },
  }[params.event];
  const teacherResult = teacher
    ? await deliverUserNotification({
        userId: teacher.id,
        type: teacherCopy.type,
        title: teacherCopy.title,
        body: teacherCopy.body,
        url,
        tag: `${teacherCopy.tag}-${params.crmClassId}`,
        dedupeWindowMs: 10 * 60 * 1000,
      })
    : null;

  const studentIds = [...new Set(params.crmStudentIds ?? [])];
  const students = (await Promise.all(studentIds.map((crmStudentId) => findUserByCrmStudentId(crmStudentId))))
    .filter((student): student is NonNullable<typeof student> => Boolean(student));
  const studentCopy = params.event === "approved"
    ? {
        type: "offline_lesson_report_ready" as const,
        title: "Готов итог офлайн-урока",
        body: `${lessonTitle}${context}. Посмотрите итог, материалы и домашнее задание в школе.`,
      }
    : {
        type: teacherCopy.type,
        title: teacherCopy.title,
        body: teacherCopy.body,
      };
  await Promise.all(students.map((student) => deliverUserNotification({
    userId: student.id,
    type: studentCopy.type,
    title: studentCopy.title,
    body: studentCopy.body,
    url: studentUrl,
    tag: `${teacherCopy.tag}-${params.crmClassId}-${student.id}`,
    dedupeWindowMs: 10 * 60 * 1000,
  }).catch(() => undefined)));

  return {
    delivered: Boolean(teacherResult || students.length),
    teacherLinked: Boolean(teacher),
    studentsDelivered: students.length,
    duplicate: teacherResult?.duplicate ?? false,
    notificationId: teacherResult?.notification.id ?? null,
  };
}

export async function notifyOfflineLessonApproved(params: Omit<Parameters<typeof notifyOfflineLessonEvent>[0], "event">) {
  return notifyOfflineLessonEvent({ ...params, event: "approved" });
}
