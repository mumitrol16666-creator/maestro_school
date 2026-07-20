import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  assignOnlineLessonRequest,
  cancelOnlineLessonRequest,
  completeOnlineLessonRequest,
  countPendingOnlineAssignmentSubmissions,
  countPendingOnlineLessonRequests,
  createOnlineLessonRequest,
  getStaffOnlineLessonRequest,
  listOnlineLessonTeachers,
  getStudentOnlineLessonRequest,
  listAdminOnlineLessonRequests,
  listStudentOnlineLessonRequests,
  markOnlineLessonNoShow,
  reviewOnlineLessonAssignment,
  scheduleOnlineLessonRequest,
  submitOnlineLessonAssignment,
} from "../../application/services/online-lessons.service.js";
import { getStudentCoins } from "../../application/services/coins.service.js";
import { BadRequestError } from "../../domain/errors.js";
import {
  authenticate,
  requirePermission,
  requireStudent,
} from "../guards/auth.guards.js";

const manageGuards = () => [
  authenticate,
  requirePermission("online_lessons.manage"),
];

const materialSchema = z.object({
  type: z.enum(["youtube", "link", "text", "pdf", "image", "file"]),
  title: z.string().trim().min(1).max(255),
  url: z.string().url().max(1024).nullable().optional(),
  content: z.string().max(10000).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const completeBodySchema = z.object({
  coveredTopics: z.string().trim().min(1).max(5000),
  whatWorked: z.string().trim().min(1).max(5000),
  whatToImprove: z.string().trim().min(1).max(5000),
  completionComment: z.string().trim().max(5000).optional(),
  lessonPoints: z.number().int().min(0).max(10000).default(0),
  lessonCoins: z.number().int().min(0).max(10000).default(0),
  lessonCoinsReason: z.string().trim().max(512).optional(),
  createAssignment: z.boolean().default(false),
  assignment: z.object({
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().min(1).max(10000),
    dueAt: z.coerce.date().nullable().optional(),
    submissionFormat: z.enum(["text", "video", "audio", "file"]),
    pointsReward: z.number().int().min(0).max(10000).default(0),
    materials: z.array(materialSchema).max(20).optional(),
  }).optional(),
});

export async function onlineLessonsRoutes(app: FastifyInstance) {
  app.get(
    "/students/me/coins",
    { preHandler: [authenticate, requireStudent, requirePermission("coins.read")] },
    async (request) => ({ data: { balance: await getStudentCoins(request.user!.id) } }),
  );

  app.get(
    "/online-lessons/requests",
    { preHandler: [authenticate, requireStudent, requirePermission("online_lessons.read")] },
    async (request) => ({
      data: await listStudentOnlineLessonRequests(request.user!.id),
    }),
  );

  app.post(
    "/online-lessons/requests",
    { preHandler: [authenticate, requireStudent, requirePermission("online_lessons.request")] },
    async (request, reply) => {
      const body = z.object({
        requestType: z.enum(["trial", "online_lesson"]).default("online_lesson"),
        directionId: z.string().uuid().nullable().optional(),
        directionTitle: z.string().trim().min(1).max(255),
        level: z.string().trim().min(1).max(128),
        preferredTime: z.string().trim().min(1).max(512),
        comment: z.string().trim().max(4000).optional(),
      }).parse(request.body);

      const item = await createOnlineLessonRequest({
        studentId: request.user!.id,
        ...body,
      });
      return reply.status(201).send({ data: item });
    },
  );

  app.get(
    "/online-lessons/requests/:id",
    { preHandler: [authenticate, requireStudent, requirePermission("online_lessons.read")] },
    async (request) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      return { data: await getStudentOnlineLessonRequest(request.user!.id, id) };
    },
  );

  app.post(
    "/online-lessons/requests/:id/submissions",
    { preHandler: [authenticate, requireStudent, requirePermission("online_lessons.read")] },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = z.object({
        comment: z.string().trim().max(4000).optional(),
        attachmentUrl: z.string().url().max(1024).optional(),
        attachmentType: z.enum(["text", "video", "audio", "file"]).optional(),
      }).parse(request.body);

      const item = await submitOnlineLessonAssignment({
        requestId: id,
        studentId: request.user!.id,
        ...body,
      });
      return reply.status(201).send({ data: item });
    },
  );

  app.get(
    "/admin/online-lesson-requests",
    { preHandler: manageGuards() },
    async (request) => {
      const query = z.object({
        status: z.enum(["new", "assigned", "scheduled", "completed", "cancelled", "no_show"]).optional(),
        search: z.string().trim().optional(),
        mine: z.coerce.boolean().optional(),
        teacherId: z.string().uuid().optional(),
        unassigned: z.coerce.boolean().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }).parse(request.query);

      const authUser = request.user!;
      const mine = authUser.roleSlug === "teacher" ? true : (query.mine ?? false);

      const result = await listAdminOnlineLessonRequests({
        ...query,
        mine,
        teacherId: mine ? authUser.id : query.teacherId,
        unassigned: mine ? false : query.unassigned,
      });
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
    "/admin/online-lesson-requests/pending-count",
    { preHandler: manageGuards() },
    async (request) => ({
      data: await countPendingOnlineLessonRequests({
        teacherId: request.user!.roleSlug === "teacher" ? request.user!.id : undefined,
        includeNewRequests: request.user!.roleSlug !== "teacher",
      }),
    }),
  );

  app.get(
    "/admin/online-lesson-teachers",
    { preHandler: manageGuards() },
    async () => ({ data: await listOnlineLessonTeachers() }),
  );

  app.get(
    "/admin/online-lesson-requests/:id",
    { preHandler: manageGuards() },
    async (request) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      return {
        data: await getStaffOnlineLessonRequest(id, {
          id: request.user!.id,
          roleSlug: request.user!.roleSlug,
        }),
      };
    },
  );

  app.patch(
    "/admin/online-lesson-requests/:id/assign",
    { preHandler: manageGuards() },
    async (request) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = z.object({ teacherId: z.string().uuid().optional() }).parse(request.body ?? {});
      const actor = request.user!;
      const teacherId = actor.roleSlug === "teacher" ? actor.id : body.teacherId;
      if (!teacherId) {
        throw new BadRequestError("Выберите преподавателя");
      }
      return {
        data: await assignOnlineLessonRequest(id, teacherId, {
          allowReassign: actor.roleSlug !== "teacher",
        }),
      };
    },
  );

  app.patch(
    "/admin/online-lesson-requests/:id/schedule",
    { preHandler: manageGuards() },
    async (request) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      await getStaffOnlineLessonRequest(id, {
        id: request.user!.id,
        roleSlug: request.user!.roleSlug,
      });
      const body = z.object({
        scheduledAt: z.coerce.date(),
        zoomUrl: z.string().trim().url().max(1024),
      }).parse(request.body);
      return { data: await scheduleOnlineLessonRequest(id, body) };
    },
  );

  app.patch(
    "/admin/online-lesson-requests/:id/cancel",
    { preHandler: manageGuards() },
    async (request) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      await getStaffOnlineLessonRequest(id, {
        id: request.user!.id,
        roleSlug: request.user!.roleSlug,
      });
      return { data: await cancelOnlineLessonRequest(id) };
    },
  );

  app.patch(
    "/admin/online-lesson-requests/:id/no-show",
    { preHandler: manageGuards() },
    async (request) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      await getStaffOnlineLessonRequest(id, {
        id: request.user!.id,
        roleSlug: request.user!.roleSlug,
      });
      return { data: await markOnlineLessonNoShow(id) };
    },
  );

  app.post(
    "/admin/online-lesson-requests/:id/complete",
    { preHandler: manageGuards() },
    async (request) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      await getStaffOnlineLessonRequest(id, {
        id: request.user!.id,
        roleSlug: request.user!.roleSlug,
      });
      const body = completeBodySchema.parse(request.body);
      return {
        data: await completeOnlineLessonRequest(id, {
          completedBy: request.user!.id,
          ...body,
        }),
      };
    },
  );

  app.patch(
    "/admin/online-lesson-submissions/:id/review",
    { preHandler: manageGuards() },
    async (request) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = z.object({
        action: z.enum(["approve", "approve_with_remarks", "return"]),
        reviewComment: z.string().trim().max(4000).optional(),
        reviewPoints: z.number().int().min(0).max(10000).default(0),
        reviewCoins: z.number().int().min(0).max(10000).default(0),
        reviewCoinsReason: z.string().trim().max(512).optional(),
      }).parse(request.body);

      return {
        data: await reviewOnlineLessonAssignment(id, {
          reviewerId: request.user!.id,
          reviewerRole: request.user!.roleSlug,
          ...body,
        }),
      };
    },
  );
}
