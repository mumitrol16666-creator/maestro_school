import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  getHomeworkById,
  listStudentHomeworkSubmissions,
} from "../../application/repositories/homework.repository.js";
import { submitHomework } from "../../application/services/homework-submit.service.js";
import { reviewHomeworkSubmission } from "../../application/services/homework-review.service.js";
import {
  learningHomeworkAssignmentExists,
  listStudentLearningHomeworkAttempts,
  assertStudentLearningHomeworkAccess,
  requireLearningHomeworkFileAccess,
  submitLearningHomeworkAttempt,
} from "../../application/services/learning-homework-v2.service.js";
import {
  deleteLearningHomeworkFile,
  getLearningHomeworkFile,
  learningHomeworkMaterialType,
  storeLearningHomeworkFile,
} from "../../application/services/learning-homework-private-storage.service.js";
import { BadRequestError } from "../../domain/errors.js";
import { writeAuditLog } from "../../application/services/audit.service.js";
import { authenticate, requirePermission } from "../guards/auth.guards.js";

const attachmentTypeSchema = z.enum(["text", "video", "audio", "file"]);

const submitSchema = z.object({
  comment: z.string().max(4000).optional(),
  attachmentUrl: z.string().url().max(1024).optional(),
  attachmentType: attachmentTypeSchema.optional(),
  testAnswers: z.record(z.string().min(1), z.string().min(1)).optional(),
});

const learningMaterialSchema = z.object({
  type: z.enum(["link", "audio", "video", "file"]),
  url: z.string().url().max(2048).refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Материал должен использовать http или https"),
  title: z.string().trim().max(255).optional(),
});

const submitLearningHomeworkSchema = z.object({
  submissionMode: z.enum(["materials", "ready_for_lesson"]),
  text: z.string().max(10_000).nullable().optional(),
  materials: z.array(learningMaterialSchema).max(5).default([]),
  previousAttemptId: z.string().uuid().nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(191),
});

const multipartLearningHomeworkSchema = z.object({
  submissionMode: z.enum(["materials", "ready_for_lesson"]),
  text: z.string().max(10_000).optional(),
  link: z.string().url().max(2048).optional(),
  previousAttemptId: z.string().uuid().optional(),
});

type StoredHomeworkUpload = Awaited<ReturnType<typeof storeLearningHomeworkFile>>;

async function removeNewHomeworkFiles(assignmentId: string, files: StoredHomeworkUpload[]) {
  await Promise.all(files
    .filter((file) => file.created)
    .map((file) => deleteLearningHomeworkFile(assignmentId, file.filename)));
}

