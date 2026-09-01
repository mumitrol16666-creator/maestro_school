import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { recordAppUsageEvent } from "../../application/services/app-usage.service.js";
import { authenticate, requireStudent } from "../guards/auth.guards.js";

export async function appUsageRoutes(app: FastifyInstance) {
  app.post("/usage/events", { preHandler: [authenticate, requireStudent] }, async (request, reply) => {
    const body = z.object({
      eventKey: z.string().trim().min(8).max(191),
      eventType: z.enum(["session_started", "page_view"]),
      path: z.string().trim().startsWith("/").max(500).optional().nullable(),
      sessionId: z.string().trim().min(8).max(80).optional().nullable(),
    }).parse(request.body ?? {});
    const event = await recordAppUsageEvent({
      eventKey: body.eventKey,
      userId: request.user!.id,
      eventType: body.eventType,
      path: body.path,
      sessionId: body.sessionId,
    });
    return reply.status(201).send({ data: event });
  });
}
