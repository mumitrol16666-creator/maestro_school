import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getParentChildOfflineSummary,
  getParentChildMonthlyPlans,
  listParentChildren,
} from "../../application/services/family.service.js";
import {
  getParentVisibilityWorkspace,
  submitParentVisibilityRequest,
} from "../../application/services/parent-visibility.service.js";
import { listPublishedNews } from "../../application/repositories/news.repository.js";
import { addChildByParent, sendAddedChildLead } from "../../application/services/app-registration.service.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { aqtobeMonthKey } from "../../lib/aqtobe-month.js";
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

/** «Добавить ребёнка»: the same fields and limits as the child in the registration form. */
const addChildSchema = z.object({
  firstName: z.string().trim().min(1, "Укажите имя ребёнка").max(128),
  lastName: z.string().trim().min(1, "Укажите фамилию ребёнка").max(128),
  phone: z.string({ required_error: "Укажите телефон ребёнка" }).trim().min(10, "Укажите телефон ребёнка").max(32),
  password: z.string({ required_error: "Укажите пароль ребёнка" }).min(8, "Пароль — не короче 8 символов").max(72),
});

export async function familyRoutes(app: FastifyInstance) {
  const guards = [authenticate, requireParent, requirePermission("family.read")];
  // Each add hashes a password and writes two rows: 5 a minute per parent, like the registration forms.
  const addChildRateLimit = typeof app.rateLimit === "function"
    ? [app.rateLimit({ max: 5, timeWindow: "1 minute", keyGenerator: (request) => `add-child:${request.user?.id ?? request.ip}` })]
    : [];

  app.get("/parents/me/children", { preHandler: guards }, async (request) => ({
    data: await listParentChildren(request.user!.id),
  }));

  // Stage 4: a parent adds another child themselves; the child is external until the school links them.
  app.post("/parents/me/children", { preHandler: [...guards, ...addChildRateLimit] }, async (request, reply) => {
    const body = addChildSchema.parse(request.body);
    const child = await addChildByParent(request.user!.id, body);
    const parent = await prisma.user.findUnique({
      where: { id: request.user!.id },
      select: { firstName: true, lastName: true, phone: true },
    });
    if (parent) void sendAddedChildLead(parent, child);
    const added = (await listParentChildren(request.user!.id)).find((item) => item.id === child.id);
    return reply.status(201).send({ data: added ?? null });
  });

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

  app.get(
    "/parents/me/children/:studentId/monthly-plans",
    { preHandler: guards },
    async (request) => {
      const { studentId } = z.object({
        studentId: z.string().uuid(),
      }).parse(request.params);
      const { month } = z.object({
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
      }).parse(request.query ?? {});
      return {
        data: await getParentChildMonthlyPlans(
          request.user!.id,
          studentId,
          month ?? aqtobeMonthKey(),
        ),
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
