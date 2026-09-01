import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EconomicEpochStatus } from "@prisma/client";
import { applyEconomicEpochCutover } from "../src/application/services/economic-epoch.service.js";
import { reviewLearningHomework } from "../src/application/services/learning-homework-v2.service.js";
import { completeOnlineLessonRequest } from "../src/application/services/online-lessons.service.js";
import {
  awardHomeworkAcceptedXp,
  awardLeagueXp,
  awardLessonAttendanceXp,
  awardPreparedTestXp,
  awardTeacherLeagueBonus,
  createWeeklyStreakProtection,
  finalizeWeeklyLeagueSnapshot,
  getWeeklyLeagueHistory,
  getWeeklyLeagueOverview,
} from "../src/application/services/weekly-league.service.js";
import { getAqtobeWeekRange } from "../src/application/services/weekly-league-policy.js";
import { prisma } from "../src/infrastructure/database/prisma.js";
import { assertLocalE2eDatabase } from "./qa-database-guard.js";

const EPOCH_CODE = "e2e-economy-v2-weekly-league";
const EPOCH_START = new Date("2026-08-01T00:00:00.000+05:00");
const STUDENT_ONE = "10000000-0000-4000-8000-000000000021";
const STUDENT_TWO = "10000000-0000-4000-8000-000000000022";
const STUDENT_THREE = "10000000-0000-4000-8000-000000000023";
const CURRENT_WEEK_NOW = new Date();
const createdRequestIds: string[] = [];
const createdHomeworkIds: string[] = [];
const createdRecipientIds: string[] = [];

async function cleanupEpoch(originalBalances?: Array<{
  studentId: string;
  balance: number;
  economicEpochId: string | null;
}>) {
  if (createdRequestIds.length) {
    await prisma.onlineLessonRequest.deleteMany({ where: { id: { in: createdRequestIds } } });
    createdRequestIds.length = 0;
  }
  if (createdRecipientIds.length) {
    await prisma.userNotification.deleteMany({
      where: { OR: createdRecipientIds.map((id) => ({ dedupeKey: { contains: id } })) },
    });
    createdRecipientIds.length = 0;
  }
  if (createdHomeworkIds.length) {
    await prisma.learningHomeworkAssignment.deleteMany({ where: { id: { in: createdHomeworkIds } } });
    createdHomeworkIds.length = 0;
  }
  const epoch = await prisma.economicEpoch.findUnique({ where: { code: EPOCH_CODE } });
  if (epoch) {
    await prisma.$transaction(async (tx) => {
      await tx.weeklyLeagueSnapshotEntry.deleteMany({
        where: { snapshot: { economicEpochId: epoch.id } },
      });
      await tx.weeklyLeagueSnapshot.deleteMany({ where: { economicEpochId: epoch.id } });
      await tx.weeklyLeagueAward.deleteMany({ where: { economicEpochId: epoch.id } });
      await tx.leagueXpEvent.deleteMany({ where: { economicEpochId: epoch.id } });
      await tx.pointsTransaction.deleteMany({ where: { economicEpochId: epoch.id } });
      await tx.maestroCoinTransaction.deleteMany({ where: { economicEpochId: epoch.id } });
      await tx.studentCoinBalance.updateMany({
        where: { economicEpochId: epoch.id },
        data: { economicEpochId: null },
      });
      await tx.auditLog.deleteMany({ where: { entityType: "economic_epoch", entityId: epoch.id } });
      await tx.economicEpoch.delete({ where: { id: epoch.id } });
    });
  }
  if (originalBalances) {
    const originalIds = new Set(originalBalances.map((balance) => balance.studentId));
    await prisma.studentCoinBalance.deleteMany({ where: { studentId: { notIn: [...originalIds] } } });
    for (const balance of originalBalances) {
      await prisma.studentCoinBalance.upsert({
        where: { studentId: balance.studentId },
        create: balance,
        update: { balance: balance.balance, economicEpochId: balance.economicEpochId },
      });
    }
  }
}

