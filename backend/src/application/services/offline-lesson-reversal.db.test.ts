import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { prisma } from "../../infrastructure/database/prisma.js";
import {
  applyCrmOfflineLessonEvent,
  reverseOfflineLessonApproval,
} from "./offline-lesson-reversal.service.js";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

/**
 * Builds the exact rows a confirmed lesson leaves behind: attendance XP/Coins and
 * activity, an accepted homework decision, a topic closed at 100 % with mastery
 * Points and a plan completed by that topic.
 */
async function createRewardedLessonFixture() {
  const suffix = randomUUID().slice(0, 8);
  const crmClassId = `reversal-${suffix}`;
  const crmStudentId = `crm-student-${suffix}`;
  const awardedAt = new Date("2026-10-15T07:00:00.000Z");

  const role = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  const student = await prisma.user.create({
    data: {
      login: `reversal_${suffix}`,
      phone: `+7700${suffix.replace(/\D/g, "").padEnd(7, "1").slice(0, 7)}`,
      passwordHash: "x",
      firstName: "Откат",
      lastName: suffix,
      roleId: role.id,
      crmStudentId,
    },
  });
  const direction = await prisma.direction.create({
    data: { title: `Направление ${suffix}`, slug: `direction-${suffix}`, isPublished: true },
  });
  const epoch = await prisma.economicEpoch.create({
    data: {
      code: `reversal-${suffix}`,
      name: "Тестовая эпоха",
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      status: "archived",
      sourceKey: `reversal-epoch:${suffix}`,
      activatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  await prisma.economicEpochParticipant.create({
    data: { epochId: epoch.id, studentId: student.id, sourceKey: `reversal-participant:${suffix}`, activatedAt: awardedAt },
  });

  const topic = await prisma.learningTopic.create({
    data: {
      directionId: direction.id,
      crmStudentId,
      title: "Ровный ритм",
      progressPercent: 100,
      masteredAt: awardedAt,
      masteryRewardSourceKey: `pending`,
    },
  });
  await prisma.learningTopic.update({
    where: { id: topic.id },
    data: { masteryRewardSourceKey: `learning-topic-mastery:${topic.id}:${student.id}` },
  });
  const plan = await prisma.learningPlan.create({
    data: {
      directionId: direction.id,
      crmStudentId,
      month: "2026-10",
      currentVersionNumber: 1,
      publishedVersionNumber: 1,
      completedAt: awardedAt,
      lockedAt: awardedAt,
      completionRewardSourceKey: "pending",
    },
  });
  await prisma.learningPlan.update({
    where: { id: plan.id },
    data: { completionRewardSourceKey: `learning-plan-completion:${plan.id}` },
  });
  const planVersion = await prisma.learningPlanVersion.create({ data: { planId: plan.id, version: 1 } });
  await prisma.learningPlanTopic.create({
    data: { planVersionId: planVersion.id, topicId: topic.id, titleSnapshot: topic.title },
  });
  await prisma.learningTopicProgress.create({
    data: {
      topicId: topic.id,
      fromPercent: 60,
      toPercent: 100,
      source: "lesson",
      sourceKey: `offline-lesson:${crmClassId}:topic:${topic.id}`,
      occurredAt: awardedAt,
      createdAt: awardedAt,
    },
  });
  await prisma.pointsTransaction.createMany({
    data: [
      { economicEpochId: epoch.id, studentId: student.id, amount: 100, reason: "Освоена тема", sourceKey: `learning-topic-mastery:${topic.id}:${student.id}`, createdAt: awardedAt },
      { economicEpochId: epoch.id, studentId: student.id, amount: 250, reason: "Завершён план", sourceKey: `learning-plan-completion:${plan.id}:${student.id}`, createdAt: awardedAt },
    ],
  });

  const attendanceKey = `offline-lesson:${crmClassId}:${crmStudentId}`;
  await prisma.leagueXpEvent.create({
    data: { economicEpochId: epoch.id, studentId: student.id, amount: 20, sourceType: "offline_lesson", sourceKey: attendanceKey, description: "Посещение", createdAt: awardedAt },
  });
  await prisma.weeklyLeagueActivityEvent.create({
    data: { economicEpochId: epoch.id, studentId: student.id, activityType: "lesson_attendance", sourceKey: `weekly-activity:${epoch.id}:${attendanceKey}`, occurredAt: awardedAt },
  });
  await prisma.studentCoinBalance.create({ data: { studentId: student.id, balance: 250, economicEpochId: epoch.id } });
  await prisma.maestroCoinTransaction.create({
    data: {
      economicEpochId: epoch.id, studentId: student.id, amount: 50, transactionType: "earn", reason: "Посещение",
      sourceType: "offline_lesson", sourceKey: `weekly-attendance-coins:${epoch.id}:${attendanceKey}`, balanceBefore: 200, balanceAfter: 250, createdAt: awardedAt,
    },
  });

  const assignment = await prisma.learningHomeworkAssignment.create({
    data: { topicId: topic.id, instructions: "Повторить", idempotencyKey: `reversal-assignment:${suffix}` },
  });
  const recipient = await prisma.learningHomeworkRecipient.create({
    data: { assignmentId: assignment.id, crmStudentId, studentUserId: student.id, state: "accepted", currentCycle: 1, acceptedAt: awardedAt },
  });
  await prisma.learningHomeworkRecipient.update({
    where: { id: recipient.id },
    data: { rewardSourceKey: `learning-homework:${recipient.id}` },
  });
  const attempt = await prisma.learningHomeworkAttempt.create({
    data: { recipientId: recipient.id, attemptNumber: 1, cycleNumber: 1, versionInCycle: 1, submissionMode: "ready_for_lesson", idempotencyKey: `reversal-attempt:${suffix}` },
  });
  await prisma.learningHomeworkReview.create({
    data: { recipientId: recipient.id, attemptId: attempt.id, cycleNumber: 1, decision: "accepted", idempotencyKey: `offline-lesson:${crmClassId}:homework:${recipient.id}:1` },
  });
  await prisma.leagueXpEvent.create({
    data: { economicEpochId: epoch.id, studentId: student.id, directionId: direction.id, amount: 15, sourceType: "learning_homework", sourceKey: `learning-homework:${recipient.id}`, description: "ДЗ принято", createdAt: awardedAt },
  });
  await prisma.weeklyLeagueActivityEvent.create({
    data: { economicEpochId: epoch.id, studentId: student.id, activityType: "homework_accepted", sourceKey: `weekly-activity:${epoch.id}:learning-homework:${recipient.id}`, occurredAt: awardedAt },
  });

  const authorUserId = randomUUID();
  await prisma.offlineLessonProjection.create({
    data: { crmClassId, crmTeacherId: `teacher-${suffix}`, status: "completed", lessonPayload: { id: crmClassId }, rosterPayload: [], rosterVersion: "v1" },
  });
  const report = await prisma.offlineLessonReport.create({
    data: { crmClassId, authorUserId, status: "confirmed", currentVersion: 1, confirmedVersion: 1, crmConfirmedAt: awardedAt },
  });
  await prisma.offlineLessonReportVersion.create({
    data: {
      reportId: report.id,
      version: 1,
      authorUserId,
      payload: {
        topic: "Ровный ритм",
        learningResultsV2: {
          homeworkDecisions: [{ recipientId: recipient.id, cycleNumber: 1, decision: "accepted" }],
          topicUpdates: [{ topicId: topic.id, expectedPercent: 60, toPercent: 100 }],
        },
      },
      attendancePayload: [{ crmStudentId, attendanceStatus: "present" }],
      rosterVersion: "v1",
      state: "submitted",
      crmDeliveredAt: awardedAt,
    },
  });
  await prisma.offlineLessonStudentCheck.create({
    data: { crmClassId, crmStudentId, attendanceStatus: "present", homeworkStatus: "completed", rewardsAppliedAt: awardedAt },
  });

  return { crmClassId, crmStudentId, student, direction, epoch, topic, plan, recipient, report, authorUserId };
}

type Fixture = Awaited<ReturnType<typeof createRewardedLessonFixture>>;

async function removeRewardedLessonFixture(fixture: Fixture) {
  await prisma.adminJournalEntry.deleteMany({ where: { linkedEntityId: fixture.crmClassId } });
  await prisma.offlineLessonStudentCheck.deleteMany({ where: { crmClassId: fixture.crmClassId } });
  await prisma.offlineLessonReport.deleteMany({ where: { crmClassId: fixture.crmClassId } });
  await prisma.offlineLessonProjection.deleteMany({ where: { crmClassId: fixture.crmClassId } });
  await prisma.learningHomeworkAssignment.deleteMany({ where: { topicId: fixture.topic.id } });
  await prisma.learningPlan.deleteMany({ where: { id: fixture.plan.id } });
  await prisma.learningTopic.deleteMany({ where: { id: fixture.topic.id } });
  await prisma.maestroCoinTransaction.deleteMany({ where: { studentId: fixture.student.id } });
  await prisma.studentCoinBalance.deleteMany({ where: { studentId: fixture.student.id } });
  await prisma.pointsTransaction.deleteMany({ where: { studentId: fixture.student.id } });
  await prisma.weeklyLeagueActivityEvent.deleteMany({ where: { studentId: fixture.student.id } });
  await prisma.leagueXpEvent.deleteMany({ where: { studentId: fixture.student.id } });
  await prisma.economicEpochParticipant.deleteMany({ where: { epochId: fixture.epoch.id } });
  await prisma.economicEpoch.deleteMany({ where: { id: fixture.epoch.id } });
  await prisma.user.deleteMany({ where: { id: fixture.student.id } });
  await prisma.direction.deleteMany({ where: { id: fixture.direction.id } });
}

integrationTest("reversal undoes every reward of the confirmed version and keeps the originals for audit", async t => {
  const fixture = await createRewardedLessonFixture();
  t.after(() => removeRewardedLessonFixture(fixture));

  const summary = await reverseOfflineLessonApproval({
    crmClassId: fixture.crmClassId,
    reason: "Урок возвращён преподавателю из CRM",
    now: new Date("2026-10-17T09:00:00.000Z"),
  });
  assert.equal(summary.reversed, true);
  assert.deepEqual(summary.attendance, [{ crmStudentId: fixture.crmStudentId, xp: 20, coins: 50 }]);
  assert.deepEqual(summary.homework, [{ recipientId: fixture.recipient.id, xp: 15 }]);
  assert.equal(summary.topics[0]?.masteryPoints, 100);
  assert.equal(summary.planCompletions[0]?.points, 250);

  const points = await prisma.pointsTransaction.findMany({ where: { studentId: fixture.student.id }, orderBy: { sourceKey: "asc" } });
  assert.equal(points.reduce((sum, row) => sum + row.amount, 0), 0);
  assert.deepEqual(
    points.map((row) => row.sourceKey).sort(),
    [
      `learning-plan-completion:${fixture.plan.id}:${fixture.student.id}:reversal:v1`,
      `learning-plan-completion:${fixture.plan.id}:${fixture.student.id}:reversed:v1`,
      `learning-topic-mastery:${fixture.topic.id}:${fixture.student.id}:reversal:v1`,
      `learning-topic-mastery:${fixture.topic.id}:${fixture.student.id}:reversed:v1`,
    ].sort(),
  );

  const xp = await prisma.leagueXpEvent.findMany({ where: { studentId: fixture.student.id } });
  assert.equal(xp.length, 2);
  assert.ok(xp.every((event) => event.reversedAt && event.sourceKey.endsWith(":reversed:v1")));
  const activity = await prisma.weeklyLeagueActivityEvent.findMany({ where: { studentId: fixture.student.id } });
  assert.equal(activity.length, 2);
  assert.ok(activity.every((event) => event.reversedAt));

  const balance = await prisma.studentCoinBalance.findUniqueOrThrow({ where: { studentId: fixture.student.id } });
  assert.equal(balance.balance, 200);
  const coins = await prisma.maestroCoinTransaction.findMany({ where: { studentId: fixture.student.id } });
  assert.deepEqual(coins.map((row) => row.amount).sort(), [-50, 50]);
  assert.ok(coins.some((row) => row.transactionType === "correction" && row.balanceBefore === 250 && row.balanceAfter === 200));

  const topic = await prisma.learningTopic.findUniqueOrThrow({ where: { id: fixture.topic.id } });
  assert.equal(topic.progressPercent, 60);
  assert.equal(topic.masteredAt, null);
  assert.equal(topic.masteryRewardSourceKey, null);
  const history = await prisma.learningTopicProgress.findMany({ where: { topicId: fixture.topic.id }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(history.map((row) => [row.source, row.fromPercent, row.toPercent]), [["lesson", 60, 100], ["correction", 100, 60]]);

  const plan = await prisma.learningPlan.findUniqueOrThrow({ where: { id: fixture.plan.id } });
  assert.equal(plan.completedAt, null);
  assert.equal(plan.lockedAt, null);
  assert.equal(plan.completionRewardSourceKey, null);

  const recipient = await prisma.learningHomeworkRecipient.findUniqueOrThrow({ where: { id: fixture.recipient.id } });
  assert.equal(recipient.state, "waiting_review");
  assert.equal(recipient.acceptedAt, null);
  assert.equal(recipient.rewardSourceKey, null);
  assert.equal(await prisma.learningHomeworkReview.count({ where: { recipientId: fixture.recipient.id } }), 0);

  const check = await prisma.offlineLessonStudentCheck.findFirstOrThrow({ where: { crmClassId: fixture.crmClassId } });
  assert.equal(check.rewardsAppliedAt, null);
  const journal = await prisma.adminJournalEntry.findUnique({ where: { sourceKey: `lesson-reversal:${fixture.crmClassId}:v1` } });
  assert.equal(journal?.type, "reward_correction");

  // Second run finds nothing left to undo and must not double-correct.
  const again = await reverseOfflineLessonApproval({ crmClassId: fixture.crmClassId, reason: "повтор" });
  assert.equal(again.reversed, true);
  assert.deepEqual(again.attendance, []);
  assert.equal((await prisma.pointsTransaction.findMany({ where: { studentId: fixture.student.id } })).length, 4);
  assert.equal((await prisma.studentCoinBalance.findUniqueOrThrow({ where: { studentId: fixture.student.id } })).balance, 200);
});

integrationTest("a CRM return of a confirmed lesson reverses rewards and makes the report editable again", async t => {
  const fixture = await createRewardedLessonFixture();
  t.after(() => removeRewardedLessonFixture(fixture));

  const result = await applyCrmOfflineLessonEvent({
    event: "returned",
    crmClassId: fixture.crmClassId,
    message: "Проверьте посещаемость",
  });
  assert.equal(result.reversal?.reversed, true);
  assert.equal(result.reportState, "editing");

  const report = await prisma.offlineLessonReport.findUniqueOrThrow({ where: { crmClassId: fixture.crmClassId } });
  assert.equal(report.status, "editing");
  assert.equal(report.confirmedVersion, null);
  assert.equal(report.crmConfirmedAt, null);
  assert.equal(report.correctionReason, "Проверьте посещаемость");
  const draft = await prisma.offlineLessonDraft.findFirst({ where: { reportId: report.id, ownerUserId: fixture.authorUserId } });
  assert.ok(draft, "the teacher gets a draft of the returned version");

  const repeated = await applyCrmOfflineLessonEvent({ event: "returned", crmClassId: fixture.crmClassId, message: "Проверьте посещаемость" });
  assert.equal(repeated.reportState, "editing");

  const untouched = await applyCrmOfflineLessonEvent({ event: "reopened", crmClassId: fixture.crmClassId, message: "Пересмотр списания" });
  assert.equal(untouched.reversal, null);
});
