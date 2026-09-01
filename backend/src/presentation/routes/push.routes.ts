import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  deletePushSubscription,
  upsertPushSubscription,
} from "../../application/repositories/push-subscription.repository.js";
import {
  getVapidPublicKey,
  sendPushToUser,
} from "../../application/services/push-notification.service.js";
import { BadRequestError } from "../../domain/errors.js";
import { authenticate } from "../guards/auth.guards.js";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(255),
  }),
});

export async function pushRoutes(app: FastifyInstance) {
  app.get("/push/vapid-public-key", async () => {
    const publicKey = getVapidPublicKey();
    return { data: { enabled: Boolean(publicKey), publicKey } };
  });

  app.post("/push/subscribe", { preHandler: [authenticate] }, async (request) => {
    const publicKey = getVapidPublicKey();
    if (!publicKey) throw new BadRequestError("Уведомления пока не настроены");

    const body = subscriptionSchema.parse(request.body);
    const { subscription, created } = await upsertPushSubscription({
      userId: request.user!.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: request.headers["user-agent"],
    });

    if (created && request.user!.roleSlug === "student") {
      await sendPushToUser(request.user!.id, {
        title: "🎸 НИ ФИГА СЕБЕ!",
        body: "Кто это на гитару записался? Уведомления включены — теперь ни один урок не потеряется 🤘",
        url: "/dashboard",
        tag: "maestro-push-welcome",
      }).catch(() => undefined);
    }
    if (created && request.user!.roleSlug === "parent") {
      await sendPushToUser(request.user!.id, {
        title: "Семейные уведомления включены",
        body: "Сообщим об уроках, ДЗ, посещаемости и абонементе привязанных учеников.",
        url: "/family",
        tag: "maestro-parent-push-welcome",
      }).catch(() => undefined);
    }

    return { data: { id: subscription.id, subscribed: true } };
  });

  app.delete("/push/subscribe", { preHandler: [authenticate] }, async (request) => {
    const body = z.object({ endpoint: z.string().url().max(2048) }).parse(request.body);
    await deletePushSubscription(request.user!.id, body.endpoint);
    return { data: { subscribed: false } };
  });

  app.post("/push/test", { preHandler: [authenticate] }, async (request) => {
    const parent = request.user!.roleSlug === "parent";
    const result = await sendPushToUser(request.user!.id, {
      title: parent ? "Семейные уведомления включены" : "Уведомления включены",
      body: parent
        ? "Уведомления работают — важные события по ученику появятся на экране телефона."
        : "Уведомления работают — важные изменения появятся на экране телефона.",
      url: parent ? "/family/settings" : "/settings",
      tag: "maestro-test",
    });
    return { data: result };
  });
}
