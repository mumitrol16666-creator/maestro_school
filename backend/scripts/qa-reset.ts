import { PrismaClient } from "@prisma/client";
import { assertLocalQaDatabase } from "./qa-database-guard.js";

const prisma = new PrismaClient();
const CLASS_PREFIX = "QA-RUN-CLASS-";

async function main() {
  assertLocalQaDatabase();

  const reports = await prisma.offlineLessonReport.findMany({
    where: { crmClassId: { startsWith: CLASS_PREFIX } },
    select: { id: true },
  });
  const reportIds = reports.map((report) => report.id);
  const journalEntries = await prisma.adminJournalEntry.findMany({
    where: {
      OR: [
        { linkedEntityId: { startsWith: CLASS_PREFIX } },
        { sourceKey: { contains: CLASS_PREFIX } },
      ],
    },
    select: { id: true },
  });

  const result = await prisma.$transaction(async (tx) => {
    const deleted = {
      reports: reportIds.length,
      checks: 0,
      projections: 0,
      outbox: 0,
      conflicts: 0,
      xp: 0,
      points: 0,
      coins: 0,
      activity: 0,
    };

    if (reportIds.length > 0) {
      await tx.offlineLessonDraft.deleteMany({ where: { reportId: { in: reportIds } } });
      await tx.offlineLessonReportVersion.deleteMany({ where: { reportId: { in: reportIds } } });
      await tx.offlineLessonReport.deleteMany({ where: { id: { in: reportIds } } });
    }

    deleted.checks = (await tx.offlineLessonStudentCheck.deleteMany({
      where: { crmClassId: { startsWith: CLASS_PREFIX } },
    })).count;
    deleted.conflicts = (await tx.crmSyncConflict.deleteMany({
      where: { crmClassId: { startsWith: CLASS_PREFIX } },
    })).count;
    deleted.outbox = (await tx.crmOutboxEvent.deleteMany({
      where: { aggregateId: { startsWith: CLASS_PREFIX } },
    })).count;
    deleted.projections = (await tx.offlineLessonProjection.deleteMany({
      where: { crmClassId: { startsWith: CLASS_PREFIX } },
    })).count;
    deleted.xp = (await tx.leagueXpEvent.deleteMany({
      where: { sourceKey: { contains: CLASS_PREFIX } },
    })).count;
    deleted.points = (await tx.pointsTransaction.deleteMany({
      where: { sourceKey: { contains: CLASS_PREFIX } },
    })).count;
    deleted.coins = (await tx.maestroCoinTransaction.deleteMany({
      where: { sourceKey: { contains: CLASS_PREFIX } },
    })).count;
    deleted.activity = (await tx.weeklyLeagueActivityEvent.deleteMany({
      where: { sourceKey: { contains: CLASS_PREFIX } },
    })).count;
    await tx.learningTopicProgress.deleteMany({
      where: { sourceKey: { contains: CLASS_PREFIX } },
    });
    await tx.userNotification.deleteMany({
      where: { dedupeKey: { contains: CLASS_PREFIX } },
    });
    await tx.auditLog.deleteMany({
      where: { entityId: { startsWith: CLASS_PREFIX } },
    });
    if (journalEntries.length > 0) {
      await tx.adminJournalEntry.deleteMany({
        where: { id: { in: journalEntries.map((entry) => entry.id) } },
      });
    }

    return deleted;
  });

  console.log(JSON.stringify({ database: "maestro_regression", prefix: CLASS_PREFIX, deleted: result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
