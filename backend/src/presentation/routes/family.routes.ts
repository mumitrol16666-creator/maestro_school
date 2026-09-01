import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getParentChildOfflineSummary,
  listParentChildren,
} from "../../application/services/family.service.js";
import {
  getParentVisibilityWorkspace,
  submitParentVisibilityRequest,
} from "../../application/services/parent-visibility.service.js";
import { listPublishedNews } from "../../application/repositories/news.repository.js";
import {
  authenticate,
  requireParent,
  requirePermission,
  requireStudent,
} from "../guards/auth.guards.js";

const visibilitySchema = z.object({
  showSchedule: z.boolean(),
  showBalance: z.boolean(),
  showPlanProgress: z.boolean(),
  showAchievements: z.boolean(),
});

function newsView(post: Awaited<ReturnType<typeof listPublishedNews>>[number]) {
  return {
    id: post.id,
    title: post.title,
    content: post.content,
    excerpt: post.content.length > 160 ? `${post.content.slice(0, 157)}...` : post.content,
    publishedAt: post.publishedAt,
    author: {
      id: post.author.id,
      name: `${post.author.firstName} ${post.author.lastName}`,
    },
  };
}

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

  app.get("/parents/me/news", { preHandler: guards }, async (request) => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(20).default(5) }).parse(request.query);
    return { data: (await listPublishedNews(query.limit, "parent")).map(newsView) };
  });

  app.get(
    "/students/me/parent-visibility",
    { preHandler: [authenticate, requireStudent, requirePermission("progress.read")] },
    async (request) => ({ data: await getParentVisibilityWorkspace(request.user!.id) }),
  );

  app.post(
    "/students/me/parent-visibility-requests",
    { preHandler: [authenticate, requireStudent, requirePermission("progress.read")] },
    async (request, reply) => {
      const body = z.object({
        requested: visibilitySchema,
        note: z.string().trim().max(1000).optional().nullable(),
      }).parse(request.body);
      const item = await submitParentVisibilityRequest({
        studentId: request.user!.id,
        requested: body.requested,
        note: body.note,
      });
      return reply.status(201).send({ data: item });
    },
  );
}
