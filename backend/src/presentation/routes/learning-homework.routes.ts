import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createLearningHomeworkAssignment,
  learningHomeworkV2Enabled,
  listStudentLearningHomeworkAssignments,
  listTeacherLearningHomeworkAssignments,
  reviewLearningHomework,
} from "../../application/services/learning-homework-v2.service.js";
import { writeAuditLog } from "../../application/services/audit.service.js";
import {
  authenticate,
  requirePermission,
  requireStudent,
  requireTeacher,
} from "../guards/auth.guards.js";

const materialSchema = z.object({
  type: z.enum(["link", "audio", "video", "file"]),
  url: z.string().url().max(2048).refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Материал должен использовать http или https"),
  title: z.string().trim().max(255).optional(),
});

const createAssignmentSchema = z.object({
  topicId: z.string().uuid(),
  instructions: z.string().trim().min(1).max(10_000),
  materials: z.array(materialSchema).max(5).default([]),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  sourceLessonId: z.string().trim().min(1).max(128).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(191),
});

const reviewSchema = z.object({
  decision: z.enum(["revision", "accepted", "accepted_with_comment"]),
  comment: z.string().max(5000).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(191),
});

export async function learningHomeworkRoutes(app: FastifyInstance) {
  if (!learningHomeworkV2Enabled()) return;

  app.get(
    "/teachers/me/homework-flow",
    { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.read")] },
    async () => ({ data: { enabled: true, model: "learning_homework_v2" } }),
  );

  app.post(
    "/teachers/me/homework-assignments",
    { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.write")] },
    async (request, reply) => {
      const body = createAssignmentSchema.parse(request.body ?? {});
      const assignment = await createLearningHomeworkAssignment(request.user!.id, {
        ...body,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
      });
      if (!assignment.idempotent) {
        await writeAuditLog({
          entityType: "learning_homework_assignment",
          entityId: assignment.id,
          action: "create",
          actorId: request.user!.id,
          payload: {
            event: "learning_homework_assigned",
            topicId: assignment.topic.id,
            sourceLessonId: assignment.sourceLessonId,
            recipientCount: assignment.recipientCount,
            dueAt: assignment.dueAt,
          },
        });
      }
      return reply.status(assignment.idempotent ? 200 : 201).send({ data: assignment });
    },
  );

  app.get(
    "/teachers/me/learning-topics/:topicId/homework-assignments",
    { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.read")] },
    async (request) => {
      const { topicId } = z.object({ topicId: z.string().uuid() }).parse(request.params);
      return {
        data: {
          model: "learning_homework_v2",
          assignments: await listTeacherLearningHomeworkAssignments(request.user!.id, topicId),
        },
      };
    },
  );

  app.get(
    "/students/me/homework-assignments",
    { preHandler: [authenticate, requireStudent, requirePermission("progress.read")] },
    async (request) => ({
      data: {
        model: "learning_homework_v2",
        assignments: await listStudentLearningHomeworkAssignments(request.user!.id),
      },
    }),
  );

  app.post(
    "/homework-recipients/:recipientId/reviews",
    { preHandler: [authenticate, requirePermission("homework.review")] },
    async (request, reply) => {
      const { recipientId } = z.object({ recipientId: z.string().uuid() }).parse(request.params);
      const body = reviewSchema.parse(request.body ?? {});
      const result = await reviewLearningHomework({
        recipientId,
        reviewerUserId: request.user!.id,
        ...body,
      });
      if (!result.idempotent) {
        await writeAuditLog({
          entityType: "learning_homework_recipient",
          entityId: recipientId,
          action: "update",
          actorId: request.user!.id,
          payload: {
            event: "learning_homework_reviewed",
            reviewId: result.review.id,
            decision: result.review.decision,
            cycleNumber: result.review.cycleNumber,
          },
        });
      }
      return reply.status(result.idempotent ? 200 : 201).send({ data: result });
    },
  );
}
