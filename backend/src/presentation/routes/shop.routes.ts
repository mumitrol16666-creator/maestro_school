import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError } from "../../domain/errors.js";
import {
  cancelStudentShopOrder,
  fetchStudentShop,
  postStudentShopOrder,
} from "../../infrastructure/crm/crm-client.js";
import { getStudentCoins } from "../../application/services/coins.service.js";
import { authenticate, requireStudent } from "../guards/auth.guards.js";

const orderBody = z.object({
  externalKey: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().trim().min(1).max(128),
    quantity: z.number().int().min(1).max(100),
  })).min(1).max(25),
  coinsToUse: z.number().int().min(0).max(2_000_000_000),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const orderParams = z.object({ id: z.string().trim().min(1).max(128) });

async function requireCrmStudentId(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { crmStudentId: true },
  });
  if (!user?.crmStudentId) {
    throw new BadRequestError(
      "Аккаунт ещё не связан со школой. Обратитесь к администратору.",
      "CRM_STUDENT_NOT_LINKED",
    );
  }
  return user.crmStudentId;
}

export async function shopRoutes(app: FastifyInstance) {
  app.get(
    "/students/me/shop",
    { preHandler: [authenticate, requireStudent] },
    async (request) => {
      const crmStudentId = await requireCrmStudentId(request.user!.id);
      const [shop, coins] = await Promise.all([
        fetchStudentShop(crmStudentId),
        getStudentCoins(request.user!.id),
      ]);
      return { data: { ...shop, coins } };
    },
  );

  app.post(
    "/students/me/shop/orders",
    { preHandler: [authenticate, requireStudent] },
    async (request, reply) => {
      const body = orderBody.parse(request.body);
      const crmStudentId = await requireCrmStudentId(request.user!.id);
      const result = await postStudentShopOrder({ ...body, crmStudentId });
      return reply.status(201).send({
        data: {
          order: result.order,
          coins: await getStudentCoins(request.user!.id),
        },
      });
    },
  );

  app.post(
    "/students/me/shop/orders/:id/cancel",
    { preHandler: [authenticate, requireStudent] },
    async (request) => {
      const { id } = orderParams.parse(request.params);
      const crmStudentId = await requireCrmStudentId(request.user!.id);
      const result = await cancelStudentShopOrder(id, {
        crmStudentId,
        reason: "Отменён учеником в приложении",
      });
      return {
        data: {
          order: result.order,
          coins: await getStudentCoins(request.user!.id),
        },
      };
    },
  );
}
