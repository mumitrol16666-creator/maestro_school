import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getParentChildOfflineSummary,
  listParentChildren,
} from "../../application/services/family.service.js";
import {
  authenticate,
  requireParent,
  requirePermission,
} from "../guards/auth.guards.js";

export async function familyRoutes(app: FastifyInstance) {
  const guards = [authenticate, requireParent, requirePermission("family.read")];

  app.get("/parents/me/children", { preHandler: guards }, async (request) => ({
    data: await listParentChildren(request.user!.id),
  }));

  app.get(
    "/parents/me/children/:studentId/offline-summary",
    { preHandler: guards },
    async (request) => {
      const { studentId } = z.object({
        studentId: z.string().uuid(),
      }).parse(request.params);
      return {
        data: await getParentChildOfflineSummary(request.user!.id, studentId),
      };
    },
  );
}
