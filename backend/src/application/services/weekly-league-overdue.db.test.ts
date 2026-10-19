import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.FEATURE_REWARD_ECONOMY_V2 = "true";
process.env.PRODUCT_V2_CUTOVER_AT = "2026-01-01T00:00:00.000Z";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function withActiveEpoch<T>(run: (epoch: { id: string; code: string; startsAt: Date }) => Promise<T>) {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const existing = await prisma.economicEpoch.findFirst({ where: { status: "active" } });
  if (existing) return run(existing);
  const suffix = randomUUID().slice(0, 8);
  const epoch = await prisma.economicEpoch.create({
    data: {
      code: `overdue-${suffix}`,
      name: "Тестовая активная эпоха",
      startsAt: new Date(Date.now() - 6 * WEEK_MS),
      status: "active",
      sourceKey: `overdue-epoch:${suffix}`,
      activatedAt: new Date(Date.now() - 6 * WEEK_MS),
    },
  });
  try {
    return await run(epoch);
  } finally {
    await prisma.weeklyLeagueSnapshot.deleteMany({ where: { economicEpochId: epoch.id } });
    await prisma.economicEpoch.delete({ where: { id: epoch.id } });
  }
}

async function createStudent(suffix: string) {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const role = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  return prisma.user.create({
    data: {
      login: `overdue_${suffix}`,
      phone: `+7701${suffix.replace(/\D/g, "").padEnd(7, "2").slice(0, 7)}`,
      passwordHash: "x",
      firstName: "Лига",
      lastName: suffix,
      roleId: role.id,
      crmStudentId: `crm-overdue-${suffix}`,
    },
  });
}

integrationTest("the finalizer closes every overdue week of the epoch, oldest first, and stays idempotent", async t => {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { finalizeOverdueWeeklyLeagues } = await import("./weekly-league.service.js");
  const { getAqtobeWeekRange, weeklyLeagueFinalizesAt } = await import("./weekly-league-policy.js");
  await withActiveEpoch(async (epoch) => {
    const suffix = randomUUID().slice(0, 8);
    const student = await createStudent(suffix);
    await prisma.economicEpochParticipant.create({
      data: { epochId: epoch.id, studentId: student.id, sourceKey: `overdue-participant:${suffix}`, activatedAt: epoch.startsAt },
    });
    const now = new Date();
    const weeks = [3, 2].map((offset) => getAqtobeWeekRange(now, offset));
    for (const [index, week] of weeks.entries()) {
      await prisma.leagueXpEvent.create({
        data: {
          economicEpochId: epoch.id,
          studentId: student.id,
          amount: 20,
          sourceType: "offline_lesson",
          sourceKey: `overdue-xp:${suffix}:${index}`,
          description: "Посещение",
          createdAt: new Date(week.start.getTime() + 60_000),
          recordedAt: new Date(week.start.getTime() + 60_000),
        },
      });
    }
    const existingSnapshots = await prisma.weeklyLeagueSnapshot.findMany({
      where: { economicEpochId: epoch.id },
      select: { weekStart: true },
    });
    const alreadyClosed = new Set(existingSnapshots.map((row) => row.weekStart.getTime()));
    t.after(async () => {
      await prisma.weeklyLeagueSnapshot.deleteMany({
        where: { economicEpochId: epoch.id, weekStart: { notIn: [...alreadyClosed].map((ms) => new Date(ms)) } },
      });
      await prisma.user.delete({ where: { id: student.id } });
    });

    const results = await finalizeOverdueWeeklyLeagues(now);
    const closedNow = results.filter((row) => !row.idempotent);
    const expected = Array.from({ length: 52 }, (_, index) => index + 1)
      .map((offset) => getAqtobeWeekRange(now, offset))
      // The week just ended stays open for 12 hours (Monday morning in Aqtobe).
      .filter((week) => week.end > epoch.startsAt && now >= weeklyLeagueFinalizesAt(week) && !alreadyClosed.has(week.start.getTime()))
      .map((week) => week.key)
      .reverse();
    assert.deepEqual(closedNow.map((row) => row.week), expected);
    const [oldest] = closedNow;
    assert.ok(oldest, "at least one overdue week was closed");

    const again = await finalizeOverdueWeeklyLeagues(now);
    assert.equal(again.filter((row) => !row.idempotent).length, 0);
  });
});

integrationTest("a wallet without an epoch is adopted on credit and the opening balance is added, not overwritten", async t => {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { creditMaestroCoinsInTransaction } = await import("./coins.service.js");
  const { ensureActiveEconomicEpochParticipant } = await import("./economic-epoch.service.js");
  await withActiveEpoch(async (epoch) => {
    const suffix = randomUUID().slice(0, 8);
    const student = await createStudent(suffix);
    t.after(async () => {
      await prisma.maestroCoinTransaction.deleteMany({ where: { studentId: student.id } });
      await prisma.studentCoinBalance.deleteMany({ where: { studentId: student.id } });
      await prisma.auditLog.deleteMany({ where: { entityType: "economic_epoch_participant", payload: { path: ["studentId"], equals: student.id } } });
      await prisma.economicEpochParticipant.deleteMany({ where: { studentId: student.id } });
      await prisma.user.delete({ where: { id: student.id } });
    });
    // Legacy wallet: coins from before the epoch, never opened in it.
    await prisma.studentCoinBalance.create({ data: { studentId: student.id, balance: 999, economicEpochId: null } });

    const credit = await prisma.$transaction((tx) => creditMaestroCoinsInTransaction(tx, {
      economicEpochId: epoch.id,
      studentId: student.id,
      amount: 50,
      reason: "Посещение",
      sourceType: "offline_lesson",
      sourceKey: `overdue-coins:${suffix}`,
      eventAt: new Date(),
    }));
    assert.equal(credit.awarded, true);
    assert.equal(credit.balance, 50, "legacy balance is not carried into the epoch");
    const adopted = await prisma.studentCoinBalance.findUniqueOrThrow({ where: { studentId: student.id } });
    assert.equal(adopted.economicEpochId, epoch.id);

    const entry = await ensureActiveEconomicEpochParticipant(student.id);
    assert.equal(entry?.created, true);
    const wallet = await prisma.studentCoinBalance.findUniqueOrThrow({ where: { studentId: student.id } });
    assert.equal(wallet.balance, 250, "opening coins are added on top of coins already earned in the epoch");
    const opening = await prisma.maestroCoinTransaction.findFirst({
      where: { studentId: student.id, sourceType: "economic_epoch" },
    });
    assert.equal(opening?.balanceBefore, 50);
    assert.equal(opening?.balanceAfter, 250);
    const ledger = await prisma.maestroCoinTransaction.aggregate({ where: { studentId: student.id, economicEpochId: epoch.id }, _sum: { amount: true } });
    assert.equal(ledger._sum.amount, wallet.balance, "wallet cache equals the epoch ledger");
  });
});
