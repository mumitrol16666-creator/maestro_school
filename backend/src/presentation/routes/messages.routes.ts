import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  countUnreadMessages,
  getConversation,
  listConversations,
  listMessageContacts,
  replyToConversation,
  startConversation,
} from "../../application/services/message-mailbox.service.js";
import { authenticate } from "../guards/auth.guards.js";

const messageBodySchema = z.object({
  message: z.string().trim().min(1, "Напишите сообщение").max(3000, "Сообщение слишком длинное"),
});

export async function messagesRoutes(app: FastifyInstance) {
  app.get("/messages/contacts", { preHandler: [authenticate] }, async (request) => ({
    data: await listMessageContacts(request.user!.id, request.user!.roleSlug),
  }));

  app.get("/messages/unread-count", { preHandler: [authenticate] }, async (request) => ({
    data: { count: await countUnreadMessages(request.user!.id, request.user!.roleSlug) },
  }));

  app.get("/messages", { preHandler: [authenticate] }, async (request) => ({
    data: await listConversations(request.user!.id, request.user!.roleSlug),
  }));

  app.post("/messages/conversations", { preHandler: [authenticate] }, async (request, reply) => {
    const body = messageBodySchema.extend({ recipientId: z.string().uuid() }).parse(request.body);
    const result = await startConversation({
      userId: request.user!.id,
      role: request.user!.roleSlug,
      recipientId: body.recipientId,
      body: body.message,
    });
    return reply.code(201).send({ data: result });
  });

  app.get("/messages/:conversationId", { preHandler: [authenticate] }, async (request) => {
    const { conversationId } = z.object({ conversationId: z.string().uuid() }).parse(request.params);
    return { data: await getConversation(request.user!.id, conversationId) };
  });

  app.post("/messages/:conversationId", { preHandler: [authenticate] }, async (request, reply) => {
    const { conversationId } = z.object({ conversationId: z.string().uuid() }).parse(request.params);
    const body = messageBodySchema.parse(request.body);
    const result = await replyToConversation({
      userId: request.user!.id,
      role: request.user!.roleSlug,
      conversationId,
      body: body.message,
    });
    return reply.code(201).send({ data: result });
  });
}
