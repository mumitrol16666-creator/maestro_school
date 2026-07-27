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
    "offline_lesson_report_due",
    "lesson_teacher_reminder",
    "lesson_student_reminder",
    "direct_message_received",
    "homework_submitted",
    "homework_reviewed",
    "lesson_question_received",
    "lesson_question_answered",
    "achievement_earned",
    "points_awarded",
    "coins_awarded",
    "reward_requested",
    "reward_status_updated",
    "staff_task_assigned",
    "parent_lesson_reminder",
    "parent_lesson_report_ready",
    "parent_schedule_changed",
    "parent_lesson_cancelled",
    "parent_absence_alert",
    "parent_homework_reviewed",
    "parent_balance_alert",
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
