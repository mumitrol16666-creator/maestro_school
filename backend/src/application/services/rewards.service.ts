import { Prisma, type RewardRedemptionStatus } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../domain/errors.js";
import { getStudentRank } from "../../domain/student-rank.js";
import {
  canTransitionRewardStatus,
  rewardStatusNeedsRefund,
  type RewardStatus,
} from "../../domain/reward-redemption-policy.js";
import { getStudentCoins } from "./coins.service.js";
import { getStudentPointsReadModel } from "./points.service.js";
import { deliverUserNotification } from "./notification.service.js";

const rewardItemSelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  costCoins: true,
  stock: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

const redemptionInclude = {
  reward: { select: rewardItemSelect },
  student: {
    select: {
      id: true,
      login: true,
      firstName: true,
      lastName: true,
      middleName: true,
    },
  },
  processedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  },
} as const;

async function notifyRewardManagers(redemptionId: string, rewardTitle: string) {
  const managers = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      role: { slug: { in: ["admin", "owner", "super_admin"] } },
    },
    select: { id: true },
  });
  await Promise.allSettled(managers.map((manager) => deliverUserNotification({
    userId: manager.id,
    type: "reward_requested",
    title: "Новая заявка на награду",
    body: `Ученик обменял Maestro Coins на награду «${rewardTitle}».`,
    url: "/admin/rewards",
    tag: `reward-request-${redemptionId}-${manager.id}`,
    dedupeKey: `reward:requested:${redemptionId}:${manager.id}`,
  })));
}