async function readLearningHomeworkMultipart(request: FastifyRequest, assignmentId: string) {
  const fields: Record<string, string> = {};
  const uploads: StoredHomeworkUpload[] = [];
  try {
    const parts = request.parts({
      limits: {
        fieldNameSize: 100,
        fieldSize: 10_000,
        fields: 4,
        fileSize: 500 * 1024 * 1024,
        files: 5,
        parts: 9,
      },
    });
    for await (const part of parts) {
      if (part.type === "field") {
        if (!["submissionMode", "text", "link", "previousAttemptId"].includes(part.fieldname)) {
          throw new BadRequestError("Неизвестное поле ответа");
        }
        fields[part.fieldname] = String(part.value ?? "");
        continue;
      }
      const stored = await storeLearningHomeworkFile({
        assignmentId,
        filename: part.filename,
        mimeType: part.mimetype,
        stream: part.file,
      });
      if (part.file.truncated) {
        if (stored.created) await deleteLearningHomeworkFile(assignmentId, stored.filename);
        throw new BadRequestError("Файл превышает допустимый размер");
      }
      uploads.push(stored);
    }
    const parsed = multipartLearningHomeworkSchema.parse({
      ...fields,
      text: fields.text || undefined,
      link: fields.link || undefined,
      previousAttemptId: fields.previousAttemptId || undefined,
    });
    return { ...parsed, uploads };
  } catch (error) {
    await removeNewHomeworkFiles(assignmentId, uploads);
    throw error;
  }
}

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

      if (await learningHomeworkAssignmentExists(homeworkId)) {
        return {
          data: await listStudentLearningHomeworkAttempts(homeworkId, studentId),
        };
      }

      await getHomeworkById(homeworkId);

      const attempts = await listStudentHomeworkSubmissions(homeworkId, studentId);

      return { data: attempts };
    },
  );

  app.get(
    "/homework-files/:assignmentId/:filename/download",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { assignmentId, filename } = z.object({
        assignmentId: z.string().uuid(),
        filename: z.string().regex(/^[a-f0-9]{64}\.[a-z0-9]+$/i),
      }).parse(request.params);
      await requireLearningHomeworkFileAccess(assignmentId, request.user!.id);
      const file = await getLearningHomeworkFile(assignmentId, filename);
      reply.headers({
        "Cache-Control": "private, no-store",
        "Content-Length": String(file.sizeBytes),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.originalFilename)}`,
      });
      return reply.type(file.mimeType).send(file.stream);
    },
  );

  app.post(
    "/homeworks/:homeworkId/submissions",
    {
      preHandler: [authenticate, requirePermission("homework.submit")],
    },
    async (request, reply) => {
      const { homeworkId } = z.object({ homeworkId: z.string().uuid() }).parse(request.params);
      const studentId = request.user!.id;

      if (await learningHomeworkAssignmentExists(homeworkId)) {
        await assertStudentLearningHomeworkAccess(homeworkId, studentId);
        let uploads: StoredHomeworkUpload[] = [];
        try {
          let body: z.infer<typeof submitLearningHomeworkSchema>;
          if (request.isMultipart()) {
            const idempotencyKey = z.string().trim().min(8).max(191)
              .parse(request.headers["idempotency-key"]);
            const multipartBody = await readLearningHomeworkMultipart(request, homeworkId);
            uploads = multipartBody.uploads;
            body = {
              submissionMode: multipartBody.submissionMode,
              text: multipartBody.text,
              previousAttemptId: multipartBody.previousAttemptId,
              idempotencyKey,
              materials: [
                ...(multipartBody.link ? [{
                  type: "link" as const,
                  url: multipartBody.link,
                  title: "Ссылка ученика",
                }] : []),
                ...uploads.map((file) => ({
                  type: learningHomeworkMaterialType(file.mimeType),
                  url: `/api/v1/homework-files/${homeworkId}/${file.filename}/download`,
                  title: file.originalFilename,
                  mimeType: file.mimeType,
                  sizeBytes: file.sizeBytes,
                  privateFile: true,
                })),
              ],
            };
          } else {
            body = submitLearningHomeworkSchema.parse(request.body ?? {});
          }
          const result = await submitLearningHomeworkAttempt({
            assignmentId: homeworkId,
            studentUserId: studentId,
            mode: body.submissionMode,
            text: body.text,
            materials: body.materials,
            previousAttemptId: body.previousAttemptId,
            idempotencyKey: body.idempotencyKey,
          });
          if (!result.idempotent) {
            await writeAuditLog({
              entityType: "learning_homework_attempt",
              entityId: result.assignment.latestAttempt!.id,
              action: "create",
              actorId: studentId,
              payload: {
                event: "learning_homework_submitted",
                assignmentId: homeworkId,
                recipientId: result.assignment.recipientId,
                cycleNumber: result.assignment.latestAttempt!.cycleNumber,
                versionInCycle: result.assignment.latestAttempt!.versionInCycle,
                submissionMode: result.assignment.latestAttempt!.submissionMode,
                attachmentCount: result.assignment.latestAttempt!.materials.length,
                rewardApplied: false,
              },
            });
          }
          return reply.status(result.idempotent ? 200 : 201).send({ data: result.assignment });
        } catch (error) {
          await removeNewHomeworkFiles(homeworkId, uploads);
          throw error;
        }
      }

      const body = submitSchema.parse(request.body);

      await getHomeworkById(homeworkId);

      const { submission, lessonId, testResult, lessonProgress } = await submitHomework({
        homeworkId,
        studentId,
        comment: body.comment,
        attachmentUrl: body.attachmentUrl,
        attachmentType: body.attachmentType,
        testAnswers: body.testAnswers,
      });

      await writeAuditLog({
        entityType: "homework_submission",
        entityId: submission.id,
        action: "create",
        actorId: studentId,
        payload: { homeworkId, lessonId, status: submission.status, lessonProgress },
      });

      return reply.status(201).send({
        data: {
          id: submission.id,
          homeworkId: submission.homeworkId,
          status: submission.status,
          attachmentType: submission.attachmentType,
          testScore: submission.testScore,
          testPassed: submission.testPassed,
          testResult,
          lessonProgress,
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
