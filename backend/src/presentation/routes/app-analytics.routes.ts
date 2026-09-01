import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAppAnalytics } from "../../application/services/app-analytics.service.js";
import { authenticate, requireContentAdmin } from "../guards/auth.guards.js";

export async function appAnalyticsRoutes(app: FastifyInstance) {
  app.get(
    "/admin/app-statistics",
    { preHandler: [authenticate, requireContentAdmin] },
    async (request) => {
      const query = z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        search: z.string().trim().max(120).optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(10).max(50).default(30),
      }).parse(request.query);
      return { data: await getAppAnalytics(query) };
    },
  );
}
