import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  countUnreadNotifications,
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../application/services/notification.service.js";
import { authenticate } from "../guards/auth.guards.js";

export async function notificationsRoutes(app: FastifyInstance) {
  app.get("/students/me/notifications/unread-count", { preHandler: [authenticate] }, async (request) => ({
    data: { count: await countUnreadNotifications(request.user!.id) },
  }));

  app.get("/students/me/notifications", { preHandler: [authenticate] }, async (request) => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(request.query);
    return { data: await listUserNotifications(request.user!.id, query.limit) };
  });

  app.patch("/students/me/notifications/:id/read", { preHandler: [authenticate] }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await markNotificationRead(request.user!.id, id) };
  });

  app.post("/students/me/notifications/read-all", { preHandler: [authenticate] }, async (request) => {
    await markAllNotificationsRead(request.user!.id);
    return { data: { ok: true } };
  });
}
