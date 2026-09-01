import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  countUnreadLearningMessages,
  editLearningMessage,
  getLearningConversation,
  getLearningDialogAttachmentDownload,
  hideLearningMessage,
  listLearningConversations,
  markLearningConversationRead,
  prepareLearningMessageAttachmentUpload,
  reportLearningMessage,
  resolveLearningMessageReport,
  restrictLearningDialogGroupMember,
  retractLearningMessage,
  sendLearningMessage,
  sendLearningMessageWithAttachments,
  sendLearningLessonQuestion,
  startStudentCuratorConversation,
  unrestrictLearningDialogGroupMember,
  updateLearningConversationPreferences,
} from "../../application/services/learning-dialog.service.js";
import {
  deleteLearningDialogFile,
  storeLearningDialogFile,
  type StoredLearningDialogFile,
} from "../../application/services/learning-dialog-private-storage.service.js";
import { BadRequestError } from "../../domain/errors.js";
import { syncTeacherLearningDialogsFromCrm } from "../../application/services/learning-dialog-membership.service.js";
import { authenticate, requireTeacher } from "../guards/auth.guards.js";

const idParamsSchema = z.object({ conversationId: z.string().uuid() });
const messageParamsSchema = idParamsSchema.extend({ messageId: z.string().uuid() });
const reportParamsSchema = idParamsSchema.extend({ reportId: z.string().uuid() });
const memberParamsSchema = idParamsSchema.extend({ userId: z.string().uuid() });
const attachmentParamsSchema = z.object({ attachmentId: z.string().uuid() });
const idempotencyKeySchema = z.string().trim().min(1).max(128);
const messageBodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  idempotencyKey: idempotencyKeySchema,
  contextType: z.string().trim().min(1).max(64).optional(),
  contextId: z.string().trim().min(1).max(191).optional(),
}).refine((body) => Boolean(body.contextType) === Boolean(body.contextId), {
  message: "contextType и contextId передаются вместе",
});

const multipartMessageSchema = z.object({
  message: z.string().trim().max(4000).optional(),
  contextType: z.string().trim().min(1).max(64).optional(),
  contextId: z.string().trim().min(1).max(191).optional(),
}).refine((body) => Boolean(body.contextType) === Boolean(body.contextId), {
  message: "contextType и contextId передаются вместе",
});

function actor(request: { user?: { id: string; roleSlug: string } }) {
  return {
    userId: request.user!.id,
    roleSlug: request.user!.roleSlug,
  };
}

async function removeStoredFiles(files: StoredLearningDialogFile[]) {
  await Promise.all(files.map((file) => deleteLearningDialogFile(file.storageKey)));
}

async function readMultipartMessage(
  request: FastifyRequest,
  conversationId: string,
) {
  const fields: Record<string, string> = {};
  const attachments: StoredLearningDialogFile[] = [];
  try {
    const parts = request.parts({
      limits: {
        fieldNameSize: 100,
        fieldSize: 4_000,
        fields: 3,
        fileSize: 50 * 1024 * 1024,
        files: 5,
        parts: 8,
      },
    });
    for await (const part of parts) {
      if (part.type === "field") {
        if (!["message", "contextType", "contextId"].includes(part.fieldname)) {
          throw new BadRequestError("Неизвестное поле сообщения");
        }
        fields[part.fieldname] = String(part.value ?? "");
        continue;
      }
      const stored = await storeLearningDialogFile({
        conversationId,
        filename: part.filename,
        mimeType: part.mimetype,
        stream: part.file,
      });
      if (part.file.truncated) {
        await deleteLearningDialogFile(stored.storageKey);
        throw new BadRequestError("Файл не должен превышать 50 MB");
      }
      attachments.push(stored);
    }
    const parsed = multipartMessageSchema.parse(fields);
    if (attachments.length === 0) throw new BadRequestError("Прикрепите хотя бы один файл");
    return { ...parsed, attachments };
  } catch (error) {
    await removeStoredFiles(attachments);
    const code = (error as { code?: string }).code ?? "";
    if (code.includes("FILE_TOO_LARGE")) throw new BadRequestError("Файл не должен превышать 50 MB");
    if (code.includes("FILES_LIMIT")) throw new BadRequestError("К сообщению можно прикрепить не более пяти файлов");
    throw error;
  }
}

