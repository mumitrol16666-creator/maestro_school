import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireStudent } from "../guards/auth.guards.js";
import { checkInPractice, getPracticeStatus, savePracticeReminder } from "../../application/services/practice-reminder.service.js";

/** Plan 5.6: practice reminders and «позанимался». */
export async function practiceRoutes(app: FastifyInstance) {
  const guards = [authenticate, requireStudent];

  app.get("/students/me/practice", { preHandler: guards }, async (request) => ({
    data: await getPracticeStatus(request.user!.id),
  }));

  app.put("/students/me/practice/reminder", { preHandler: guards }, async (request) => {
    const body = z.object({
      enabled: z.boolean().optional(),
      time: z.string().max(5).optional(),
      days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    }).parse(request.body ?? {});
    return { data: await savePracticeReminder(request.user!.id, body) };
  });

  app.post("/students/me/practice/checkin", { preHandler: guards }, async (request) => {
    const body = z.object({ source: z.string().max(32).optional() }).parse(request.body ?? {});
    return { data: await checkInPractice(request.user!.id, body.source ?? "home") };
  });
}
