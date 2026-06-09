import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listHomeworkAttemptsBySubmission } from "../../application/repositories/homework.repository.js";
import {
  getAdminHomeworkSubmission,
  listAdminHomeworkSubmissions,
} from "../../application/repositories/homework-review.repository.js";
import { NotFoundError } from "../../domain/errors.js";
import {
  authenticate,
  requireContentAdmin,
  requirePermission,
} from "../guards/auth.guards.js";

const adminGuards = () => [
  authenticate,
  requireContentAdmin,
  requirePermission("homework.review"),
];

const listQuerySchema = z.object({
  status: z.enum(["submitted", "reviewed", "completed", "rejected"]).optional(),
  courseId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function homeworkReviewRoutes(app: FastifyInstance) {
  app.get(
    "/admin/homework-submissions",
    { preHandler: adminGuards() },
    async (request) => {
      const query = listQuerySchema.parse(request.query);
      const result = await listAdminHomeworkSubmissions(query);

      return {
        data: result.items,
        meta: {
          page: query.page,
          limit: query.limit,
          total: result.total,
          pages: Math.ceil(result.total / query.limit),
        },
      };
    },
  );

  app.get(
    "/admin/homework-submissions/:submissionId",
    { preHandler: adminGuards() },
    async (request) => {
      const { submissionId } = z
        .object({ submissionId: z.string().uuid() })
        .parse(request.params);

      const item = await getAdminHomeworkSubmission(submissionId);
      if (!item) throw new NotFoundError("Homework submission");

      return { data: item };
    },
  );

  app.get(
    "/admin/homework-submissions/:submissionId/attempts",
    { preHandler: adminGuards() },
    async (request) => {
      const { submissionId } = z
        .object({ submissionId: z.string().uuid() })
        .parse(request.params);

      const result = await listHomeworkAttemptsBySubmission(submissionId);
      if (!result) throw new NotFoundError("Homework submission");

      return { data: result };
    },
  );
}
