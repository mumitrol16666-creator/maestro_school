import { Prisma, type MaestroCoinSourceType } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ConflictError } from "../../domain/errors.js";
import { rewardEconomyV2AppliesToEvent } from "../../config/product-features.js";
import { deliverUserNotification } from "./notification.service.js";
import { requireActiveEconomicEpochForEvent } from "./economic-epoch.service.js";

export async function creditMaestroCoinsInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    economicEpochId: string | null;
    studentId: string;
    amount: number;
    reason: string;
    sourceType: MaestroCoinSourceType;
    sourceId?: string | null;
    sourceKey: string;
    createdById?: string | null;
    eventAt: Date;
  },
) {
  const existing = await tx.maestroCoinTransaction.findUnique({
    where: { sourceKey: params.sourceKey },
    select: { id: true, balanceAfter: true },
  });
  if (existing) {
    return {
      awarded: false as const,
      transactionId: existing.id,
      balance: existing.balanceAfter,
    };
  }

  const balanceRow = await tx.studentCoinBalance.upsert({
    where: { studentId: params.studentId },
    create: {
      studentId: params.studentId,
      balance: 0,
      economicEpochId: params.economicEpochId,
    },
    update: {},
  });
  if (params.economicEpochId && balanceRow.economicEpochId !== params.economicEpochId) {
    throw new ConflictError(
      "Баланс Coins не открыт в активной экономической эпохе",
      "ECONOMIC_EPOCH_BALANCE_MISSING",
    );
  }

  const balanceBefore = balanceRow.balance;
  const balanceAfter = balanceBefore + params.amount;
  const transaction = await tx.maestroCoinTransaction.create({
    data: {
      economicEpochId: params.economicEpochId,
      studentId: params.studentId,
      amount: params.amount,
      transactionType: "earn",
      reason: params.reason,
      sourceType: params.sourceType,
      sourceId: params.sourceId ?? null,
      sourceKey: params.sourceKey,
      createdById: params.createdById ?? null,
      balanceBefore,
      balanceAfter,
      createdAt: params.eventAt,
    },
    select: { id: true },
  });
  await tx.studentCoinBalance.update({
    where: { studentId: params.studentId },
    data: { balance: balanceAfter },
  });

  return {
    awarded: true as const,
    transactionId: transaction.id,
    balance: balanceAfter,
  };
}

export async function getStudentCoins(studentId: string) {
  const balance = await prisma.studentCoinBalance.findUnique({
    where: { studentId },
    select: { balance: true },
  });
  return balance?.balance ?? 0;
}

export async function ensureStudentCoinBalance(studentId: string) {
  return prisma.studentCoinBalance.upsert({
    where: { studentId },
    create: { studentId, balance: 0 },
    update: {},
  });
}

export async function addMaestroCoins(params: {
  studentId: string;
  amount: number;
  reason: string;
  sourceType: MaestroCoinSourceType;
  sourceId?: string | null;
  sourceKey?: string;
  createdBy: string;
  eventAt?: Date;
}) {
  if (params.amount <= 0) {
    return { awarded: false as const, balance: await getStudentCoins(params.studentId) };
  }

  const reason = params.reason.trim();
  if (!reason) {
    throw new BadRequestError("Укажите причину начисления Maestro Coins");
  }
  const eventAt = params.eventAt ?? new Date();
  const economicEpoch = rewardEconomyV2AppliesToEvent(eventAt)
    ? await requireActiveEconomicEpochForEvent(eventAt)
    : null;

  if (params.sourceKey) {
    const existing = await prisma.maestroCoinTransaction.findUnique({
      where: { sourceKey: params.sourceKey },
      select: { balanceAfter: true },
    });
    if (existing) {
      return { awarded: false as const, balance: existing.balanceAfter };
    }
  }

  let result: { awarded: true; balance: number; transactionId: string };
  try {
    result = await prisma.$transaction(async (tx) => {
      const balanceRow = await tx.studentCoinBalance.upsert({
        where: { studentId: params.studentId },
        create: {
          studentId: params.studentId,
          balance: 0,
          economicEpochId: economicEpoch?.id ?? null,
        },
        update: {},
      });
      if (economicEpoch && balanceRow.economicEpochId !== economicEpoch.id) {
        throw new ConflictError(
          "Баланс Coins не открыт в активной экономической эпохе",
          "ECONOMIC_EPOCH_BALANCE_MISSING",
        );
      }

      const balanceBefore = balanceRow.balance;
      const balanceAfter = balanceBefore + params.amount;

      const transaction = await tx.maestroCoinTransaction.create({
        data: {
          economicEpochId: economicEpoch?.id ?? null,
          studentId: params.studentId,
          amount: params.amount,
          transactionType: "earn",
          reason,
          sourceType: params.sourceType,
          sourceId: params.sourceId ?? null,
          sourceKey: params.sourceKey ?? null,
          createdById: params.createdBy,
          balanceBefore,
          balanceAfter,
          createdAt: eventAt,
        },
      });

      await tx.studentCoinBalance.update({
        where: { studentId: params.studentId },
        data: { balance: balanceAfter },
      });

      return { awarded: true as const, balance: balanceAfter, transactionId: transaction.id };
    });
  } catch (error) {
    if (params.sourceKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.maestroCoinTransaction.findUnique({
        where: { sourceKey: params.sourceKey },
        select: { balanceAfter: true },
      });
      return {
        awarded: false as const,
        balance: existing?.balanceAfter ?? await getStudentCoins(params.studentId),
      };
    }
    throw error;
  }

  await deliverUserNotification({
    userId: params.studentId,
    type: "coins_awarded",
    title: `Начислено Maestro Coins: +${params.amount}`,
    body: `${reason}. Баланс: ${result.balance}.`,
    url: "/dashboard",
    tag: `coins-${result.transactionId}`,
    dedupeKey: `coins:${result.transactionId}`,
  }).catch(() => undefined);

  return result;
}

export async function awardCourseCompletionCoins(params: {
  studentId: string;
  courseId: string;
  createdBy: string;
}) {
  const course = await prisma.course.findUnique({
    where: { id: params.courseId },
    select: { id: true, title: true, completionCoinsReward: true },
  });

  if (!course || course.completionCoinsReward <= 0) {
    return { awarded: false as const, balance: await getStudentCoins(params.studentId) };
  }

  const existing = await prisma.maestroCoinTransaction.findFirst({
    where: {
      studentId: params.studentId,
      sourceType: "course",
      sourceId: params.courseId,
    },
    select: { id: true, balanceAfter: true },
  });

  if (existing) {
    return { awarded: false as const, balance: existing.balanceAfter };
  }

  try {
    return await addMaestroCoins({
      studentId: params.studentId,
      amount: course.completionCoinsReward,
      reason: `Завершение курса «${course.title}»`,
      sourceType: "course",
      sourceId: params.courseId,
      sourceKey: `course-completion:${params.studentId}:${params.courseId}`,
      createdBy: params.createdBy,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const awarded = await prisma.maestroCoinTransaction.findFirst({
        where: {
          studentId: params.studentId,
          sourceType: "course",
          sourceId: params.courseId,
        },
        select: { balanceAfter: true },
      });
      const balance = awarded?.balanceAfter ?? await getStudentCoins(params.studentId);
      return { awarded: false as const, balance };
    }
    throw error;
  }
}
