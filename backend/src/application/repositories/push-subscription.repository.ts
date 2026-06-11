import { prisma } from "../../infrastructure/database/prisma.js";

export async function upsertPushSubscription(params: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}) {
  return prisma.pushSubscription.upsert({
    where: { endpoint: params.endpoint },
    create: {
      userId: params.userId,
      endpoint: params.endpoint,
      p256dh: params.p256dh,
      auth: params.auth,
      userAgent: params.userAgent ?? null,
    },
    update: {
      userId: params.userId,
      p256dh: params.p256dh,
      auth: params.auth,
      userAgent: params.userAgent ?? null,
    },
  });
}

export async function deletePushSubscription(userId: string, endpoint: string) {
  const result = await prisma.pushSubscription.deleteMany({
    where: { userId, endpoint },
  });
  return result.count > 0;
}

export async function listPushSubscriptionsForUser(userId: string) {
  return prisma.pushSubscription.findMany({ where: { userId } });
}

export async function deletePushSubscriptionById(id: string) {
  await prisma.pushSubscription.delete({ where: { id } });
}
