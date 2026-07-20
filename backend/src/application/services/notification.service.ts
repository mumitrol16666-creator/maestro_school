import type { UserNotificationType } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { NotFoundError } from "../../domain/errors.js";
import { findUserByCrmTeacherId } from "../repositories/user-link.repository.js";
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

export async function countUnreadNotifications(userId: string) {
  return prisma.userNotification.count({
    where: { userId, readAt: null },
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

export async function markAllNotificationsRead(userId: string) {
  await prisma.userNotification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function notifyOfflineLessonApproved(params: {
  crmClassId: string;
  crmTeacherId: string;
  lessonTitle?: string | null;
  date?: string | null;
  startTime?: string | null;
}) {
  const teacher = await findUserByCrmTeacherId(params.crmTeacherId);
  if (!teacher) {
    return { delivered: false, reason: "teacher_not_linked" as const };
  }

  const url = `/admin/offline-lessons/${encodeURIComponent(params.crmClassId)}`;
  const duplicate = await prisma.userNotification.findFirst({
    where: {
      userId: teacher.id,
      type: "offline_lesson_approved",
      url,
      createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (duplicate) {
    return { delivered: true, duplicate: true, notificationId: duplicate.id };
  }

  const lessonTitle = params.lessonTitle?.trim() || "Урок";
  const when = [params.date, params.startTime].filter(Boolean).join(" · ");
  const body = when
    ? `${lessonTitle} (${when}). Отчёт принят, урок учтён в вашей работе.`
    : `${lessonTitle}. Отчёт принят, урок учтён в вашей работе.`;
  const notification = await createUserNotification({
    userId: teacher.id,
    type: "offline_lesson_approved",
    title: "Отчёт по уроку принят",
    body,
    url,
  });

  await sendPushToUser(teacher.id, {
    title: "Отчёт по уроку принят",
    body: when ? `${lessonTitle} · ${when}` : lessonTitle,
    url,
    tag: `offline-lesson-approved-${params.crmClassId}`,
  }).catch(() => undefined);

  return { delivered: true, duplicate: false, notificationId: notification.id };
}
