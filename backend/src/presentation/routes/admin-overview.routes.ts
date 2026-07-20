import type { FastifyInstance } from "fastify";
import { fetchManagementDayOverview } from "../../infrastructure/crm/crm-client.js";
import { authenticate, requireContentAdmin } from "../guards/auth.guards.js";

export async function adminOverviewRoutes(app: FastifyInstance) {
  app.get(
    "/admin/day-overview",
    { preHandler: [authenticate, requireContentAdmin] },
    async () => ({ data: await fetchManagementDayOverview() }),
  );
}
