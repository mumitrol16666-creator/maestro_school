import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listHomeworkAttemptsBySubmission } from "../../application/repositories/homework.repository.js";
import {
  getAdminHomeworkSubmission,
  listAdminHomeworkSubmissions,
} from "../../application/repositories/homework-review.repository.js";
import {
  getLearningHomeworkReviewDetail,
  listLearningHomeworkReviewQueue,
} from "../../application/services/learning-homework-review-queue.service.js";
import { learningHomeworkV2Enabled } from "../../application/services/learning-homework-v2.service.js";
import { isContentAdminRole } from "../../domain/cms-access.js";
import { ForbiddenError, NotFoundError } from "../../domain/errors.js";
import {
  authenticate,
  requirePermission,
} from "../guards/auth.guards.js";

const reviewGuards = () => [
  authenticate,
  requirePermission("homework.review"),
];

const listQuerySchema = z.object({
  status: z.enum(["submitted", "reviewed", "completed", "rejected"]).optional(),
  courseId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  search: z.string().trim().optional(),
  source: z.enum(["all", "learning", "legacy"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function requireLegacyReviewAccess(roleSlug: string) {
  if (!isContentAdminRole(roleSlug)) {
    throw new ForbiddenError("История курсовых заданий доступна только администратору");
  }
}

function legacyItem(item: Awaited<ReturnType<typeof listAdminHomeworkSubmissions>>["items"][number]) {
  return { model: "legacy_course" as const, ...item };
}

export async function homeworkReviewRoutes(app: FastifyInstance) {
  app.get(
    "/admin/homework-submissions",
    { preHandler: reviewGuards() },
    async (request) => {
      const query = listQuerySchema.parse(request.query);
      const roleSlug = request.user!.roleSlug;
      if (!learningHomeworkV2Enabled()) {
        requireLegacyReviewAccess(roleSlug);
        const result = await listAdminHomeworkSubmissions(query);
        return {
          data: result.items.map(legacyItem),
          meta: {
            page: query.page,
            limit: query.limit,
            total: result.total,
            pages: Math.ceil(result.total / query.limit),
            sources: { learning: 0, legacy: result.total },
          },
        };
      }

      const source = query.source ?? (roleSlug === "teacher" ? "learning" : "all");
      if (source === "legacy") requireLegacyReviewAccess(roleSlug);
      const includeLearning = source !== "legacy" && !query.courseId;
      const includeLegacy = source !== "learning" && isContentAdminRole(roleSlug);
      const take = query.page * query.limit;
      const learning = includeLearning
        ? await listLearningHomeworkReviewQueue({
            reviewerUserId: request.user!.id,
            status: query.status,
            studentId: query.studentId,
            search: query.search,
            page: 1,
            limit: take,
          })
        : { items: [], total: 0, scope: "school" as const };
      const legacy = includeLegacy
        ? await listAdminHomeworkSubmissions({ ...query, page: 1, limit: take })
        : { items: [], total: 0 };
      const offset = (query.page - 1) * query.limit;
      const items = [
        ...learning.items,
        ...legacy.items.map(legacyItem),
      ]
        .sort((left, right) => (
          new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime()
        ))
        .slice(offset, offset + query.limit);
      const total = learning.total + legacy.total;

      return {
        data: items,
        meta: {
          page: query.page,
          limit: query.limit,
          total,
          pages: Math.ceil(total / query.limit),
          sources: { learning: learning.total, legacy: legacy.total },
        },
      };
    },
  );

  app.get(
    "/admin/homework-submissions/:submissionId",
    { preHandler: reviewGuards() },
    async (request) => {
      const { submissionId } = z
        .object({ submissionId: z.string().uuid() })
        .parse(request.params);

      if (learningHomeworkV2Enabled()) {
        const learningItem = await getLearningHomeworkReviewDetail(
          submissionId,
          request.user!.id,
        );
        if (learningItem) return { data: learningItem };
      }

      requireLegacyReviewAccess(request.user!.roleSlug);
      const item = await getAdminHomeworkSubmission(submissionId);
      if (!item) throw new NotFoundError("Homework submission");

      return { data: { model: "legacy_course" as const, ...item } };
    },
  );

  app.get(
    "/admin/homework-submissions/:submissionId/attempts",
    { preHandler: reviewGuards() },
    async (request) => {
      const { submissionId } = z
        .object({ submissionId: z.string().uuid() })
        .parse(request.params);

      if (learningHomeworkV2Enabled()) {
        const learningItem = await getLearningHomeworkReviewDetail(
          submissionId,
          request.user!.id,
        );
        if (learningItem) {
          return {
            data: {
              homeworkId: learningItem.assignmentId,
              studentId: learningItem.studentId,
              attempts: learningItem.attempts,
            },
          };
        }
      }

      requireLegacyReviewAccess(request.user!.roleSlug);
      const result = await listHomeworkAttemptsBySubmission(submissionId);
      if (!result) throw new NotFoundError("Homework submission");

      return { data: result };
    },
  );
}
