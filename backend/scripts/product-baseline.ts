/**
 * Read-only inventory for the product-map migration.
 *
 * The script never mutates data and never prints student identity fields.
 * Usage: npm run product:inventory
 */
import { PrismaClient } from "@prisma/client";
import { getProductFeatureSnapshot } from "../src/config/product-features.js";
import {
  PRODUCT_LEVELS,
  getProductLevel,
  simulateLearningPace,
} from "../src/domain/product-economy-v2.js";
import { normalizeMonthlyPlanItems } from "../src/domain/monthly-plan.js";

const prisma = new PrismaClient();

function sourceTotals<T extends string>(
  rows: Array<{ sourceType: T; _count: { _all: number }; _sum: { amount: number | null } }>,
) {
  return Object.fromEntries(rows.map((row) => [row.sourceType, {
    events: row._count._all,
    amount: row._sum.amount ?? 0,
  }]));
}

async function main() {
  const activeEpoch = await prisma.economicEpoch.findFirst({
    where: { status: "active" },
    include: { _count: { select: { participants: true } } },
  });
  const economicEpochScope = { economicEpochId: activeEpoch?.id ?? null };
  const [
    activeStudents,
    inactiveStudents,
    archivedStudents,
    pointBalances,
    pointsTransactions,
    pointAmount,
    pointsMissingSourceKey,
    pointsLinkedToLesson,
    negativePointCorrections,
    coinBalances,
    coinLedgerBalances,
    coinTransactions,
    coinAmount,
    coinsMissingSourceKey,
    xpBySource,
    coinsBySource,
    weeklyAwards,
    lessonsWithDirectPoints,
    offlineChecksWithDirectPoints,
    onlineLessonsWithDirectRewards,
    assignmentsWithDirectPoints,
    assignmentReviewsWithCoins,
    coursesOutsideTargetRewardRange,
    studentPlans,
    groupPlans,
    rewardItems,
    economicEpochs,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { role: { slug: "student" }, isActive: true, deletedAt: null },
      select: { id: true },
    }),
    prisma.user.count({
      where: { role: { slug: "student" }, isActive: false, deletedAt: null },
    }),
    prisma.user.count({
      where: { role: { slug: "student" }, deletedAt: { not: null } },
    }),
    prisma.pointsTransaction.groupBy({
      by: ["studentId"],
      where: economicEpochScope,
      _sum: { amount: true },
    }),
    prisma.pointsTransaction.count({ where: economicEpochScope }),
    prisma.pointsTransaction.aggregate({ where: economicEpochScope, _sum: { amount: true } }),
    prisma.pointsTransaction.count({ where: { ...economicEpochScope, sourceKey: null } }),
    prisma.pointsTransaction.count({ where: { ...economicEpochScope, lessonId: { not: null } } }),
    prisma.pointsTransaction.count({ where: { ...economicEpochScope, amount: { lt: 0 } } }),
    prisma.studentCoinBalance.findMany({
      where: economicEpochScope,
      select: { studentId: true, balance: true },
    }),
    prisma.maestroCoinTransaction.groupBy({
      by: ["studentId"],
      where: economicEpochScope,
      _sum: { amount: true },
    }),
    prisma.maestroCoinTransaction.count({ where: economicEpochScope }),
    prisma.maestroCoinTransaction.aggregate({ where: economicEpochScope, _sum: { amount: true } }),
    prisma.maestroCoinTransaction.count({ where: { ...economicEpochScope, sourceKey: null } }),
    prisma.leagueXpEvent.groupBy({
      by: ["sourceType"],
      where: economicEpochScope,
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.maestroCoinTransaction.groupBy({
      by: ["sourceType"],
      where: economicEpochScope,
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.weeklyLeagueAward.groupBy({
      by: ["awardType"],
      where: economicEpochScope,
      _count: { _all: true },
      _sum: { coins: true, xp: true },
    }),
    prisma.lesson.count({ where: { pointsReward: { gt: 0 }, deletedAt: null } }),
    prisma.offlineLessonStudentCheck.count({ where: { lessonPoints: { gt: 0 } } }),
    prisma.onlineLessonRequest.count({
      where: { OR: [{ lessonPoints: { gt: 0 } }, { lessonCoins: { gt: 0 } }] },
    }),
    prisma.onlineLessonAssignment.count({ where: { pointsReward: { gt: 0 } } }),
    prisma.onlineLessonAssignmentSubmission.count({ where: { reviewCoins: { gt: 0 } } }),
    prisma.course.count({
      where: {
        deletedAt: null,
        OR: [{ completionCoinsReward: { lt: 0 } }, { completionCoinsReward: { gt: 100 } }],
      },
    }),
    prisma.studentMonthlyPlan.findMany({
      select: { items: true, publishedAt: true },
    }),
    prisma.groupMonthlyPlan.findMany({
      select: { items: true, publishedAt: true },
    }),
    prisma.rewardCatalogItem.findMany({
      select: { costCoins: true, stock: true, isActive: true },
    }),
    prisma.economicEpoch.findMany({
      orderBy: { startsAt: "asc" },
      select: {
        code: true,
        status: true,
        startsAt: true,
        activatedAt: true,
        openingPoints: true,
        openingWeeklyXp: true,
        openingCoins: true,
        _count: { select: { participants: true } },
      },
    }),
  ]);

  const pointBalanceByStudent = new Map(
    pointBalances.map((row) => [row.studentId, row._sum.amount ?? 0]),
  );
  const projectedLevelDistribution = Object.fromEntries(
    PRODUCT_LEVELS.map((level) => [level.title, 0]),
  );
  for (const student of activeStudents) {
    const level = getProductLevel(pointBalanceByStudent.get(student.id) ?? 0).level.title;
    projectedLevelDistribution[level] += 1;
  }

  const storedCoins = new Map(coinBalances.map((row) => [row.studentId, row.balance]));
  const ledgerCoins = new Map(
    coinLedgerBalances.map((row) => [row.studentId, row._sum.amount ?? 0]),
  );
  const coinStudents = new Set([...storedCoins.keys(), ...ledgerCoins.keys()]);
  const coinBalanceMismatches = [...coinStudents].filter(
    (studentId) => (storedCoins.get(studentId) ?? 0) !== (ledgerCoins.get(studentId) ?? 0),
  ).length;

  const studentPlanItems = studentPlans.map((plan) => normalizeMonthlyPlanItems(plan.items));
  const groupPlanItems = groupPlans.map((plan) => normalizeMonthlyPlanItems(plan.items));
  const allPlanItems = [...studentPlanItems, ...groupPlanItems];
  const planTopicCounts = allPlanItems.map((items) => items.length);

  const targetConflicts = {
    lessonsWithDirectPoints,
    offlineChecksWithDirectPoints,
    onlineLessonsWithDirectRewards,
    assignmentsWithDirectPoints,
    assignmentReviewsWithCoins,
    coursesOutsideTargetRewardRange,
  };
  const targetConflictCount = Object.values(targetConflicts).reduce((sum, count) => sum + count, 0);

  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    mode: "read-only",
    productFeatures: getProductFeatureSnapshot(),
    students: {
      active: activeStudents.length,
      inactive: inactiveStudents,
      archived: archivedStudents,
    },
    economicEpochs: {
      currentScope: activeEpoch?.code ?? "legacy",
      entries: economicEpochs.map((epoch) => ({
        code: epoch.code,
        status: epoch.status,
        startsAt: epoch.startsAt.toISOString(),
        activatedAt: epoch.activatedAt?.toISOString() ?? null,
        participants: epoch._count.participants,
        openingPoints: epoch.openingPoints,
        openingWeeklyXp: epoch.openingWeeklyXp,
        openingCoins: epoch.openingCoins,
      })),
    },
    points: {
      transactions: pointsTransactions,
      ledgerAmount: pointAmount._sum.amount ?? 0,
      transactionsMissingSourceKey: pointsMissingSourceKey,
      transactionsLinkedToLegacyLesson: pointsLinkedToLesson,
      correctionTransactions: negativePointCorrections,
      projectedLevelDistribution,
    },
    weeklyXp: {
      bySource: sourceTotals(xpBySource),
      finalizedAwards: Object.fromEntries(weeklyAwards.map((row) => [row.awardType, {
        awards: row._count._all,
        xp: row._sum.xp ?? 0,
        coins: row._sum.coins ?? 0,
      }])),
    },
    coins: {
      transactions: coinTransactions,
      ledgerAmount: coinAmount._sum.amount ?? 0,
      storedBalanceAmount: coinBalances.reduce((sum, row) => sum + row.balance, 0),
      balanceMismatchesInCurrentScope: coinBalanceMismatches,
      legacyMismatchesResetAtCutover: activeEpoch ? 0 : coinBalanceMismatches,
      transactionsMissingSourceKey: coinsMissingSourceKey,
      bySource: sourceTotals(coinsBySource),
    },
    plans: {
      studentPlans: studentPlans.length,
      publishedStudentPlans: studentPlans.filter((plan) => plan.publishedAt !== null).length,
      groupPlans: groupPlans.length,
      publishedGroupPlans: groupPlans.filter((plan) => plan.publishedAt !== null).length,
      emptyPlans: planTopicCounts.filter((count) => count === 0).length,
      plansWithEightTopics: planTopicCounts.filter((count) => count === 8).length,
      minimumTopics: planTopicCounts.length ? Math.min(...planTopicCounts) : 0,
      maximumTopics: planTopicCounts.length ? Math.max(...planTopicCounts) : 0,
    },
    rewardsCatalog: {
      items: rewardItems.length,
      activeItems: rewardItems.filter((item) => item.isActive).length,
      itemsBelow500Coins: rewardItems.filter((item) => item.costCoins < 500).length,
      itemsWithoutStockLimit: rewardItems.filter((item) => item.stock === null).length,
    },
    targetConflicts,
    simulations: [4, 8, 12].map((topics) => simulateLearningPace(topics)),
    migrationReadiness: {
      dataIntegrityBlockers: activeEpoch ? coinBalanceMismatches : 0,
      targetBehaviorConflicts: targetConflictCount,
      decisionBlockers: [],
      completedPackages: [
        "DEV-00",
        "DEV-01A",
        "DEV-01B",
        "DEV-02",
        "DEV-03A",
        "DEV-03B",
        "DEV-04A",
        "DEV-04B",
        "DEV-05A",
      ],
      nextPackage: "DEV-05B",
      operationalInputs: [
        "production cutover remains blocked until a separate approved dry-run against the active CRM student checksum",
      ],
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error("PRODUCT BASELINE FAILED:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