async function main() {
  assertLocalE2eDatabase();
  await cleanupEpoch();
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
    const activeEpoch = await prisma.economicEpoch.findFirst({ where: { status: "active" } });
    if (activeEpoch) throw new Error(`Active test epoch must be removed first: ${activeEpoch.code}`);
    const [studentOne, studentTwo, teacher, admin, directions, learningTopic] = await Promise.all([
      prisma.user.findUnique({ where: { id: STUDENT_ONE }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: STUDENT_TWO }, select: { id: true } }),
      prisma.user.findFirst({
        where: { role: { slug: "teacher" }, isActive: true, deletedAt: null },
        select: { id: true },
      }),
      prisma.user.findFirst({
        where: { role: { slug: "admin" }, isActive: true, deletedAt: null },
        select: { id: true },
      }),
      prisma.direction.findMany({ orderBy: { createdAt: "asc" }, take: 2, select: { id: true, title: true } }),
      prisma.learningTopic.findFirst({ where: { archivedAt: null }, select: { id: true, directionId: true } }),
    ]);
    assert.ok(studentOne && studentTwo && teacher && admin && learningTopic);
    assert.equal(directions.length, 2);

    const cutover = await applyEconomicEpochCutover({ code: EPOCH_CODE, startsAt: EPOCH_START });
    const epoch = await prisma.economicEpoch.findUniqueOrThrow({ where: { code: EPOCH_CODE } });
    assert.equal(cutover.idempotent, false);
    await prisma.economicEpochParticipant.updateMany({
      where: { epochId: epoch.id },
      data: { activatedAt: EPOCH_START },
    });

    const teachingLink = await prisma.onlineLessonRequest.create({
      data: {
        studentId: STUDENT_ONE,
        teacherId: teacher.id,
        directionId: directions[0].id,
        directionTitle: directions[0].title,
        level: "QA",
        preferredTime: "QA weekly league",
        status: "assigned",
      },
      select: { id: true },
    });
    createdRequestIds.push(teachingLink.id);

    await assert.rejects(
      completeOnlineLessonRequest(teachingLink.id, {
        completedBy: admin.id,
        coveredTopics: "QA manual rewards guard",
        whatWorked: "QA",
        whatToImprove: "QA",
        lessonPoints: 100,
        lessonCoins: 100,
        lessonCoinsReason: "QA must be blocked",
        createAssignment: true,
        assignment: {
          title: "QA blocked legacy rewards",
          description: "QA",
          submissionFormat: "text",
          pointsReward: 100,
        },
      }),
      (error: unknown) => Boolean(
        error && typeof error === "object" && "code" in error
        && error.code === "LEGACY_ONLINE_REWARDS_DISABLED"
      ),
    );
    assert.equal(
      (await prisma.onlineLessonRequest.findUniqueOrThrow({ where: { id: teachingLink.id } })).status,
      "assigned",
    );

    await prisma.leagueXpEvent.create({
      data: {
        studentId: STUDENT_ONE,
        amount: 999,
        sourceType: "offline_lesson",
        sourceKey: "e2e:weekly-league-v2:legacy-isolation",
        description: "Legacy XP must stay outside the active epoch",
        createdAt: CURRENT_WEEK_NOW,
      },
    });

    const lessonResults = [];
    for (let index = 0; index < 3; index += 1) {
      lessonResults.push(await awardLessonAttendanceXp({
        studentId: STUDENT_ONE,
        sourceType: index === 1 ? "online_lesson" : "offline_lesson",
        sourceKey: `e2e:weekly-league-v2:lesson:${index}`,
        description: `QA lesson ${index}`,
        eventAt: new Date(CURRENT_WEEK_NOW.getTime() + index * 60_000),
      }));
    }
    assert.deepEqual(lessonResults.map((result) => result.amount), [20, 20, 0]);
    assert.deepEqual(lessonResults.map((result) => result.coins ?? 0), [50, 50, 0]);
    assert.equal(lessonResults[2].status, "weekly_limit");
    assert.equal(await prisma.weeklyLeagueActivityEvent.count({
      where: {
        economicEpochId: epoch.id,
        studentId: STUDENT_ONE,
        activityType: "lesson_attendance",
      },
    }), 3);

    const homeworkResults = [];
    for (let index = 0; index < 4; index += 1) {
      homeworkResults.push(await awardHomeworkAcceptedXp({
        studentId: STUDENT_ONE,
        directionId: directions[0].id,
        sourceType: "learning_homework",
        sourceKey: `e2e:weekly-league-v2:homework:direction-one:${index}`,
        description: `QA homework ${index}`,
        attemptNumber: index === 1 ? 2 : 1,
        eventAt: new Date(CURRENT_WEEK_NOW.getTime() + (10 + index) * 60_000),
      }));
    }
    assert.deepEqual(homeworkResults.map((result) => result.amount), [15, 10, 15, 0]);
    assert.equal(homeworkResults[3].status, "weekly_limit");
    const otherDirectionHomework = await awardHomeworkAcceptedXp({
      studentId: STUDENT_ONE,
      directionId: directions[1].id,
      sourceType: "course_homework",
      sourceKey: "e2e:weekly-league-v2:homework:direction-two",
      description: "QA homework in another direction",
      attemptNumber: 1,
      eventAt: new Date(CURRENT_WEEK_NOW.getTime() + 20 * 60_000),
    });
    assert.equal(otherDirectionHomework.amount, 15);

    const testResults = [];
    for (let index = 0; index < 3; index += 1) {
      testResults.push(await awardPreparedTestXp({
        studentId: STUDENT_ONE,
        testId: `qa-weekly-${index}`,
        attemptNumber: index === 0 ? 1 : 2,
        testTitle: `QA test ${index}`,
        eventAt: new Date(CURRENT_WEEK_NOW.getTime() + (30 + index) * 60_000),
      }));
    }
    assert.deepEqual(testResults.map((result) => result.amount), [20, 10, 0]);
    assert.equal(testResults[2].status, "weekly_limit");

    const firstBonus = await awardTeacherLeagueBonus({
      teacherId: teacher.id,
      studentId: STUDENT_ONE,
      amount: 7,
      reason: "QA активность на уроке",
      idempotencyKey: randomUUID(),
    });
    const secondBonus = await awardTeacherLeagueBonus({
      teacherId: teacher.id,
      studentId: STUDENT_ONE,
      amount: 3,
      reason: "QA самостоятельная работа",
      idempotencyKey: randomUUID(),
    });
    assert.equal(firstBonus.awarded, true);
    assert.equal(secondBonus.awarded, true);
    await assert.rejects(
      awardTeacherLeagueBonus({
        teacherId: teacher.id,
        studentId: STUDENT_ONE,
        amount: 1,
        reason: "QA сверх лимита",
        idempotencyKey: randomUUID(),
      }),
      /Лимит бонусов/,
    );

    await assert.rejects(
      awardLeagueXp({
        studentId: STUDENT_ONE,
        amount: 3,
        sourceType: "monthly_plan",
        sourceKey: "e2e:weekly-league-v2:blocked-topic-xp",
        description: "Topic XP must be blocked",
        eventAt: CURRENT_WEEK_NOW,
      }),
      (error: unknown) => Boolean(
        error && typeof error === "object" && "code" in error
        && error.code === "WEEKLY_XP_POLICY_REQUIRED"
      ),
    );

    const overview = await getWeeklyLeagueOverview(STUDENT_ONE, 0, CURRENT_WEEK_NOW);
    assert.equal(overview.currentStudent?.xp, 135);
    assert.equal(overview.currentStudent?.eventCount, 10);
    assert.equal(overview.prizes.rewardsEnabled, true);
    assert.equal(overview.prizes.personalGoal.coins, 25);
    assert.deepEqual(overview.prizes.placements.map((item) => item.coins), [150, 100, 50]);
    assert.equal(overview.currentStudent?.projectedRewardCoins, 275);
    assert.equal(overview.currentStudent?.breakdown.some((item) => item.sourceType === "monthly_plan"), false);

    const wiredHomework = await prisma.learningHomeworkAssignment.create({
      data: {
        topicId: learningTopic.id,
        instructions: "QA DEV-05C accepted homework wiring",
        idempotencyKey: "e2e:weekly-league-v2:wired-homework",
        createdById: admin.id,
        recipients: {
          create: {
            crmStudentId: "QA-STUDENT-2",
            studentUserId: STUDENT_TWO,
            state: "waiting_review",
            attempts: {
              create: {
                attemptNumber: 1,
                cycleNumber: 1,
                versionInCycle: 1,
                submissionMode: "ready_for_lesson",
                status: "waiting_review",
                submittedById: STUDENT_TWO,
                idempotencyKey: "e2e:weekly-league-v2:wired-homework-attempt",
              },
            },
          },
        },
      },
      include: { recipients: true },
    });
    createdHomeworkIds.push(wiredHomework.id);
    createdRecipientIds.push(wiredHomework.recipients[0].id);
    const wiredReviewKey = "e2e:weekly-league-v2:wired-homework-review";
    const wiredReview = await reviewLearningHomework({
      recipientId: wiredHomework.recipients[0].id,
      reviewerUserId: admin.id,
      decision: "accepted",
      idempotencyKey: wiredReviewKey,
    });
    const wiredReplay = await reviewLearningHomework({
      recipientId: wiredHomework.recipients[0].id,
      reviewerUserId: admin.id,
      decision: "accepted",
      idempotencyKey: wiredReviewKey,
    });
    assert.equal(wiredReview.idempotent, false);
    assert.equal(wiredReplay.idempotent, true);
    const wiredXpEvents = await prisma.leagueXpEvent.findMany({
      where: { sourceKey: `learning-homework:${wiredHomework.recipients[0].id}` },
    });
    assert.equal(wiredXpEvents.length, 1);
    assert.equal(wiredXpEvents[0].amount, 15);
    assert.equal(wiredXpEvents[0].directionId, learningTopic.directionId);

    const previousEventAt = new Date(CURRENT_WEEK_NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
    await awardLessonAttendanceXp({
      studentId: STUDENT_TWO,
      sourceType: "offline_lesson",
      sourceKey: "e2e:weekly-league-v2:snapshot:lesson",
      description: "QA snapshot lesson",
      eventAt: previousEventAt,
    });
    await awardHomeworkAcceptedXp({
      studentId: STUDENT_TWO,
      directionId: directions[0].id,
      sourceType: "learning_homework",
      sourceKey: "e2e:weekly-league-v2:snapshot:homework",
      description: "QA snapshot homework",
      attemptNumber: 1,
      eventAt: new Date(previousEventAt.getTime() + 60_000),
    });
    const previousWeek = getAqtobeWeekRange(previousEventAt);
    const weekBeforePrevious = getAqtobeWeekRange(previousEventAt, 1);
    await prisma.weeklyStreakState.create({
      data: {
        economicEpochId: epoch.id,
        studentId: STUDENT_THREE,
        currentWeeks: 2,
        bestWeeks: 2,
        lastProcessedWeekStart: weekBeforePrevious.start,
      },
    });
    const finalizedAt = new Date();
    const firstSnapshot = await finalizeWeeklyLeagueSnapshot({
      week: previousWeek,
      economicEpochId: epoch.id,
      finalizedAt,
    });
    const secondSnapshot = await finalizeWeeklyLeagueSnapshot({
      week: previousWeek,
      economicEpochId: epoch.id,
      finalizedAt: new Date(finalizedAt.getTime() + 1_000),
    });
    assert.equal(firstSnapshot.idempotent, false);
    assert.equal(secondSnapshot.idempotent, true);
    assert.equal(firstSnapshot.snapshotId, secondSnapshot.snapshotId);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await awardPreparedTestXp({
      studentId: STUDENT_TWO,
      testId: "qa-weekly-late-event",
      attemptNumber: 1,
      testTitle: "Late QA test",
      eventAt: new Date(previousEventAt.getTime() + 120_000),
    });
    const finalizedOverview = await getWeeklyLeagueOverview(STUDENT_TWO, 1, CURRENT_WEEK_NOW);
    assert.equal(finalizedOverview.week.phase, "finalized");
    assert.equal(finalizedOverview.week.positionsFinal, true);
    assert.equal(finalizedOverview.currentStudent?.xp, 35);
    assert.equal(finalizedOverview.currentStudent?.breakdown.reduce((sum, item) => sum + item.xp, 0), 35);
    assert.equal(finalizedOverview.currentStudent?.projectedRewardCoins, 200);
    assert.equal(await prisma.maestroCoinTransaction.count({
      where: { economicEpochId: epoch.id, sourceType: "weekly_league" },
    }), 1);

    const lateProtection = await createWeeklyStreakProtection({
      studentId: STUDENT_THREE,
      weekDate: previousEventAt,
      source: "curator",
      category: "illness",
      comment: "QA поздняя защита после болезни",
      sourceKey: "e2e:weekly-league-v2:late-protection",
      createdById: admin.id,
      now: CURRENT_WEEK_NOW,
    });
    assert.equal(lateProtection.corrected, true);
    const correctedState = await prisma.weeklyStreakState.findUniqueOrThrow({
      where: {
        economicEpochId_studentId: {
          economicEpochId: epoch.id,
          studentId: STUDENT_THREE,
        },
      },
    });
    assert.equal(correctedState.currentWeeks, 2);
    const unchangedPreviousEntry = await prisma.weeklyLeagueSnapshotEntry.findFirstOrThrow({
      where: { snapshotId: firstSnapshot.snapshotId, studentId: STUDENT_THREE },
    });
    assert.equal(unchangedPreviousEntry.streakWeeks, 0);
    assert.equal(unchangedPreviousEntry.streakOutcome, "broken");

    const currentProtection = await createWeeklyStreakProtection({
      studentId: STUDENT_THREE,
      weekDate: CURRENT_WEEK_NOW,
      source: "curator",
      category: "family",
      comment: "QA защита текущей недели",
      sourceKey: "e2e:weekly-league-v2:current-protection",
      createdById: admin.id,
      now: CURRENT_WEEK_NOW,
    });
    assert.equal(currentProtection.corrected, false);
    await prisma.weeklyStreakState.update({
      where: {
        economicEpochId_studentId: {
          economicEpochId: epoch.id,
          studentId: STUDENT_ONE,
        },
      },
      data: {
        currentWeeks: 3,
        bestWeeks: 3,
        lastProcessedWeekStart: previousWeek.start,
      },
    });

    const currentWeek = getAqtobeWeekRange(CURRENT_WEEK_NOW);
    const currentSnapshot = await finalizeWeeklyLeagueSnapshot({
      week: currentWeek,
      economicEpochId: epoch.id,
      finalizedAt: new Date(CURRENT_WEEK_NOW.getTime() + 60 * 60 * 1000),
    });
    const currentReplay = await finalizeWeeklyLeagueSnapshot({
      week: currentWeek,
      economicEpochId: epoch.id,
      finalizedAt: new Date(CURRENT_WEEK_NOW.getTime() + 2 * 60 * 60 * 1000),
    });
    assert.equal(currentSnapshot.idempotent, false);
    assert.equal(currentReplay.idempotent, true);

    const [studentOneEntry, studentThreeEntry, milestoneRows, milestoneCoins] = await Promise.all([
      prisma.weeklyLeagueSnapshotEntry.findFirstOrThrow({
        where: { snapshotId: currentSnapshot.snapshotId, studentId: STUDENT_ONE },
      }),
      prisma.weeklyLeagueSnapshotEntry.findFirstOrThrow({
        where: { snapshotId: currentSnapshot.snapshotId, studentId: STUDENT_THREE },
      }),
      prisma.weeklyStreakMilestone.findMany({
        where: { economicEpochId: epoch.id, studentId: STUDENT_ONE },
      }),
      prisma.maestroCoinTransaction.findMany({
        where: { economicEpochId: epoch.id, sourceType: "streak_milestone" },
      }),
    ]);
    assert.equal(studentOneEntry.streakWeeks, 4);
    assert.equal(studentOneEntry.streakOutcome, "extended");
    assert.equal(studentOneEntry.coinsAwarded, 325);
    assert.equal(studentThreeEntry.streakWeeks, 2);
    assert.equal(studentThreeEntry.streakOutcome, "frozen");
    assert.equal(studentThreeEntry.coinsAwarded, 0);
    assert.deepEqual(milestoneRows.map((row) => row.milestoneWeeks), [4]);
    assert.deepEqual(milestoneCoins.map((row) => row.amount), [50]);
    assert.equal(await prisma.maestroCoinTransaction.count({
      where: { economicEpochId: epoch.id, sourceType: "weekly_league" },
    }), 4);

    const currentFinalizedOverview = await getWeeklyLeagueOverview(
      STUDENT_ONE,
      0,
      CURRENT_WEEK_NOW,
    );
    assert.equal(currentFinalizedOverview.currentStudent?.streakWeeks, 4);
    assert.equal(currentFinalizedOverview.currentStudent?.projectedRewardCoins, 325);
    assert.equal(
      currentFinalizedOverview.currentStudent?.streakMilestones.find((item) => item.weeks === 4)?.earned,
      true,
    );
    const firstHistoryPage = await getWeeklyLeagueHistory(STUDENT_ONE, {
      limit: 1,
      now: CURRENT_WEEK_NOW,
    });
    assert.equal(firstHistoryPage.economyV2Enabled, true);
    assert.equal(firstHistoryPage.items.length, 1);
    assert.equal(firstHistoryPage.items[0].week.key, currentWeek.key);
    assert.equal(firstHistoryPage.items[0].coinsAwarded, 325);
    assert.deepEqual(firstHistoryPage.items[0].milestonesEarned, [4]);
    assert.ok(firstHistoryPage.nextCursor);
    const secondHistoryPage = await getWeeklyLeagueHistory(STUDENT_ONE, {
      cursor: new Date(firstHistoryPage.nextCursor!),
      limit: 1,
      now: CURRENT_WEEK_NOW,
    });
    assert.equal(secondHistoryPage.items.length, 1);
    assert.equal(secondHistoryPage.items[0].week.key, previousWeek.key);
    assert.equal(secondHistoryPage.nextCursor, null);
    console.log("Weekly league V2 E2E passed.");
  } finally {
    try {
      await cleanupEpoch(originalBalances);
      await prisma.leagueXpEvent.deleteMany({
        where: { sourceKey: "e2e:weekly-league-v2:legacy-isolation" },
      });
    } finally {
      if (originalActiveEpochs.length > 0) {
        await prisma.economicEpoch.updateMany({
          where: { id: { in: originalActiveEpochs.map((epoch) => epoch.id) } },
          data: { status: EconomicEpochStatus.active },
        });
      }
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
