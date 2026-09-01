import { prisma } from "../src/infrastructure/database/prisma.js";
import { applyEconomicEpochCutover } from "../src/application/services/economic-epoch.service.js";
import {
  awardHomeworkAcceptedXp,
  awardLessonAttendanceXp,
  awardPreparedTestXp,
  finalizeWeeklyLeagueSnapshot,
} from "../src/application/services/weekly-league.service.js";
import { getAqtobeWeekRange } from "../src/application/services/weekly-league-policy.js";

const EPOCH_CODE = "e2e-economy-v2-ui";
const STARTS_AT = new Date("2026-08-01T00:00:00.000+05:00");
const QA_STUDENTS = [
  { id: "10000000-0000-4000-8000-000000000021", points: 1_600 },
  { id: "10000000-0000-4000-8000-000000000022", points: 1_600 },
  { id: "10000000-0000-4000-8000-000000000023", points: 300 },
] as const;

function assertLocalQaDatabase() {
  if (process.env.MAESTRO_QA_LOCAL !== "true") {
    throw new Error("Economy UI fixture blocked: MAESTRO_QA_LOCAL=true is required.");
  }
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1|postgres|db)(:|\/)/.test(databaseUrl)
    || /prod|production|neon|supabase|render/i.test(databaseUrl)) {
    throw new Error("Economy UI fixture blocked: DATABASE_URL is not local.");
  }
}

async function cleanup() {
  const epoch = await prisma.economicEpoch.findUnique({ where: { code: EPOCH_CODE } });
  if (!epoch) return;
  await prisma.$transaction(async (tx) => {
    await tx.pointsTransaction.deleteMany({ where: { economicEpochId: epoch.id } });
    await tx.weeklyLeagueSnapshotEntry.deleteMany({
      where: { snapshot: { economicEpochId: epoch.id } },
    });
    await tx.weeklyLeagueSnapshot.deleteMany({ where: { economicEpochId: epoch.id } });
    await tx.leagueXpEvent.deleteMany({ where: { economicEpochId: epoch.id } });
    await tx.weeklyLeagueAward.deleteMany({ where: { economicEpochId: epoch.id } });
    await tx.maestroCoinTransaction.deleteMany({ where: { economicEpochId: epoch.id } });
    await tx.studentCoinBalance.updateMany({
      where: { economicEpochId: epoch.id },
      data: { balance: 200, economicEpochId: null },
    });
    await tx.auditLog.deleteMany({
      where: { entityType: "economic_epoch", entityId: epoch.id },
    });
    await tx.economicEpoch.delete({ where: { id: epoch.id } });
  });
}

async function setup() {
  await cleanup();
  const activeEpoch = await prisma.economicEpoch.findFirst({
    where: { status: "active" },
    select: { code: true },
  });
  if (activeEpoch) {
    throw new Error(`Economy UI fixture blocked by active epoch ${activeEpoch.code}.`);
  }
  const result = await applyEconomicEpochCutover({ code: EPOCH_CODE, startsAt: STARTS_AT });
  const epoch = await prisma.economicEpoch.findUniqueOrThrow({ where: { code: EPOCH_CODE } });
  for (const student of QA_STUDENTS) {
    await prisma.pointsTransaction.create({
      data: {
        economicEpochId: epoch.id,
        studentId: student.id,
        amount: student.points,
        reason: "QA: проверка LEVEL и топа Points",
        sourceKey: `e2e:economy-v2-ui:points:${student.id}`,
      },
    });
  }
  const directions = await prisma.direction.findMany({
    orderBy: { createdAt: "asc" },
    take: 2,
    select: { id: true },
  });
  if (directions.length < 2) throw new Error("Economy UI fixture requires two QA directions.");
  const now = new Date();
  await awardLessonAttendanceXp({
    studentId: QA_STUDENTS[0].id,
    sourceType: "offline_lesson",
    sourceKey: "e2e:economy-v2-ui:xp:student-1:lesson",
    description: "Урок подтверждён",
    eventAt: now,
  });
  await awardHomeworkAcceptedXp({
    studentId: QA_STUDENTS[0].id,
    directionId: directions[0].id,
    sourceType: "learning_homework",
    sourceKey: "e2e:economy-v2-ui:xp:student-1:homework",
    description: "Домашнее задание принято",
    attemptNumber: 1,
    eventAt: new Date(now.getTime() + 1_000),
  });
  await awardPreparedTestXp({
    studentId: QA_STUDENTS[0].id,
    testId: "economy-v2-ui-student-1",
    attemptNumber: 1,
    testTitle: "Основы ритма",
    eventAt: new Date(now.getTime() + 2_000),
  });
  for (let index = 0; index < 2; index += 1) {
    await awardLessonAttendanceXp({
      studentId: QA_STUDENTS[1].id,
      sourceType: index === 0 ? "offline_lesson" : "online_lesson",
      sourceKey: `e2e:economy-v2-ui:xp:student-2:lesson:${index}`,
      description: "Урок подтверждён",
      eventAt: new Date(now.getTime() + (3 + index) * 1_000),
    });
  }
  await awardPreparedTestXp({
    studentId: QA_STUDENTS[2].id,
    testId: "economy-v2-ui-student-3",
    attemptNumber: 2,
    testTitle: "Ноты на грифе",
    eventAt: new Date(now.getTime() + 5_000),
  });

  const previousWeek = getAqtobeWeekRange(now, 1);
  const previousEventAt = new Date(previousWeek.start.getTime() + 24 * 60 * 60 * 1000);
  await awardLessonAttendanceXp({
    studentId: QA_STUDENTS[0].id,
    sourceType: "offline_lesson",
    sourceKey: "e2e:economy-v2-ui:xp:previous:lesson",
    description: "Урок прошлой недели",
    eventAt: previousEventAt,
  });
  await awardHomeworkAcceptedXp({
    studentId: QA_STUDENTS[0].id,
    directionId: directions[0].id,
    sourceType: "learning_homework",
    sourceKey: "e2e:economy-v2-ui:xp:previous:homework",
    description: "ДЗ прошлой недели принято",
    attemptNumber: 2,
    eventAt: new Date(previousEventAt.getTime() + 1_000),
  });
  await finalizeWeeklyLeagueSnapshot({
    week: previousWeek,
    economicEpochId: epoch.id,
    finalizedAt: new Date(),
  });
  console.log(`Economy UI fixture ready: ${result.participants} participants.`);
}

async function main() {
  assertLocalQaDatabase();
  if (process.argv.includes("--cleanup")) {
    await cleanup();
    console.log("Economy UI fixture removed.");
    return;
  }
  await setup();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
