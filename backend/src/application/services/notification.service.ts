import type { UserNotificationType } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { NotFoundError } from "../../domain/errors.js";

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
