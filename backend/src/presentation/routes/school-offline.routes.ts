import type { FastifyInstance } from "fastify";
import { getStudentSchoolOfflineSummary } from "../../application/services/school-offline.service.js";
import { authenticate, requirePermission, requireStudent } from "../guards/auth.guards.js";

export async function schoolOfflineRoutes(app: FastifyInstance) {
  app.get(
    "/students/me/offline-summary",
    { preHandler: [authenticate, requireStudent, requirePermission("progress.read")] },
    async (request) => ({
      data: await getStudentSchoolOfflineSummary(request.user!.id),
    }),
  );
}
