import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { submitImprovementSuggestion } from "../../application/services/improvement-suggestion.service.js";
import { authenticate } from "../guards/auth.guards.js";

const suggestionBody = z.object({
  idempotencyKey: z.string().trim().min(8).max(80),
  title: z.string().trim().min(3).max(120),
  details: z.string().trim().min(10).max(3_000),
  currentPath: z.string().trim().max(500).optional().nullable(),
});

export async function improvementSuggestionRoutes(app: FastifyInstance) {
  app.post("/improvement-suggestions", { preHandler: authenticate }, async (request, reply) => {
    const body = suggestionBody.parse(request.body ?? {});
    const suggestion = await submitImprovementSuggestion({
      actorId: request.user!.id,
      actorRole: request.user!.roleSlug,
      idempotencyKey: body.idempotencyKey,
      title: body.title,
      details: body.details,
      currentPath: body.currentPath,
    });

    return reply.status(201).send({ data: suggestion });
  });
}
