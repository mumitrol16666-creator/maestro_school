import assert from "node:assert/strict";
import { EconomicEpochStatus } from "@prisma/client";
import { loadProductFeatureConfig } from "../src/config/product-features.js";
import {
  applyEconomicEpochCutover,
  ECONOMY_V2_OPENING_COINS,
  previewEconomicEpochCutover,
} from "../src/application/services/economic-epoch.service.js";
import { prisma } from "../src/infrastructure/database/prisma.js";
import { assertLocalE2eDatabase } from "./qa-database-guard.js";

const EPOCH_CODE = "e2e-economy-v2-cutover";
const INACTIVE_STUDENT_ID = "10000000-0000-4000-8000-000000000024";
const LEGACY_STUDENT_ID = "10000000-0000-4000-8000-000000000021";

async function removeTestEpoch() {
  const epoch = await prisma.economicEpoch.findUnique({ where: { code: EPOCH_CODE } });
  if (!epoch) return;
  await prisma.$transaction(async (tx) => {
    await tx.weeklyLeagueSnapshotEntry.deleteMany({
      where: { snapshot: { economicEpochId: epoch.id } },
    });
    await tx.weeklyLeagueSnapshot.deleteMany({ where: { economicEpochId: epoch.id } });
    await tx.auditLog.deleteMany({ where: { entityType: "economic_epoch", entityId: epoch.id } });
    await tx.maestroCoinTransaction.deleteMany({ where: { economicEpochId: epoch.id } });
    await tx.studentCoinBalance.updateMany({
      where: { economicEpochId: epoch.id },
      data: { economicEpochId: null },
    });
    await tx.economicEpoch.delete({ where: { id: epoch.id } });
  });
}

