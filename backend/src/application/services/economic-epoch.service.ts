import { EconomicEpochStatus, type Prisma, type PrismaClient } from "@prisma/client";
import { ConflictError } from "../../domain/errors.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { getAqtobeWeekRange } from "./weekly-league-policy.js";

export const ECONOMY_V2_EPOCH_CODE = "economy-v2-2026-09-07";
export const ECONOMY_V2_EPOCH_NAME = "Maestro Economy V2";
export const ECONOMY_V2_OPENING_POINTS = 0;
export const ECONOMY_V2_OPENING_WEEKLY_XP = 0;
export const ECONOMY_V2_OPENING_COINS = 200;

type DbClient = PrismaClient | Prisma.TransactionClient;

type StudentSnapshot = {
  studentId: string;
  legacyPoints: number;
  legacyWeeklyXp: number;
  legacyCoins: number;
};

export type EconomicEpochCutoverPreview = {
  code: string;
  startsAt: Date;
  state: "ready" | "applied" | "blocked";
  epochId: string | null;
  activeStudents: number;
  alreadyEnrolled: number;
  legacyTotals: {
    points: number;
    weeklyXp: number;
    coins: number;
  };
  openingTotals: {
    points: number;
    weeklyXp: number;
    coins: number;
  };
  blockers: string[];
};

function epochSourceKey(code: string) {
  return `economic-epoch:${code}`;
}

function participantSourceKey(code: string, studentId: string) {
  return `${epochSourceKey(code)}:student:${studentId}`;
}

function openingCoinsSourceKey(code: string, studentId: string) {
  return `${participantSourceKey(code, studentId)}:opening-coins`;
}

async function loadActiveStudentSnapshots(client: DbClient, startsAt: Date): Promise<StudentSnapshot[]> {
  const students = await client.user.findMany({
    where: {
      role: { slug: "student" },
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (students.length === 0) return [];

  const studentIds = students.map((student) => student.id);
  const week = getAqtobeWeekRange(startsAt);
  const [points, weeklyXp, coinBalances] = await Promise.all([
    client.pointsTransaction.groupBy({
      by: ["studentId"],
      where: {
        studentId: { in: studentIds },
        economicEpochId: null,
        createdAt: { lt: startsAt },
      },
      _sum: { amount: true },
    }),
    client.leagueXpEvent.groupBy({
      by: ["studentId"],
      where: {
        studentId: { in: studentIds },
        economicEpochId: null,
        createdAt: { gte: week.start, lt: startsAt },
      },
      _sum: { amount: true },
    }),
    client.studentCoinBalance.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, balance: true },
    }),
  ]);

  const pointsByStudent = new Map(points.map((entry) => [entry.studentId, entry._sum?.amount ?? 0]));
  const xpByStudent = new Map(weeklyXp.map((entry) => [entry.studentId, entry._sum?.amount ?? 0]));
  const coinsByStudent = new Map(coinBalances.map((entry) => [entry.studentId, entry.balance]));

  return students.map((student) => ({
    studentId: student.id,
    legacyPoints: pointsByStudent.get(student.id) ?? 0,
    legacyWeeklyXp: xpByStudent.get(student.id) ?? 0,
    legacyCoins: coinsByStudent.get(student.id) ?? 0,
  }));
}

function sumSnapshots(snapshots: StudentSnapshot[]) {
  return snapshots.reduce(
    (totals, snapshot) => ({
      points: totals.points + snapshot.legacyPoints,
      weeklyXp: totals.weeklyXp + snapshot.legacyWeeklyXp,
      coins: totals.coins + snapshot.legacyCoins,
    }),
    { points: 0, weeklyXp: 0, coins: 0 },
  );
}

