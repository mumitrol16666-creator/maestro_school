import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  countPendingLessonQuestions,
  listAdminLessonQuestions,
  markLessonQuestionAnswered,
  submitLessonQuestion,
} from "../../application/services/lesson-question.service.js";
import { signupFromLesson } from "../../application/services/lesson-signup.service.js";
import {
  authenticate,
  requireContentAdmin,
  requirePermission,
  requireStudent,
} from "../guards/auth.guards.js";

const adminGuards = () => [
  authenticate,
  requireContentAdmin,
  requirePermission("catalog.manage"),
];

const listQuerySchema = z.object({
  status: z.enum(["pending", "answered"]).optional(),
  lessonId: z.string().uuid().optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function lessonQuestionsRoutes(app: FastifyInstance) {
  app.post(
    "/lessons/:lessonId/questions",
    { preHandler: [authenticate, requireStudent, requirePermission("lessons.read")] },
    async (request, reply) => {
      const { lessonId } = z.object({ lessonId: z.string().uuid() }).parse(request.params);
      const body = z.object({ message: z.string().trim().min(1).max(4000) }).parse(request.body);
      const item = await submitLessonQuestion({
        lessonId,
        studentId: request.user!.id,
        message: body.message,
      });
      return reply.status(201).send({ data: item });
    },
  );

  app.post(
    "/lessons/:lessonId/signup",
    { preHandler: [authenticate, requireStudent, requirePermission("courses.read")] },
    async (request) => {
      const { lessonId } = z.object({ lessonId: z.string().uuid() }).parse(request.params);
      const result = await signupFromLesson({ lessonId, studentId: request.user!.id });
      return { data: result };
    },
  );

  app.get(
    "/admin/lesson-questions",
    { preHandler: adminGuards() },
    async (request) => {
      const query = listQuerySchema.parse(request.query);
      const result = await listAdminLessonQuestions(query);
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
    "/admin/lesson-questions/pending-count",
    { preHandler: adminGuards() },
    async () => ({ data: { count: await countPendingLessonQuestions() } }),
  );

  app.patch(
    "/admin/lesson-questions/:id",
    { preHandler: adminGuards() },
    async (request) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = z.object({ status: z.literal("answered") }).parse(request.body);
      const item = await markLessonQuestionAnswered(id);
      return { data: { ...item, status: body.status } };
    },
  );
}
