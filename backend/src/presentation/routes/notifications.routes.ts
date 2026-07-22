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
  const typeSchema = z.enum([
    "online_lesson_assigned",
    "online_lesson_scheduled",
    "online_lesson_rescheduled",
    "online_lesson_cancelled",
    "online_lesson_no_show",
    "online_lesson_completed",
    "online_assignment_submitted",
    "online_assignment_reviewed",
    "offline_lesson_approved",
    "offline_lesson_report_ready",
    "offline_lesson_returned",
    "offline_lesson_cancelled",
    "offline_lesson_rescheduled",
    "direct_message_received",
    "homework_submitted",
    "homework_reviewed",
    "lesson_question_received",
    "lesson_question_answered",
    "achievement_earned",
    "points_awarded",
    "coins_awarded",
    "staff_task_assigned",
  ]);

  app.get("/students/me/notifications/unread-count", { preHandler: [authenticate] }, async (request) => {
    const query = z.object({
      type: typeSchema.optional(),
    }).parse(request.query);
    return { data: { count: await countUnreadNotifications(request.user!.id, query.type) } };
  });

  app.get("/students/me/notifications", { preHandler: [authenticate] }, async (request) => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(request.query);
    return { data: await listUserNotifications(request.user!.id, query.limit) };
  });

  app.patch("/students/me/notifications/:id/read", { preHandler: [authenticate] }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await markNotificationRead(request.user!.id, id) };
  });

  app.post("/students/me/notifications/read-all", { preHandler: [authenticate] }, async (request) => {
    const query = z.object({ type: typeSchema.optional() }).parse(request.query);
    await markAllNotificationsRead(request.user!.id, query.type);
    return { data: { ok: true } };
  });
}
