import webpush from "web-push";
import {
  deletePushSubscriptionById,
  listPushSubscriptionsForUser,
} from "../repositories/push-subscription.repository.js";
import { pushConfig } from "../../config/push.js";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

function configureWebPush() {
  if (!pushConfig.enabled) return false;
  webpush.setVapidDetails(pushConfig.subject, pushConfig.publicKey, pushConfig.privateKey);
  return true;
}

export function getVapidPublicKey() {
  return pushConfig.enabled ? pushConfig.publicKey : null;
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!configureWebPush()) return { sent: 0, failed: 0, skipped: true };

  const subscriptions = await listPushSubscriptionsForUser(userId);
  if (!subscriptions.length) return { sent: 0, failed: 0, skipped: false };

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/dashboard",
    tag: payload.tag ?? "maestro",
  });

  let sent = 0;
  let failed = 0;

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        message,
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      const status = typeof error === "object" && error && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 0;
      if (status === 404 || status === 410) {
        await deletePushSubscriptionById(subscription.id).catch(() => undefined);
      }
    }
  }));

  return { sent, failed, skipped: false };
}

export async function notifyOnlineLessonScheduled(params: {
  studentId: string;
  requestId: string;
  directionTitle: string;
  scheduledAt: Date;
}) {
  const when = new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(params.scheduledAt);

  return sendPushToUser(params.studentId, {
    title: "Онлайн-урок назначен",
    body: `${params.directionTitle} — ${when}`,
    url: `/online-lessons/${params.requestId}`,
    tag: `online-lesson-${params.requestId}`,
  });
}

export async function notifyHomeworkReviewed(params: {
  studentId: string;
  lessonId: string;
  lessonTitle: string;
  action: "approve" | "reject";
}) {
  const isApproved = params.action === "approve";
  return sendPushToUser(params.studentId, {
    title: isApproved ? "Домашнее задание принято" : "Нужна доработка ДЗ",
    body: isApproved
      ? `Урок «${params.lessonTitle}» — задание проверено, можно продолжать.`
      : `Урок «${params.lessonTitle}» — преподаватель оставил комментарий.`,
    url: `/lessons/${params.lessonId}`,
    tag: `homework-${params.lessonId}`,
  });
}