export async function previewEconomicEpochCutover(params: {
  code?: string;
  startsAt: Date;
}): Promise<EconomicEpochCutoverPreview> {
  const code = params.code ?? ECONOMY_V2_EPOCH_CODE;
  const [snapshots, epoch, activeEpoch] = await Promise.all([
    loadActiveStudentSnapshots(prisma, params.startsAt),
    prisma.economicEpoch.findUnique({
      where: { code },
      include: { _count: { select: { participants: true } } },
    }),
    prisma.economicEpoch.findFirst({
      where: { status: EconomicEpochStatus.active },
      select: { id: true, code: true },
    }),
  ]);
  const blockers: string[] = [];
  if (activeEpoch && activeEpoch.code !== code) {
    blockers.push(`Уже активна другая экономическая эпоха: ${activeEpoch.code}`);
  }
  if (epoch && epoch.startsAt.getTime() !== params.startsAt.getTime()) {
    blockers.push("Существующая эпоха имеет другую дату начала");
  }
  if (epoch && (
    epoch.openingPoints !== ECONOMY_V2_OPENING_POINTS
    || epoch.openingWeeklyXp !== ECONOMY_V2_OPENING_WEEKLY_XP
    || epoch.openingCoins !== ECONOMY_V2_OPENING_COINS
  )) {
    blockers.push("Существующая эпоха имеет другую стартовую формулу");
  }

  const applied = Boolean(epoch?.activatedAt);
  const appliedSnapshots = applied && epoch
    ? await prisma.economicEpochParticipant.findMany({
        where: { epochId: epoch.id },
        select: {
          studentId: true,
          legacyPointsSnapshot: true,
          legacyWeeklyXpSnapshot: true,
          legacyCoinsSnapshot: true,
        },
      })
    : [];
  const effectiveSnapshots = appliedSnapshots.length
    ? appliedSnapshots.map((snapshot) => ({
        studentId: snapshot.studentId,
        legacyPoints: snapshot.legacyPointsSnapshot,
        legacyWeeklyXp: snapshot.legacyWeeklyXpSnapshot,
        legacyCoins: snapshot.legacyCoinsSnapshot,
      }))
    : snapshots;
  const legacyTotals = sumSnapshots(effectiveSnapshots);
  const openingStudentCount = applied ? epoch?._count.participants ?? 0 : snapshots.length;
  return {
    code,
    startsAt: params.startsAt,
    state: blockers.length ? "blocked" : applied ? "applied" : "ready",
    epochId: epoch?.id ?? null,
    activeStudents: snapshots.length,
    alreadyEnrolled: epoch?._count.participants ?? 0,
    legacyTotals,
    openingTotals: {
      points: openingStudentCount * ECONOMY_V2_OPENING_POINTS,
      weeklyXp: openingStudentCount * ECONOMY_V2_OPENING_WEEKLY_XP,
      coins: openingStudentCount * ECONOMY_V2_OPENING_COINS,
    },
    blockers,
  };
}

