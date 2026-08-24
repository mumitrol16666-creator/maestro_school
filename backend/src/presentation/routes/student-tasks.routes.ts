import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getStudentTasks } from "../../application/services/student-tasks.service.js";
import { authenticate, requirePermission, requireStudent } from "../guards/auth.guards.js";

const querySchema = z.object({
  scope: z.enum(["active", "completed", "all"]).default("active"),
  source: z.enum(["course", "offline", "online"]).optional(),
  status: z.enum(["todo", "waiting_review", "needs_revision", "completed"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function studentTasksRoutes(app: FastifyInstance) {
  app.get(
    "/students/me/tasks",
    { preHandler: [authenticate, requireStudent, requirePermission("progress.read")] },
    async (request) => {
      const query = querySchema.parse(request.query ?? {});
      return getStudentTasks(request.user!.id, query);
    },
  );
}