export async function getStudentRewardsOverview(studentId: string) {
  const [pointsOverview, coins, catalog, redemptions] = await Promise.all([
    getStudentPointsReadModel(studentId),
    getStudentCoins(studentId),
    prisma.rewardCatalogItem.findMany({
      where: { isActive: true },
      select: rewardItemSelect,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.rewardRedemption.findMany({
      where: { studentId },
      include: {
        reward: { select: rewardItemSelect },
        processedBy: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  return {
    points: pointsOverview.points,
    coins,
    rank: getStudentRank(pointsOverview.points),
    level: pointsOverview.level,
    catalog,
    redemptions,
  };
}

export async function redeemReward(params: {
  studentId: string;
  rewardId: string;
  studentNote?: string | null;
}) {
  const redemption = await prisma.$transaction(async (tx) => {
    const reward = await tx.rewardCatalogItem.findFirst({
      where: { id: params.rewardId, isActive: true },
      select: rewardItemSelect,
    });
    if (!reward) throw new NotFoundError("Награда");
    if (reward.stock === 0) {
      throw new ConflictError("Эта награда временно закончилась", "REWARD_OUT_OF_STOCK");
    }

    await tx.studentCoinBalance.upsert({
      where: { studentId: params.studentId },
      create: { studentId: params.studentId, balance: 0 },
      update: {},
    });

    const reserved = await tx.$executeRaw`
      UPDATE "reward_catalog_items"
      SET
        "stock" = CASE WHEN "stock" IS NULL THEN NULL ELSE "stock" - 1 END,
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${params.rewardId}::uuid
        AND "is_active" = TRUE
        AND ("stock" IS NULL OR "stock" > 0)
    `;
    if (reserved !== 1) {
      throw new ConflictError("Эта награда временно недоступна", "REWARD_UNAVAILABLE");
    }

    const debited = await tx.studentCoinBalance.updateMany({
      where: {
        studentId: params.studentId,
        balance: { gte: reward.costCoins },
      },
      data: { balance: { decrement: reward.costCoins } },
    });
    if (debited.count !== 1) {
      throw new ConflictError(
        `Для этой награды нужно ${reward.costCoins} Maestro Coins`,
        "INSUFFICIENT_COINS",
      );
    }

    const balance = await tx.studentCoinBalance.findUniqueOrThrow({
      where: { studentId: params.studentId },
      select: { balance: true },
    });
    const created = await tx.rewardRedemption.create({
      data: {
        studentId: params.studentId,
        rewardId: reward.id,
        rewardTitle: reward.title,
        costCoins: reward.costCoins,
        studentNote: params.studentNote?.trim() || null,
      },
      include: redemptionInclude,
    });
    await tx.maestroCoinTransaction.create({
      data: {
        studentId: params.studentId,
        amount: -reward.costCoins,
        transactionType: "spend",
        reason: `Награда «${reward.title}»`,
        sourceType: "reward",
        sourceId: created.id,
        sourceKey: `reward-spend:${created.id}`,
        createdById: params.studentId,
        balanceBefore: balance.balance + reward.costCoins,
        balanceAfter: balance.balance,
      },
    });
    return created;
  });

  await notifyRewardManagers(redemption.id, redemption.rewardTitle).catch(() => undefined);
  return redemption;
}

export async function listAdminRewards(status?: RewardRedemptionStatus) {
  const [catalog, redemptions] = await Promise.all([
    prisma.rewardCatalogItem.findMany({
      select: {
        ...rewardItemSelect,
        _count: { select: { redemptions: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.rewardRedemption.findMany({
      where: status ? { status } : undefined,
      include: redemptionInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  return { catalog, redemptions };
}

export async function createRewardCatalogItem(params: {
  title: string;
  description: string;
  category: string;
  costCoins: number;
  stock?: number | null;
  isActive?: boolean;
  sortOrder?: number;
}) {
  return prisma.rewardCatalogItem.create({
    data: {
      title: params.title.trim(),
      description: params.description.trim(),
      category: params.category.trim(),
      costCoins: params.costCoins,
      stock: params.stock ?? null,
      isActive: params.isActive ?? true,
      sortOrder: params.sortOrder ?? 0,
    },
    select: rewardItemSelect,
  });
}

export async function updateRewardCatalogItem(
  rewardId: string,
  params: {
    title?: string;
    description?: string;
    category?: string;
    costCoins?: number;
    stock?: number | null;
    isActive?: boolean;
    sortOrder?: number;
  },
) {
  const existing = await prisma.rewardCatalogItem.findUnique({ where: { id: rewardId } });
  if (!existing) throw new NotFoundError("Награда");

  return prisma.rewardCatalogItem.update({
    where: { id: rewardId },
    data: {
      ...(params.title !== undefined ? { title: params.title.trim() } : {}),
      ...(params.description !== undefined ? { description: params.description.trim() } : {}),
      ...(params.category !== undefined ? { category: params.category.trim() } : {}),
      ...(params.costCoins !== undefined ? { costCoins: params.costCoins } : {}),
      ...(params.stock !== undefined ? { stock: params.stock } : {}),
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.sortOrder !== undefined ? { sortOrder: params.sortOrder } : {}),
    },
    select: rewardItemSelect,
  });
}

export async function processRewardRedemption(params: {
  redemptionId: string;
  status: RewardStatus;
  adminComment?: string | null;
  processedBy: string;
}) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "reward_redemptions"
      WHERE "id" = ${params.redemptionId}::uuid
      FOR UPDATE
    `;
    const current = await tx.rewardRedemption.findUnique({
      where: { id: params.redemptionId },
      include: redemptionInclude,
    });
    if (!current) throw new NotFoundError("Заявка на награду");
    const from = current.status as RewardStatus;
    if (!canTransitionRewardStatus(from, params.status)) {
      throw new BadRequestError(
        `Нельзя изменить статус награды с ${from} на ${params.status}`,
        "INVALID_REWARD_STATUS_TRANSITION",
      );
    }
    if (from === params.status) return current;

    if (rewardStatusNeedsRefund(from, params.status)) {
      await tx.studentCoinBalance.upsert({
        where: { studentId: current.studentId },
        create: { studentId: current.studentId, balance: current.costCoins },
        update: { balance: { increment: current.costCoins } },
      });
      const balance = await tx.studentCoinBalance.findUniqueOrThrow({
        where: { studentId: current.studentId },
        select: { balance: true },
      });
      await tx.maestroCoinTransaction.create({
        data: {
          studentId: current.studentId,
          amount: current.costCoins,
          transactionType: "correction",
          reason: `Возврат за награду «${current.rewardTitle}»`,
          sourceType: "reward",
          sourceId: current.id,
          sourceKey: `reward-refund:${current.id}`,
          createdById: params.processedBy,
          balanceBefore: balance.balance - current.costCoins,
          balanceAfter: balance.balance,
        },
      });
      await tx.$executeRaw`
        UPDATE "reward_catalog_items"
        SET
          "stock" = CASE WHEN "stock" IS NULL THEN NULL ELSE "stock" + 1 END,
          "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${current.rewardId}::uuid
      `;
    }

    return tx.rewardRedemption.update({
      where: { id: current.id },
      data: {
        status: params.status,
        adminComment: params.adminComment?.trim() || null,
        processedById: params.processedBy,
        processedAt: new Date(),
      },
      include: redemptionInclude,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

  const statusCopy = {
    requested: "Заявка создана",
    approved: "Награда подтверждена",
    fulfilled: "Награда выдана",
    rejected: "Заявка отклонена, Coins возвращены",
  }[result.status];
  await deliverUserNotification({
    userId: result.studentId,
    type: "reward_status_updated",
    title: statusCopy,
    body: result.adminComment
      ? `${result.rewardTitle}. ${result.adminComment}`
      : result.rewardTitle,
    url: "/rewards",
    tag: `reward-status-${result.id}-${result.status}`,
    dedupeKey: `reward:status:${result.id}:${result.status}`,
  }).catch(() => undefined);

  return result;
}
