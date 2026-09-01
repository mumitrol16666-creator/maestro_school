import assert from "node:assert/strict";
import { productFeatureConfig, rewardEconomyV2AppliesToEvent } from "../src/config/product-features.js";
import { prisma } from "../src/infrastructure/database/prisma.js";
import { updateLearningTopicProgressFromLessonV2 } from "../src/application/services/learning-plan-v2.service.js";
import { awardOfflineLessonAttendanceXp } from "../src/application/services/weekly-league.service.js";
import { assertLocalE2eDatabase } from "./qa-database-guard.js";

const TOPIC_ID = "20000000-0000-4000-8000-000000000003";
const STUDENT_CRM_ID = "QA-STUDENT-1";
const TOPIC_CLASS_ID = "QA-E2E-LESSON-V2-TOPIC";
const XP_CLASS_PREFIX = "QA-E2E-LESSON-V2-XP-";
const EVENT_AT = new Date("2030-01-08T05:00:00.000Z");
const EPOCH_CODE = "e2e-economy-v2-lesson-rewards";

function assertLocalQaDatabase() {
  assertLocalE2eDatabase();
  assert.equal(productFeatureConfig.flags.learningTopicsV2, true);
  assert.equal(productFeatureConfig.flags.homeworkFlowV2, true);
  assert.equal(productFeatureConfig.flags.unifiedLessonV2, true);
  assert.equal(productFeatureConfig.flags.rewardEconomyV2, true);
  assert.equal(
    rewardEconomyV2AppliesToEvent(EVENT_AT),
    true,
    "The isolated reward event must be after the configured cutover",
  );
}

async function cleanup(studentId: string, planId?: string | null) {
  await prisma.leagueXpEvent.deleteMany({
    where: {
      studentId,
      sourceKey: { startsWith: `offline-lesson:${XP_CLASS_PREFIX}` },
    },
  });
  const pointTransactions = await prisma.pointsTransaction.findMany({
    where: {
      sourceKey: {
        in: [
          `learning-topic-mastery:${TOPIC_ID}:${studentId}`,
          ...(planId ? [`learning-plan-completion:${planId}:${studentId}`] : []),
        ],
      },
    },
    select: { id: true },
  });
  if (pointTransactions.length) {
    await prisma.userNotification.deleteMany({
      where: { dedupeKey: { in: pointTransactions.map((item) => `points:${item.id}`) } },
    });
    await prisma.pointsTransaction.deleteMany({
      where: { id: { in: pointTransactions.map((item) => item.id) } },
    });
  }
  await prisma.learningTopicProgress.deleteMany({
    where: { sourceKey: `offline-lesson:${TOPIC_CLASS_ID}:topic:${TOPIC_ID}` },
  });
  if (planId) await prisma.learningPlan.deleteMany({ where: { id: planId } });
}

