import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getHomeworkById,
  listStudentHomeworkSubmissions,
} from "../../application/repositories/homework.repository.js";
import { submitHomework } from "../../application/services/homework-submit.service.js";
import { reviewHomeworkSubmission } from "../../application/services/homework-review.service.js";
import { writeAuditLog } from "../../application/services/audit.service.js";
import { authenticate, requirePermission } from "../guards/auth.guards.js";

const attachmentTypeSchema = z.enum(["text", "video", "audio", "file"]);

const submitSchema = z.object({
  comment: z.string().max(4000).optional(),
  attachmentUrl: z.string().url().max(1024).optional(),
  attachmentType: attachmentTypeSchema.optional(),
});

const reviewSchema = z
  .object({
    action: z.enum(["approve", "reject"]),
    reviewNote: z.string().max(4000).optional(),
    reviewComment: z.string().max(4000).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.action === "reject") {
      const note = (body.reviewComment ?? body.reviewNote)?.trim();
      if (!note) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Review comment is required for reject action",
          path: ["reviewComment"],
        });
      }
    }
  });

export async function homeworkRoutes(app: FastifyInstance) {
  app.get(
    "/homeworks/:homeworkId/submissions/me",
    {
      preHandler: [authenticate, requirePermission("homework.submit")],
    },
    async (request) => {
      const { homeworkId } = z.object({ homeworkId: z.string().uuid() }).parse(request.params);
      const studentId = request.user!.id;

      await getHomeworkById(homeworkId);

      const attempts = await listStudentHomeworkSubmissions(homeworkId, studentId);

      return { data: attempts };
    },
  );

  app.post(
    "/homeworks/:homeworkId/submissions",
    {
      preHandler: [authenticate, requirePermission("homework.submit")],
    },
    async (request, reply) => {
      const { homeworkId } = z.object({ homeworkId: z.string().uuid() }).parse(request.params);
      const body = submitSchema.parse(request.body);
      const studentId = request.user!.id;

      await getHomeworkById(homeworkId);

      const { submission, lessonId } = await submitHomework({
        homeworkId,
        studentId,
        comment: body.comment,
        attachmentUrl: body.attachmentUrl,
        attachmentType: body.attachmentType,
      });

      await writeAuditLog({
        entityType: "homework_submission",
        entityId: submission.id,
        action: "create",
        actorId: studentId,
        payload: { homeworkId, lessonId, status: submission.status, lessonProgress: "submitted" },
      });

      return reply.status(201).send({
        data: {
          id: submission.id,
          homeworkId: submission.homeworkId,
          status: submission.status,
          attachmentType: submission.attachmentType,
          lessonProgress: "submitted",
          createdAt: submission.createdAt,
        },
      });
    },
  );

  app.patch(
    "/homeworks/submissions/:submissionId/review",
    {
      preHandler: [authenticate, requirePermission("homework.review")],
    },
    async (request) => {
      const { submissionId } = z
        .object({ submissionId: z.string().uuid() })
        .parse(request.params);
      const body = reviewSchema.parse(request.body);
      const reviewerId = request.user!.id;

      const result = await reviewHomeworkSubmission({
        submissionId,
        reviewerId,
        action: body.action,
        reviewNote: body.reviewComment ?? body.reviewNote,
      });

      await writeAuditLog({
        entityType: "homework_submission",
        entityId: submissionId,
        action: "update",
        actorId: reviewerId,
        payload: {
          action: body.action,
          lessonStatus: result.lessonStatus,
          pointsAwarded: result.pointsAwarded,
        },
      });

      return {
        data: {
          submission: {
            id: result.submission.id,
            status: result.submission.status,
            reviewedAt: result.submission.reviewedAt,
          },
          lessonStatus: result.lessonStatus,
          pointsAwarded: result.pointsAwarded,
        },
      };
    },
  );
}