export async function learningDialogRoutes(app: FastifyInstance) {
  app.get("/learning-dialogs", { preHandler: [authenticate] }, async (request) => {
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      archive: z.enum(["active", "archived", "all"]).default("active"),
    }).parse(request.query);
    return { data: await listLearningConversations(actor(request), query) };
  });

  app.get("/learning-dialogs/unread-count", { preHandler: [authenticate] }, async (request) => ({
    data: { count: await countUnreadLearningMessages(actor(request)) },
  }));

  app.post(
    "/learning-dialogs/sync",
    { preHandler: [authenticate, requireTeacher] },
    async (request) => ({
      data: await syncTeacherLearningDialogsFromCrm(request.user!.id),
    }),
  );

  app.post("/learning-dialogs/curator", { preHandler: [authenticate] }, async (request, reply) => {
    const body = messageBodySchema.parse(request.body);
    const result = await startStudentCuratorConversation(actor(request), {
      body: body.message,
      idempotencyKey: body.idempotencyKey,
      contextType: body.contextType,
      contextId: body.contextId,
    });
    return reply.code(result.created ? 201 : 200).send({ data: result });
  });

  app.post("/learning-dialogs/lesson-question", { preHandler: [authenticate] }, async (request, reply) => {
    const body = z.object({
      lessonId: z.string().uuid(),
      message: z.string().trim().min(1).max(4000),
      idempotencyKey: idempotencyKeySchema,
    }).parse(request.body);
    const result = await sendLearningLessonQuestion(actor(request), {
      lessonId: body.lessonId,
      body: body.message,
      idempotencyKey: body.idempotencyKey,
    });
    return reply.code(result.created ? 201 : 200).send({ data: result });
  });

  app.get("/learning-dialogs/:conversationId", { preHandler: [authenticate] }, async (request) => {
    const { conversationId } = idParamsSchema.parse(request.params);
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      before: z.string().uuid().optional(),
    }).parse(request.query);
    return { data: await getLearningConversation(actor(request), conversationId, query) };
  });

  app.post("/learning-dialogs/:conversationId/read", { preHandler: [authenticate] }, async (request) => {
    const { conversationId } = idParamsSchema.parse(request.params);
    return { data: await markLearningConversationRead(actor(request), conversationId) };
  });

  app.patch("/learning-dialogs/:conversationId/preferences", { preHandler: [authenticate] }, async (request) => {
    const { conversationId } = idParamsSchema.parse(request.params);
    const body = z.object({
      notificationsMuted: z.boolean().optional(),
      archived: z.boolean().optional(),
    }).refine((value) => value.notificationsMuted !== undefined || value.archived !== undefined, {
      message: "Выберите настройку диалога",
    }).parse(request.body);
    return {
      data: await updateLearningConversationPreferences(actor(request), conversationId, body),
    };
  });

  app.post("/learning-dialogs/:conversationId/messages", { preHandler: [authenticate] }, async (request, reply) => {
    const { conversationId } = idParamsSchema.parse(request.params);
    if (request.isMultipart()) {
      const idempotencyKey = idempotencyKeySchema.parse(request.headers["idempotency-key"]);
      const prepared = await prepareLearningMessageAttachmentUpload(actor(request), conversationId, idempotencyKey);
      if (prepared.existing) return reply.code(200).send({ data: prepared.existing });
      const multipartBody = await readMultipartMessage(request, conversationId);
      try {
        const result = await sendLearningMessageWithAttachments(actor(request), conversationId, {
          body: multipartBody.message,
          idempotencyKey,
          contextType: multipartBody.contextType,
          contextId: multipartBody.contextId,
          attachments: multipartBody.attachments,
        });
        if (!result.created) await removeStoredFiles(multipartBody.attachments);
        return reply.code(result.created ? 201 : 200).send({ data: result.message });
      } catch (error) {
        await removeStoredFiles(multipartBody.attachments);
        throw error;
      }
    }
    const body = messageBodySchema.parse(request.body);
    const result = await sendLearningMessage(actor(request), conversationId, {
      body: body.message,
      idempotencyKey: body.idempotencyKey,
      contextType: body.contextType,
      contextId: body.contextId,
    });
    return reply.code(result.created ? 201 : 200).send({ data: result.message });
  });

  app.patch(
    "/learning-dialogs/:conversationId/messages/:messageId",
    { preHandler: [authenticate] },
    async (request) => {
      const { conversationId, messageId } = messageParamsSchema.parse(request.params);
      const body = z.object({
        message: z.string().trim().min(1).max(4000),
        idempotencyKey: idempotencyKeySchema,
      }).parse(request.body);
      return {
        data: await editLearningMessage(actor(request), conversationId, messageId, {
          body: body.message,
          idempotencyKey: body.idempotencyKey,
        }),
      };
    },
  );

  app.post(
    "/learning-dialogs/:conversationId/messages/:messageId/retract",
    { preHandler: [authenticate] },
    async (request) => {
      const { conversationId, messageId } = messageParamsSchema.parse(request.params);
      const body = z.object({ idempotencyKey: idempotencyKeySchema }).parse(request.body);
      return {
        data: await retractLearningMessage(actor(request), conversationId, messageId, body),
      };
    },
  );

  app.get("/learning-dialog-attachments/:attachmentId/download", { preHandler: [authenticate] }, async (request, reply) => {
    const { attachmentId } = attachmentParamsSchema.parse(request.params);
    const file = await getLearningDialogAttachmentDownload(actor(request), attachmentId);
    reply.headers({
      "Cache-Control": "private, no-store",
      "Content-Length": String(file.sizeBytes),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.originalFilename)}`,
    });
    return reply.type(file.mimeType).send(file.stream);
  });

  app.post(
    "/learning-dialogs/:conversationId/messages/:messageId/reports",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { conversationId, messageId } = messageParamsSchema.parse(request.params);
      const body = z.object({
        versionId: z.string().uuid(),
        reason: z.string().trim().min(1).max(2000),
        idempotencyKey: idempotencyKeySchema,
      }).parse(request.body);
      const result = await reportLearningMessage(actor(request), conversationId, messageId, body);
      return reply.code(result.created ? 201 : 200).send({ data: result.report });
    },
  );

  app.post(
    "/learning-dialogs/:conversationId/messages/:messageId/hide",
    { preHandler: [authenticate] },
    async (request) => {
      const { conversationId, messageId } = messageParamsSchema.parse(request.params);
      const body = z.object({
        reason: z.string().trim().min(1).max(2000),
        idempotencyKey: idempotencyKeySchema,
      }).parse(request.body);
      return { data: await hideLearningMessage(actor(request), conversationId, messageId, body) };
    },
  );

  app.post(
    "/learning-dialogs/:conversationId/reports/:reportId/resolve",
    { preHandler: [authenticate] },
    async (request) => {
      const { conversationId, reportId } = reportParamsSchema.parse(request.params);
      const body = z.object({
        status: z.enum(["resolved", "dismissed"]),
        resolution: z.string().trim().min(1).max(2000),
        idempotencyKey: idempotencyKeySchema,
      }).parse(request.body);
      return { data: await resolveLearningMessageReport(actor(request), conversationId, reportId, body) };
    },
  );

  app.post(
    "/learning-dialogs/:conversationId/members/:userId/restrict",
    { preHandler: [authenticate] },
    async (request) => {
      const { conversationId, userId } = memberParamsSchema.parse(request.params);
      const body = z.object({
        restrictedUntil: z.string().datetime({ offset: true }).transform((value) => new Date(value)),
        reason: z.string().trim().min(1).max(2000),
        idempotencyKey: idempotencyKeySchema,
      }).parse(request.body);
      return { data: await restrictLearningDialogGroupMember(actor(request), conversationId, userId, body) };
    },
  );

  app.post(
    "/learning-dialogs/:conversationId/members/:userId/unrestrict",
    { preHandler: [authenticate] },
    async (request) => {
      const { conversationId, userId } = memberParamsSchema.parse(request.params);
      const body = z.object({
        reason: z.string().trim().min(1).max(2000),
        idempotencyKey: idempotencyKeySchema,
      }).parse(request.body);
      return { data: await unrestrictLearningDialogGroupMember(actor(request), conversationId, userId, body) };
    },
  );
}