async function main() {
  assertLocalQaDatabase();
  let createdEpochId: string | null = null;
  let economicEpoch = await prisma.economicEpoch.findFirst({
    where: { status: "active", startsAt: { lte: EVENT_AT } },
  });
  if (!economicEpoch) {
    economicEpoch = await prisma.economicEpoch.create({
      data: {
        code: EPOCH_CODE,
        name: "Lesson rewards E2E epoch",
        startsAt: productFeatureConfig.cutoverAt,
        status: "active",
        openingPoints: 0,
        openingWeeklyXp: 0,
        openingCoins: 200,
        sourceKey: `economic-epoch:${EPOCH_CODE}`,
        activatedAt: new Date(),
      },
    });
    createdEpochId = economicEpoch.id;
  }
  const [teacher, student, topic] = await Promise.all([
    prisma.user.findUnique({ where: { login: "qa_teacher_1" } }),
    prisma.user.findUnique({ where: { crmStudentId: STUDENT_CRM_ID } }),
    prisma.learningTopic.findUnique({ where: { id: TOPIC_ID } }),
  ]);
  assert(teacher, "QA teacher is missing");
  assert(student, "QA student is missing");
  assert(topic, "QA topic is missing");
  assert.equal(topic.progressPercent, 99, "QA reward topic must start at 99%");

  const originalCoinBalance = await prisma.studentCoinBalance.findUnique({
    where: { studentId: student.id },
  });
  await prisma.studentCoinBalance.upsert({
    where: { studentId: student.id },
    create: {
      studentId: student.id,
      balance: economicEpoch.openingCoins,
      economicEpochId: economicEpoch.id,
    },
    update: { economicEpochId: economicEpoch.id },
  });

  const originalTopic = {
    progressPercent: topic.progressPercent,
    masteredAt: topic.masteredAt,
    masteryRewardSourceKey: topic.masteryRewardSourceKey,
  };
  await cleanup(student.id);
  let rewardPlanId: string | null = null;

  try {
    const rewardPlan = await prisma.learningPlan.create({
      data: {
        directionId: topic.directionId,
        crmStudentId: topic.crmStudentId,
        crmGroupId: topic.crmGroupId,
        month: "2030-01",
        currentVersionNumber: 1,
        publishedVersionNumber: 1,
        createdById: teacher.id,
        versions: {
          create: {
            version: 1,
            goal: "Проверка награды за завершённый план",
            createdById: teacher.id,
            publishedAt: EVENT_AT,
            topics: {
              create: {
                topicId: topic.id,
                state: "active",
                sortOrder: 0,
                titleSnapshot: topic.title,
                masteryCriteriaSnapshot: topic.masteryCriteria,
              },
            },
          },
        },
      },
    });
    rewardPlanId = rewardPlan.id;

    const mastered = await updateLearningTopicProgressFromLessonV2(
      teacher.id,
      topic.id,
      {
        crmClassId: TOPIC_CLASS_ID,
        expectedPercent: 99,
        toPercent: 100,
        comment: "Локальная E2E-проверка награды темы",
        occurredAt: EVENT_AT,
      },
    );
    assert.equal(mastered.progressPercent, 100);
    assert.equal(mastered.idempotent, false);
    const topicReward = await prisma.pointsTransaction.findUnique({
      where: { sourceKey: `learning-topic-mastery:${topic.id}:${student.id}` },
    });
    assert(topicReward, "Closing a topic at 100% must create a Points receipt");
    assert.equal(topicReward.amount, 100);
    assert.equal(topicReward.economicEpochId, economicEpoch.id);
    const planReward = await prisma.pointsTransaction.findUnique({
      where: { sourceKey: `learning-plan-completion:${rewardPlan.id}:${student.id}` },
    });
    assert(planReward, "Closing the final active topic must create a plan completion receipt");
    assert.equal(planReward.amount, 250);
    const completedPlan = await prisma.learningPlan.findUnique({ where: { id: rewardPlan.id } });
    assert.equal(completedPlan?.completionRewardSourceKey, `learning-plan-completion:${rewardPlan.id}`);
    assert.deepEqual(completedPlan?.completedAt, EVENT_AT);
    assert.deepEqual(completedPlan?.lockedAt, EVENT_AT);

    const repeatedMastery = await updateLearningTopicProgressFromLessonV2(
      teacher.id,
      topic.id,
      {
        crmClassId: TOPIC_CLASS_ID,
        expectedPercent: 99,
        toPercent: 100,
        occurredAt: EVENT_AT,
      },
    );
    assert.equal(repeatedMastery.idempotent, true);
    assert.equal(await prisma.pointsTransaction.count({
      where: { sourceKey: `learning-topic-mastery:${topic.id}:${student.id}` },
    }), 1);
    assert.equal(await prisma.pointsTransaction.count({
      where: { sourceKey: `learning-plan-completion:${rewardPlan.id}:${student.id}` },
    }), 1);

    const firstXp = await awardOfflineLessonAttendanceXp({
      studentId: student.id,
      crmStudentId: STUDENT_CRM_ID,
      crmClassId: `${XP_CLASS_PREFIX}1`,
      eventAt: EVENT_AT,
      awardedById: teacher.id,
    });
    const secondXp = await awardOfflineLessonAttendanceXp({
      studentId: student.id,
      crmStudentId: STUDENT_CRM_ID,
      crmClassId: `${XP_CLASS_PREFIX}2`,
      eventAt: new Date(EVENT_AT.getTime() + 24 * 60 * 60 * 1000),
      awardedById: teacher.id,
    });
    const thirdXp = await awardOfflineLessonAttendanceXp({
      studentId: student.id,
      crmStudentId: STUDENT_CRM_ID,
      crmClassId: `${XP_CLASS_PREFIX}3`,
      eventAt: new Date(EVENT_AT.getTime() + 2 * 24 * 60 * 60 * 1000),
      awardedById: teacher.id,
    });
    const repeatedXp = await awardOfflineLessonAttendanceXp({
      studentId: student.id,
      crmStudentId: STUDENT_CRM_ID,
      crmClassId: `${XP_CLASS_PREFIX}1`,
      eventAt: EVENT_AT,
      awardedById: teacher.id,
    });

    assert.deepEqual(
      [firstXp.awarded, firstXp.amount, secondXp.awarded, secondXp.amount],
      [true, 20, true, 20],
    );
    assert.deepEqual([thirdXp.awarded, thirdXp.status, thirdXp.amount], [false, "weekly_limit", 0]);
    assert.deepEqual([repeatedXp.awarded, repeatedXp.status], [false, "already_awarded"]);
    assert.equal(await prisma.leagueXpEvent.count({
      where: {
        studentId: student.id,
        sourceKey: { startsWith: `offline-lesson:${XP_CLASS_PREFIX}` },
      },
    }), 2);
    assert.equal(await prisma.leagueXpEvent.count({
      where: {
        studentId: student.id,
        economicEpochId: economicEpoch.id,
        sourceKey: { startsWith: `offline-lesson:${XP_CLASS_PREFIX}` },
      },
    }), 2);

    console.log("Lesson V2 rewards E2E passed: 100 topic Points + 250 plan Points once, 20+20 XP, third lesson capped.");
  } finally {
    await cleanup(student.id, rewardPlanId);
    await prisma.maestroCoinTransaction.deleteMany({
      where: {
        studentId: student.id,
        economicEpochId: economicEpoch.id,
        sourceKey: { startsWith: `weekly-attendance-coins:${economicEpoch.id}:offline-lesson:${XP_CLASS_PREFIX}` },
      },
    });
    if (originalCoinBalance) {
      await prisma.studentCoinBalance.update({
        where: { studentId: student.id },
        data: {
          balance: originalCoinBalance.balance,
          economicEpochId: originalCoinBalance.economicEpochId,
        },
      });
    } else {
      await prisma.studentCoinBalance.deleteMany({ where: { studentId: student.id } });
    }
    await prisma.learningTopic.update({
      where: { id: topic.id },
      data: originalTopic,
    });
    if (createdEpochId) {
      await prisma.economicEpoch.delete({ where: { id: createdEpochId } });
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