async function main() {
  assertLocalE2eDatabase();
  const startsAt = loadProductFeatureConfig().cutoverAt;
  await removeTestEpoch();

  const [originalBalances, originalActiveEpochs] = await Promise.all([
    prisma.studentCoinBalance.findMany({
      select: { studentId: true, balance: true, economicEpochId: true },
    }),
    prisma.economicEpoch.findMany({
      where: { status: EconomicEpochStatus.active },
      select: { id: true },
    }),
  ]);
  try {
    if (originalActiveEpochs.length > 0) {
      await prisma.economicEpoch.updateMany({
        where: { id: { in: originalActiveEpochs.map((epoch) => epoch.id) } },
        data: { status: EconomicEpochStatus.archived },
      });
    }

    const activeStudents = await prisma.user.findMany({
      where: { role: { slug: "student" }, isActive: true, deletedAt: null },
      select: { id: true },
    });
    const expectedLegacyPoints = await prisma.pointsTransaction.aggregate({
      where: {
        studentId: LEGACY_STUDENT_ID,
        economicEpochId: null,
        createdAt: { lt: startsAt },
      },
      _sum: { amount: true },
    });
    const before = await previewEconomicEpochCutover({ code: EPOCH_CODE, startsAt });
    assert.equal(before.state, "ready");
    assert.equal(before.activeStudents, activeStudents.length);
    assert.equal(before.alreadyEnrolled, 0);
    assert.equal(before.openingTotals.points, 0);
    assert.equal(before.openingTotals.weeklyXp, 0);
    assert.equal(before.openingTotals.coins, activeStudents.length * ECONOMY_V2_OPENING_COINS);

    const first = await applyEconomicEpochCutover({ code: EPOCH_CODE, startsAt });
    assert.equal(first.idempotent, false);
    assert.equal(first.participants, activeStudents.length);

    const epoch = await prisma.economicEpoch.findUniqueOrThrow({
      where: { code: EPOCH_CODE },
      include: { participants: true },
    });
    assert.equal(epoch.status, "active");
    assert.equal(epoch.participants.length, activeStudents.length);
    assert.equal(epoch.participants.some((participant) => participant.studentId === INACTIVE_STUDENT_ID), false);

    const legacyParticipant = epoch.participants.find(
      (participant) => participant.studentId === LEGACY_STUDENT_ID,
    );
    assert.ok(legacyParticipant);
    assert.equal(legacyParticipant.openingPoints, 0);
    assert.equal(legacyParticipant.openingWeeklyXp, 0);
    assert.equal(legacyParticipant.openingCoins, 200);
    assert.equal(legacyParticipant.openingLevel, 1);
    assert.equal(
      legacyParticipant.legacyPointsSnapshot,
      expectedLegacyPoints._sum.amount ?? 0,
    );

    const legacyPoints = await prisma.pointsTransaction.findUniqueOrThrow({
      where: { sourceKey: "qa:legacy-points:student-1" },
    });
    assert.equal(legacyPoints.economicEpochId, null);

    const openingTransactions = await prisma.maestroCoinTransaction.findMany({
      where: { economicEpochId: epoch.id },
    });
    assert.equal(openingTransactions.length, activeStudents.length);
    assert.ok(openingTransactions.every((transaction) => (
      transaction.amount === 200
      && transaction.balanceBefore === 0
      && transaction.balanceAfter === 200
      && transaction.sourceType === "economic_epoch"
      && transaction.createdById === null
    )));
    assert.equal(await prisma.auditLog.count({
      where: { entityType: "economic_epoch", entityId: epoch.id, action: "publish" },
    }), 1);

    await prisma.studentCoinBalance.update({
      where: { studentId: LEGACY_STUDENT_ID },
      data: { balance: 137 },
    });
    const second = await applyEconomicEpochCutover({ code: EPOCH_CODE, startsAt });
    assert.equal(second.idempotent, true);
    assert.equal(await prisma.studentCoinBalance.findUniqueOrThrow({
      where: { studentId: LEGACY_STUDENT_ID },
    }).then((balance) => balance.balance), 137);
    assert.equal(await prisma.maestroCoinTransaction.count({
      where: { economicEpochId: epoch.id },
    }), activeStudents.length);
    assert.equal(await prisma.auditLog.count({
      where: { entityType: "economic_epoch", entityId: epoch.id },
    }), 1);

    const after = await previewEconomicEpochCutover({ code: EPOCH_CODE, startsAt });
    assert.equal(after.state, "applied");
    assert.equal(after.alreadyEnrolled, activeStudents.length);
    const mismatchedStart = new Date(startsAt.getTime() + 60_000);
    const mismatchedPreview = await previewEconomicEpochCutover({
      code: EPOCH_CODE,
      startsAt: mismatchedStart,
    });
    assert.equal(mismatchedPreview.state, "blocked");
    await assert.rejects(
      applyEconomicEpochCutover({ code: EPOCH_CODE, startsAt: mismatchedStart }),
      (error: unknown) => (
        typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === "ECONOMIC_EPOCH_CONFIG_MISMATCH"
      ),
    );
    await assert.rejects(
      applyEconomicEpochCutover({ code: `${EPOCH_CODE}-second`, startsAt }),
      (error: unknown) => (
        typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === "ECONOMIC_EPOCH_ALREADY_ACTIVE"
      ),
    );
    assert.equal(await prisma.economicEpoch.count({
      where: { status: EconomicEpochStatus.active },
    }), 1);
    console.log("Economy V2 cutover E2E passed.");
  } finally {
    await removeTestEpoch();
    await prisma.$transaction(async (tx) => {
      for (const balance of originalBalances) {
        await tx.studentCoinBalance.updateMany({
          where: { studentId: balance.studentId },
          data: {
            balance: balance.balance,
            economicEpochId: balance.economicEpochId,
          },
        });
      }
      if (originalActiveEpochs.length > 0) {
        await tx.economicEpoch.updateMany({
          where: { id: { in: originalActiveEpochs.map((epoch) => epoch.id) } },
          data: { status: EconomicEpochStatus.active },
        });
      }
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
