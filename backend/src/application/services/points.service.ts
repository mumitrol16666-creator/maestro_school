import { prisma } from "../../infrastructure/database/prisma.js";
import { ConflictError } from "../../domain/errors.js";

/** Balance is NEVER stored — always aggregated from ledger */
export async function calculateStudentPoints(studentId: string): Promise<number> {
  const result = await prisma.pointsTransaction.aggregate({
    where: { studentId },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

/** @deprecated Use calculateStudentPoints */
export const getStudentPointsBalance = calculateStudentPoints;

export interface PointsHistoryEntry {
  id: string;
  amount: number;
  reason: string;
  lessonId: string | null;
  awardedBy: string | null;
  createdAt: Date;
}

export async function getStudentPointsHistory(
  studentId: string,
  limit = 50,
): Promise<PointsHistoryEntry[]> {
  const rows = await prisma.pointsTransaction.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      amount: true,
      reason: true,
      lessonId: true,
      awardedBy: true,
      createdAt: true,
    },
  });
  return rows;
}

/**
 * Awards lesson points after successful homework review.
 * Idempotent per (studentId, lessonId) — no double award.
 */
export async function awardLessonPoints(params: {
  studentId: string;
  lessonId: string;
  amount: number;
  reason: string;
  awardedBy: string;
}): Promise<{ awarded: boolean; transactionId?: string }> {
  if (params.amount <= 0) {
    return { awarded: false };
  }

  const existing = await prisma.pointsTransaction.findFirst({
    where: {
      studentId: params.studentId,
      lessonId: params.lessonId,
    },
  });

  if (existing) {
    return { awarded: false, transactionId: existing.id };
  }

  const tx = await prisma.pointsTransaction.create({
    data: {
      studentId: params.studentId,
      lessonId: params.lessonId,
      amount: params.amount,
      reason: params.reason,
      awardedBy: params.awardedBy,
    },
  });

  return { awarded: true, transactionId: tx.id };
}

export async function awardManualPoints(params: {
  studentId: string;
  amount: number;
  reason: string;
  awardedBy: string;
  idempotencyKey?: string;
}): Promise<{ awarded: boolean; transactionId?: string }> {
  if (params.amount <= 0) {
    return { awarded: false };
  }

  const reason = params.idempotencyKey
    ? `[${params.idempotencyKey}] ${params.reason}`
    : params.reason;

  if (params.idempotencyKey) {
    const existing = await prisma.pointsTransaction.findFirst({
      where: {
        studentId: params.studentId,
        reason: { startsWith: `[${params.idempotencyKey}]` },
      },
    });
    if (existing) {
      return { awarded: false, transactionId: existing.id };
    }
  }

  const tx = await prisma.pointsTransaction.create({
    data: {
      studentId: params.studentId,
      lessonId: null,
      amount: params.amount,
      reason,
      awardedBy: params.awardedBy,
    },
  });

  return { awarded: true, transactionId: tx.id };
}

export async function assertLessonPointsNotAwarded(
  studentId: string,
  lessonId: string,
): Promise<void> {
  const existing = await prisma.pointsTransaction.findFirst({
    where: { studentId, lessonId },
  });
  if (existing) {
    throw new ConflictError("Points already awarded for this lesson", "POINTS_ALREADY_AWARDED");
  }
}
