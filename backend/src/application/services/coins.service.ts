import type { MaestroCoinSourceType } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError } from "../../domain/errors.js";

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
  createdBy: string;
}) {
  if (params.amount <= 0) {
    return { awarded: false as const, balance: await getStudentCoins(params.studentId) };
  }

  const reason = params.reason.trim();
  if (!reason) {
    throw new BadRequestError("Укажите причину начисления Maestro Coins");
  }

  return prisma.$transaction(async (tx) => {
    const balanceRow = await tx.studentCoinBalance.upsert({
      where: { studentId: params.studentId },
      create: { studentId: params.studentId, balance: 0 },
      update: {},
    });

    const balanceBefore = balanceRow.balance;
    const balanceAfter = balanceBefore + params.amount;

    await tx.maestroCoinTransaction.create({
      data: {
        studentId: params.studentId,
        amount: params.amount,
        transactionType: "earn",
        reason,
        sourceType: params.sourceType,
        sourceId: params.sourceId ?? null,
        createdById: params.createdBy,
        balanceBefore,
        balanceAfter,
      },
    });

    await tx.studentCoinBalance.update({
      where: { studentId: params.studentId },
      data: { balance: balanceAfter },
    });

    return { awarded: true as const, balance: balanceAfter };
  });
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

  return addMaestroCoins({
    studentId: params.studentId,
    amount: course.completionCoinsReward,
    reason: `Завершение курса «${course.title}»`,
    sourceType: "course",
    sourceId: params.courseId,
    createdBy: params.createdBy,
  });
}