export async function applyEconomicEpochCutover(params: {
  code?: string;
  startsAt: Date;
}) {
  const code = params.code ?? ECONOMY_V2_EPOCH_CODE;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`economic-epoch:${code}`}))`;
    const existing = await tx.economicEpoch.findUnique({
      where: { code },
      include: { _count: { select: { participants: true } } },
    });
    const activeEpoch = await tx.economicEpoch.findFirst({
      where: { status: EconomicEpochStatus.active },
      select: { id: true, code: true },
    });
    if (activeEpoch && activeEpoch.code !== code) {
      throw new ConflictError(
        `Уже активна другая экономическая эпоха: ${activeEpoch.code}`,
        "ECONOMIC_EPOCH_ALREADY_ACTIVE",
      );
    }
    if (existing && existing.startsAt.getTime() !== params.startsAt.getTime()) {
      throw new ConflictError(
        "Существующая эпоха имеет другую дату начала",
        "ECONOMIC_EPOCH_CONFIG_MISMATCH",
      );
    }
    if (existing && (
      existing.openingPoints !== ECONOMY_V2_OPENING_POINTS
      || existing.openingWeeklyXp !== ECONOMY_V2_OPENING_WEEKLY_XP
      || existing.openingCoins !== ECONOMY_V2_OPENING_COINS
    )) {
      throw new ConflictError(
        "Существующая эпоха имеет другую стартовую формулу",
        "ECONOMIC_EPOCH_CONFIG_MISMATCH",
      );
    }
    if (existing?.activatedAt) {
      return {
        epochId: existing.id,
        code,
        participants: existing._count.participants,
        idempotent: true,
      };
    }

    const snapshots = await loadActiveStudentSnapshots(tx, params.startsAt);
    const activatedAt = new Date();
    const epoch = existing ?? await tx.economicEpoch.create({
      data: {
        code,
        name: ECONOMY_V2_EPOCH_NAME,
        startsAt: params.startsAt,
        status: EconomicEpochStatus.planned,
        openingPoints: ECONOMY_V2_OPENING_POINTS,
        openingWeeklyXp: ECONOMY_V2_OPENING_WEEKLY_XP,
        openingCoins: ECONOMY_V2_OPENING_COINS,
        sourceKey: epochSourceKey(code),
      },
    });

    for (const snapshot of snapshots) {
      await tx.economicEpochParticipant.create({
        data: {
          epochId: epoch.id,
          studentId: snapshot.studentId,
          openingPoints: ECONOMY_V2_OPENING_POINTS,
          openingWeeklyXp: ECONOMY_V2_OPENING_WEEKLY_XP,
          openingCoins: ECONOMY_V2_OPENING_COINS,
          openingLevel: 1,
          legacyPointsSnapshot: snapshot.legacyPoints,
          legacyWeeklyXpSnapshot: snapshot.legacyWeeklyXp,
          legacyCoinsSnapshot: snapshot.legacyCoins,
          sourceKey: participantSourceKey(code, snapshot.studentId),
          activatedAt,
        },
      });
      await tx.studentCoinBalance.upsert({
        where: { studentId: snapshot.studentId },
        update: {
          balance: ECONOMY_V2_OPENING_COINS,
          economicEpochId: epoch.id,
        },
        create: {
          studentId: snapshot.studentId,
          balance: ECONOMY_V2_OPENING_COINS,
          economicEpochId: epoch.id,
        },
      });
      await tx.maestroCoinTransaction.create({
        data: {
          economicEpochId: epoch.id,
          studentId: snapshot.studentId,
          amount: ECONOMY_V2_OPENING_COINS,
          transactionType: "adjustment",
          reason: "Стартовый баланс новой экономики Maestro",
          sourceType: "economic_epoch",
          sourceKey: openingCoinsSourceKey(code, snapshot.studentId),
          createdById: null,
          balanceBefore: 0,
          balanceAfter: ECONOMY_V2_OPENING_COINS,
        },
      });
    }

    await tx.economicEpoch.update({
      where: { id: epoch.id },
      data: {
        status: EconomicEpochStatus.active,
        activatedAt,
      },
    });
    await tx.auditLog.create({
      data: {
        entityType: "economic_epoch",
        entityId: epoch.id,
        action: "publish",
        payload: {
          code,
          startsAt: params.startsAt.toISOString(),
          activeStudents: snapshots.length,
          openingPoints: ECONOMY_V2_OPENING_POINTS,
          openingWeeklyXp: ECONOMY_V2_OPENING_WEEKLY_XP,
          openingCoins: ECONOMY_V2_OPENING_COINS,
          legacyTotals: sumSnapshots(snapshots),
        },
      },
    });

    return {
      epochId: epoch.id,
      code,
      participants: snapshots.length,
      idempotent: false,
    };
  }, { timeout: 30_000 });
}

export async function requireActiveEconomicEpochForEvent(eventAt: Date) {
  const epoch = await prisma.economicEpoch.findFirst({
    where: {
      status: EconomicEpochStatus.active,
      startsAt: { lte: eventAt },
    },
    orderBy: { startsAt: "desc" },
  });
  if (!epoch) {
    throw new ConflictError(
      "Новая экономическая эпоха ещё не активирована",
      "ECONOMIC_EPOCH_NOT_ACTIVE",
    );
  }
  return epoch;
}
