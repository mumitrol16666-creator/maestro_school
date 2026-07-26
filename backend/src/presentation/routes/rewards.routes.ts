import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createRewardCatalogItem,
  getStudentRewardsOverview,
  listAdminRewards,
  processRewardRedemption,
  redeemReward,
  updateRewardCatalogItem,
} from "../../application/services/rewards.service.js";
import { writeAuditLog } from "../../application/services/audit.service.js";
import {
  authenticate,
  requireContentAdmin,
  requireStudent,
} from "../guards/auth.guards.js";

const idParams = z.object({ id: z.string().uuid() });
const category = z.string().trim().min(1).max(64);
const rewardBody = z.object({
  title: z.string().trim().min(2).max(255),
  description: z.string().trim().min(5).max(2000),
  category: category.default("learning"),
  costCoins: z.number().int().min(1).max(1_000_000),
  stock: z.number().int().min(0).max(1_000_000).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
});

export async function rewardsRoutes(app: FastifyInstance) {
  app.get(
    "/students/me/rewards",
    { preHandler: [authenticate, requireStudent] },
    async (request) => ({
      data: await getStudentRewardsOverview(request.user!.id),
    }),
  );

  app.post(
    "/rewards/:id/redeem",
    { preHandler: [authenticate, requireStudent] },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const body = z.object({
        studentNote: z.string().trim().max(500).optional().nullable(),
      }).parse(request.body ?? {});
      const result = await redeemReward({
        studentId: request.user!.id,
        rewardId: id,
        studentNote: body.studentNote,
      });
      return reply.status(201).send({ data: result });
    },
  );

  app.get(
    "/admin/rewards",
    { preHandler: [authenticate, requireContentAdmin] },
    async (request) => {
      const query = z.object({
        status: z.enum(["requested", "approved", "fulfilled", "rejected"]).optional(),
      }).parse(request.query);
      return { data: await listAdminRewards(query.status) };
    },
  );

  app.post(
    "/admin/rewards",
    { preHandler: [authenticate, requireContentAdmin] },
    async (request, reply) => {
      const body = rewardBody.parse(request.body);
      const result = await createRewardCatalogItem(body);
      await writeAuditLog({
        entityType: "reward_catalog_item",
        entityId: result.id,
        action: "create",
        actorId: request.user!.id,
        payload: { title: result.title, costCoins: result.costCoins },
      });
      return reply.status(201).send({ data: result });
    },
  );

  app.patch(
    "/admin/rewards/:id",
    { preHandler: [authenticate, requireContentAdmin] },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const body = rewardBody.partial().parse(request.body);
      const result = await updateRewardCatalogItem(id, body);
      await writeAuditLog({
        entityType: "reward_catalog_item",
        entityId: result.id,
        action: "update",
        actorId: request.user!.id,
        payload: {
          title: result.title,
          costCoins: result.costCoins,
          isActive: result.isActive,
        },
      });
      return { data: result };
    },
  );

  app.patch(
    "/admin/reward-redemptions/:id",
    { preHandler: [authenticate, requireContentAdmin] },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const body = z.object({
        status: z.enum(["approved", "fulfilled", "rejected"]),
        adminComment: z.string().trim().max(500).optional().nullable(),
      }).parse(request.body);
      const result = await processRewardRedemption({
        redemptionId: id,
        status: body.status,
        adminComment: body.adminComment,
        processedBy: request.user!.id,
      });
      await writeAuditLog({
        entityType: "reward_redemption",
        entityId: result.id,
        action: "update",
        actorId: request.user!.id,
        payload: { status: result.status },
      });
      return { data: result };
    },
  );
}
