import { prisma } from "../../infrastructure/database/prisma.js";

export async function upsertPushSubscription(params: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}) {
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint: params.endpoint },
    select: { userId: true },
  });
  const subscription = await prisma.pushSubscription.upsert({
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
  return {
    subscription,
    created: !existing || existing.userId !== params.userId,
  };
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
