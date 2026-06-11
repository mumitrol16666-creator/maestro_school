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
    if (!publicKey) throw new BadRequestError("Push notifications are not configured on the server");

    const body = subscriptionSchema.parse(request.body);
    const subscription = await upsertPushSubscription({
      userId: request.user!.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: request.headers["user-agent"],
    });

    return { data: { id: subscription.id, subscribed: true } };
  });

  app.delete("/push/subscribe", { preHandler: [authenticate] }, async (request) => {
    const body = z.object({ endpoint: z.string().url().max(2048) }).parse(request.body);
    await deletePushSubscription(request.user!.id, body.endpoint);
    return { data: { subscribed: false } };
  });

  app.post("/push/test", { preHandler: [authenticate] }, async (request) => {
    const result = await sendPushToUser(request.user!.id, {
      title: "Maestro",
      body: "Уведомления работают — вы будете получать новости о проверке ДЗ.",
      url: "/settings",
      tag: "maestro-test",
    });
    return { data: result };
  });
}
