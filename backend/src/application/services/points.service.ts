import { prisma } from "../../infrastructure/database/prisma.js";
import { ConflictError } from "../../domain/errors.js";
import { rewardEconomyV2AppliesToEvent } from "../../config/product-features.js";
import { getProductLevel, rankProductPoints } from "../../domain/product-economy-v2.js";
import { deliverUserNotification } from "./notification.service.js";
import { requireActiveEconomicEpochForEvent } from "./economic-epoch.service.js";
import { privateLeagueName } from "./weekly-league-policy.js";

async function notifyPointsAwarded(params: {
  studentId: string;
  amount: number;
  reason: string;
  transactionId: string;
}) {
  await deliverUserNotification({
    userId: params.studentId,
    type: "points_awarded",
    title: `Начислено баллов: +${params.amount}`,
    body: params.reason,
    url: "/dashboard",
    tag: `points-${params.transactionId}`,
    dedupeKey: `points:${params.transactionId}`,
  }).catch(() => undefined);
}

export type StudentPointsReadModel = {
  mode: "legacy" | "level";
  economicEpoch: { id: string; code: string; startsAt: Date } | null;
  points: number;
  level: ReturnType<typeof getProductLevel> | null;
};

/** One current Points balance for all directions, isolated by economic epoch. */
export async function getStudentPointsReadModel(
  studentId: string,
  now = new Date(),
): Promise<StudentPointsReadModel> {
  if (!rewardEconomyV2AppliesToEvent(now)) {
    const legacy = await prisma.pointsTransaction.aggregate({
      where: { studentId, economicEpochId: null },
      _sum: { amount: true },
    });
    return {
      mode: "legacy",
      economicEpoch: null,
      points: legacy._sum.amount ?? 0,
      level: null,
    };
  }

  const economicEpoch = await requireActiveEconomicEpochForEvent(now);
  const participant = await prisma.economicEpochParticipant.findUnique({
    where: {
      epochId_studentId: {
        epochId: economicEpoch.id,
        studentId,
      },
    },
    select: { openingPoints: true },
  });
  if (!participant) {
    throw new ConflictError(
      "Баланс ученика не открыт в текущей экономической эпохе",
      "ECONOMIC_EPOCH_PARTICIPANT_MISSING",
    );
  }
  const result = await prisma.pointsTransaction.aggregate({
    where: { studentId, economicEpochId: economicEpoch.id },
    _sum: { amount: true },
  });
  const points = Math.max(0, participant.openingPoints + (result._sum.amount ?? 0));
  return {
    mode: "level",
    economicEpoch: {
      id: economicEpoch.id,
      code: economicEpoch.code,
      startsAt: economicEpoch.startsAt,
    },
    points,
    level: getProductLevel(points),
  };
}

/** Balance is NEVER stored — always aggregated from the current ledger. */
export async function calculateStudentPoints(studentId: string): Promise<number> {
  return (await getStudentPointsReadModel(studentId)).points;
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
  const now = new Date();
  const economicEpoch = rewardEconomyV2AppliesToEvent(now)
    ? await requireActiveEconomicEpochForEvent(now)
    : null;
  const rows = await prisma.pointsTransaction.findMany({
    where: { studentId, economicEpochId: economicEpoch?.id ?? null },
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

export async function getProductPointsLeaderboard(
  viewerStudentId: string,
  now = new Date(),
) {
  if (!rewardEconomyV2AppliesToEvent(now)) {
    return {
      enabled: false as const,
      economicEpoch: null,
      updatedAt: now,
      participantCount: 0,
      allBalancesEqual: true,
      standings: [],
      currentStudent: null,
    };
  }

  const economicEpoch = await requireActiveEconomicEpochForEvent(now);
  const participants = await prisma.economicEpochParticipant.findMany({
    where: {
      epochId: economicEpoch.id,
      student: {
        role: { slug: "student" },
        isActive: true,
        deletedAt: null,
      },
    },
    select: {
      studentId: true,
      openingPoints: true,
      student: { select: { firstName: true, lastName: true } },
    },
    orderBy: { studentId: "asc" },
  });
  const totals = participants.length
    ? await prisma.pointsTransaction.groupBy({
        by: ["studentId"],
        where: {
          economicEpochId: economicEpoch.id,
          studentId: { in: participants.map((participant) => participant.studentId) },
        },
        _sum: { amount: true },
      })
    : [];
  const totalsByStudent = new Map(
    totals.map((entry) => [entry.studentId, entry._sum.amount ?? 0]),
  );
  const ranking = rankProductPoints(participants.map((participant) => ({
    studentId: participant.studentId,
    displayName: privateLeagueName(
      participant.student.firstName,
      participant.student.lastName,
    ),
    points: participant.openingPoints + (totalsByStudent.get(participant.studentId) ?? 0),
  }))).map((entry) => ({
    ...entry,
    level: getProductLevel(entry.points).level,
    isCurrentStudent: entry.studentId === viewerStudentId,
  }));
  const currentStudent = ranking.find((entry) => entry.studentId === viewerStudentId) ?? null;

  return {
    enabled: true as const,
    economicEpoch: {
      code: economicEpoch.code,
      startsAt: economicEpoch.startsAt,
    },
    updatedAt: now,
    participantCount: ranking.length,
    allBalancesEqual: ranking.length > 0
      && ranking.every((entry) => entry.points === ranking[0].points),
    standings: ranking.slice(0, 10),
    currentStudent,
  };
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
  if (rewardEconomyV2AppliesToEvent(new Date())) {
    throw new ConflictError(
      "Прямые баллы за урок отключены в новой экономике",
      "LEGACY_LESSON_POINTS_DISABLED",
    );
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

  await notifyPointsAwarded({
    studentId: params.studentId,
    amount: params.amount,
    reason: params.reason,
    transactionId: tx.id,
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
  if (rewardEconomyV2AppliesToEvent(new Date())) {
    throw new ConflictError(
      "Ручные Points отключены в новой экономике",
      "LEGACY_MANUAL_POINTS_DISABLED",
    );
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

  await notifyPointsAwarded({
    studentId: params.studentId,
    amount: params.amount,
    reason: params.reason,
    transactionId: tx.id,
  });

  return { awarded: true, transactionId: tx.id };
}

/** Awards points from an automated product action exactly once per source key. */
export async function awardSystemPoints(params: {
  studentId: string;
  amount: number;
  reason: string;
  sourceKey: string;
  eventAt?: Date;
}): Promise<{ awarded: boolean; transactionId?: string }> {
  if (params.amount <= 0) {
    return { awarded: false };
  }

  const eventAt = params.eventAt ?? new Date();
  const economicEpoch = rewardEconomyV2AppliesToEvent(eventAt)
    ? await requireActiveEconomicEpochForEvent(eventAt)
    : null;
  const existing = await prisma.pointsTransaction.findUnique({
    where: { sourceKey: params.sourceKey },
  });
  if (existing) {
    await notifyPointsAwarded({
      studentId: existing.studentId,
      amount: existing.amount,
      reason: existing.reason,
      transactionId: existing.id,
    });
    return { awarded: false, transactionId: existing.id };
  }

  const tx = await prisma.pointsTransaction.create({
    data: {
      economicEpochId: economicEpoch?.id ?? null,
      studentId: params.studentId,
      amount: params.amount,
      reason: params.reason,
      sourceKey: params.sourceKey,
      lessonId: null,
      awardedBy: null,
      createdAt: eventAt,
    },
  });

  await notifyPointsAwarded({
    studentId: params.studentId,
    amount: params.amount,
    reason: params.reason,
    transactionId: tx.id,
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
