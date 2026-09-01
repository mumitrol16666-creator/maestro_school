import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getAdminHomeworkStatistics,
  getStudentHomeworkStatistics,
  getTeacherHomeworkStatistics,
} from "../../application/services/homework-statistics.service.js";
import { learningHomeworkV2Enabled } from "../../application/services/learning-homework-v2.service.js";
import {
  authenticate,
  requireContentAdmin,
  requirePermission,
  requireStudent,
  requireTeacher,
} from "../guards/auth.guards.js";

const baseQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  directionId: z.string().uuid().optional(),
});

export async function homeworkStatisticsRoutes(app: FastifyInstance) {
  if (!learningHomeworkV2Enabled()) return;

  app.get(
    "/students/me/homework-statistics",
    { preHandler: [authenticate, requireStudent, requirePermission("progress.read")] },
    async (request) => ({
      data: await getStudentHomeworkStatistics(
        request.user!.id,
        baseQuerySchema.parse(request.query),
      ),
    }),
  );

  app.get(
    "/teachers/me/homework-statistics",
    { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.read")] },
    async (request) => ({
      data: await getTeacherHomeworkStatistics(
        request.user!.id,
        baseQuerySchema.parse(request.query),
      ),
    }),
  );

  app.get(
    "/admin/homework-statistics",
    { preHandler: [authenticate, requireContentAdmin] },
    async (request) => {
      const query = baseQuerySchema.extend({
        search: z.string().trim().max(120).optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(10).max(100).default(30),
      }).parse(request.query);
      return { data: await getAdminHomeworkStatistics(query) };
    },
  );
}
