import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { prisma } from "../../infrastructure/database/prisma.js";
import { rewardEconomyV2AppliesToEvent } from "../../config/product-features.js";
import {
  type SkippedLessonTopicUpdate,
  updateLearningTopicProgressBatchFromLessonV2,
} from "./learning-plan-v2.service.js";
import {
  LESSON_TOPIC_CONFLICT_KIND,
  applyWaitingLessonTopicConflicts,
  closeLessonTopicConflicts,
  openTopicConflictsFor,
  recordLessonTopicConflicts,
  resolveLessonTopicConflict,
} from "./lesson-topic-conflicts.service.js";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

async function fixture() {
  const suffix = randomUUID();
  const existingRole = await prisma.role.findUnique({ where: { slug: "curator" } });
  const role = existingRole ?? await prisma.role.create({
    data: { slug: "curator", name: "Куратор", description: "Created by the topic conflict test" },
  });
  const actor = await prisma.user.create({
    data: {
      login: `topic-conflict-${suffix}`,
      phone: `+7701${suffix.replaceAll("-", "").slice(0, 10)}`,
      passwordHash: "integration-test-only",
      firstName: "Topic",
      lastName: "Conflict",
      roleId: role.id,
    },
  });
  const direction = await prisma.direction.create({
    data: { slug: `topic-conflict-${suffix}`, title: `Topic conflict ${suffix}`, crmDirectionId: `topic-conflict-${suffix}` },
  });
  const movedTopicId = randomUUID();
  const freshTopicId = randomUUID();
  await prisma.learningTopic.createMany({
    data: [
      // «Кукла Колдуна»: the earlier lesson started from 33 %, the topic already reached 50 %.
      { id: movedTopicId, directionId: direction.id, crmStudentId: `owner-${suffix}`, title: "Кукла Колдуна", progressPercent: 50 },
      { id: freshTopicId, directionId: direction.id, crmStudentId: `owner-${suffix}`, title: "Бой четвёрка", progressPercent: 20 },
    ],
  });
  const crmClassId = `topic-conflict-class-${suffix}`;
  return {
    actor,
    crmClassId,
    movedTopicId,
    freshTopicId,
    async cleanup() {
      const topicIds = [movedTopicId, freshTopicId];
      await prisma.crmSyncConflict.deleteMany({ where: { crmClassId: { startsWith: "topic-conflict-class-" + suffix } } });
      await prisma.learningTopicProgress.deleteMany({ where: { topicId: { in: topicIds } } });
      await prisma.learningTopic.deleteMany({ where: { id: { in: topicIds } } });
      await prisma.user.delete({ where: { id: actor.id } });
      await prisma.direction.delete({ where: { id: direction.id } });
      if (!existingRole) await prisma.role.delete({ where: { id: role.id } });
    },
  };
}

async function percent(topicId: string) {
  return (await prisma.learningTopic.findUniqueOrThrow({ where: { id: topicId } })).progressPercent;
}

integrationTest("an approved lesson writes the matching topic and sets the moved one aside", async (t) => {
  const f = await fixture();
  t.after(() => f.cleanup());
  const skipped: SkippedLessonTopicUpdate[] = [];
  await updateLearningTopicProgressBatchFromLessonV2(f.actor.id, f.crmClassId, [
    { topicId: f.freshTopicId, expectedPercent: 20, toPercent: 40 },
    { topicId: f.movedTopicId, expectedPercent: 33, toPercent: 39 },
  ], { skippedTopics: skipped });

  assert.equal(await percent(f.freshTopicId), 40);
  assert.equal(await percent(f.movedTopicId), 50);
  assert.deepEqual(skipped, [{
    topicId: f.movedTopicId,
    title: "Кукла Колдуна",
    expectedPercent: 33,
    toPercent: 39,
    currentPercent: 50,
    reason: "stale",
  }]);
  assert.equal(await prisma.learningTopicProgress.count({
    where: { sourceKey: `offline-lesson:${f.crmClassId}:topic:${f.movedTopicId}` },
  }), 0);
});

integrationTest("without the approval option a moved topic still fails the whole batch", async (t) => {
  const f = await fixture();
  t.after(() => f.cleanup());
  await assert.rejects(
    updateLearningTopicProgressBatchFromLessonV2(f.actor.id, f.crmClassId, [
      { topicId: f.movedTopicId, expectedPercent: 33, toPercent: 39 },
    ]),
    (error: { code?: string }) => error.code === "LEARNING_TOPIC_STALE_PROGRESS",
  );
});

integrationTest("a topic already at the lesson's percent is neither written nor set aside", async (t) => {
  const f = await fixture();
  t.after(() => f.cleanup());
  const skipped: SkippedLessonTopicUpdate[] = [];
  await updateLearningTopicProgressBatchFromLessonV2(f.actor.id, f.crmClassId, [
    { topicId: f.movedTopicId, expectedPercent: 33, toPercent: 50 },
  ], { skippedTopics: skipped });
  assert.deepEqual(skipped, []);
  assert.equal(await percent(f.movedTopicId), 50);
});

integrationTest("the admin keeps the current percent or writes the lesson's one", async (t) => {
  const f = await fixture();
  t.after(() => f.cleanup());
  const entry: SkippedLessonTopicUpdate = {
    topicId: f.movedTopicId, title: "Кукла Колдуна", expectedPercent: 33, toPercent: 39, currentPercent: 50, reason: "stale",
  };
  const first = await recordLessonTopicConflicts({ crmClassId: f.crmClassId, reportVersion: 1, approvedBy: f.actor.id, topics: [entry] });
  const again = await recordLessonTopicConflicts({ crmClassId: f.crmClassId, reportVersion: 2, approvedBy: f.actor.id, topics: [entry] });
  assert.equal(first?.id, again?.id, "one open conflict per lesson");
  assert.equal(first?.kind, LESSON_TOPIC_CONFLICT_KIND);
  assert.match(again?.errorMessage ?? "", /Кукла Колдуна.*33 → 39.*50/);
  assert.equal((await openTopicConflictsFor([f.movedTopicId])).get(f.movedTopicId)?.toPercent, 39);

  const kept = await resolveLessonTopicConflict(first!.id, f.actor.id, "keep_current", "50 свежее");
  assert.equal(kept?.status, "resolved");
  assert.equal(kept?.resolution, "keep_current");
  assert.equal(await percent(f.movedTopicId), 50);
  assert.equal((await openTopicConflictsFor([f.movedTopicId])).size, 0);

  const otherClassId = `${f.crmClassId}-b`;
  const second = await recordLessonTopicConflicts({ crmClassId: otherClassId, reportVersion: 1, approvedBy: f.actor.id, topics: [entry] });
  const written = await resolveLessonTopicConflict(second!.id, f.actor.id, "write_lesson", "урок правильный");
  assert.equal(written?.status, "resolved");
  assert.equal(await percent(f.movedTopicId), 39);
  const event = await prisma.learningTopicProgress.findUniqueOrThrow({
    where: { sourceKey: `offline-lesson:${otherClassId}:topic:${f.movedTopicId}` },
  });
  assert.equal(event.fromPercent, 50);
  assert.equal(event.toPercent, 39);
});

integrationTest("a later lesson waits and is written once the earlier one brings the topic to its start", async (t) => {
  const f = await fixture();
  t.after(() => f.cleanup());
  // The later lesson continues 60 → 75 but was approved while the topic still had 50 %.
  const later = await recordLessonTopicConflicts({
    crmClassId: f.crmClassId,
    reportVersion: 1,
    approvedBy: f.actor.id,
    topics: [{ topicId: f.movedTopicId, title: "Кукла Колдуна", expectedPercent: 60, toPercent: 75, currentPercent: 50, reason: "stale" }],
  });
  assert.equal(await applyWaitingLessonTopicConflicts([f.movedTopicId]), 0, "not yet at 60 %");

  // The earlier lesson is approved: 50 → 60.
  await updateLearningTopicProgressBatchFromLessonV2(f.actor.id, `${f.crmClassId}-earlier`, [
    { topicId: f.movedTopicId, expectedPercent: 50, toPercent: 60 },
  ]);
  assert.equal(await applyWaitingLessonTopicConflicts([f.movedTopicId]), 1);
  assert.equal(await percent(f.movedTopicId), 75);
  const resolved = await prisma.crmSyncConflict.findUniqueOrThrow({ where: { id: later!.id } });
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.resolution, "auto_applied");
});

// ---- 04.11 review findings: mastery rewards, lesson date, the whole chain, returned lessons ----

async function rewardFixture(kind: "group" | "individual", percent: number) {
  const s = randomUUID().slice(0, 8);
  const curator = await prisma.role.upsert({ where: { slug: "curator" }, create: { slug: "curator", name: "curator" }, update: {} });
  const studentRole = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  const digits = (seed: string) => seed.replace(/\D/g, "").padEnd(7, "4").slice(0, 7);
  const admin = await prisma.user.create({ data: { login: `tc_adm_${s}`, phone: `+7703${digits(s)}`, passwordHash: "x", firstName: "A", lastName: s, roleId: curator.id } });
  const crmStudentId = `tc-crm-${s}`;
  const student = await prisma.user.create({ data: { login: `tc_st_${s}`, phone: `+7704${digits(s)}`, passwordHash: "x", firstName: "S", lastName: s, roleId: studentRole.id, crmStudentId } });
  const direction = await prisma.direction.create({ data: { title: `TC ${s}`, slug: `tc-${s}`, crmDirectionId: `tc-${s}` } });
  const existingEpoch = await prisma.economicEpoch.findFirst({ where: { status: "active" } });
  const epoch = existingEpoch ?? await prisma.economicEpoch.create({ data: { code: `tc-${s}`, name: "tc", startsAt: new Date("2026-01-01T00:00:00Z"), status: "active", sourceKey: `tc-epoch:${s}`, activatedAt: new Date("2026-01-01T00:00:00Z") } });
  await prisma.economicEpochParticipant.create({ data: { epochId: epoch.id, studentId: student.id, sourceKey: `tc-part:${s}`, activatedAt: new Date("2026-01-01T00:00:00Z") } });
  const topic = await prisma.learningTopic.create({ data: { directionId: direction.id, ...(kind === "group" ? { crmGroupId: `tc-grp-${s}` } : { crmStudentId }), title: "Тема", progressPercent: percent } });
  const crmClassId = `topic-conflict-class-${s}`;
  return {
    admin, crmStudentId, topic, crmClassId,
    async cleanup() {
      await prisma.crmSyncConflict.deleteMany({ where: { crmClassId: { startsWith: crmClassId } } });
      await prisma.pointsTransaction.deleteMany({ where: { studentId: student.id } });
      await prisma.learningTopicProgress.deleteMany({ where: { topicId: topic.id } });
      await prisma.learningTopic.delete({ where: { id: topic.id } });
      await prisma.economicEpochParticipant.deleteMany({ where: { epochId: epoch.id, studentId: student.id } });
      if (!existingEpoch) await prisma.economicEpoch.delete({ where: { id: epoch.id } });
      await prisma.user.deleteMany({ where: { id: { in: [admin.id, student.id] } } });
      await prisma.direction.delete({ where: { id: direction.id } });
    },
  };
}

const masteryRows = (topicId: string) => prisma.pointsTransaction.findMany({
  where: { sourceKey: { startsWith: `learning-topic-mastery:${topicId}:` } },
});

integrationTest("a legacy group topic written to 100 % retains the original attendance-snapshot award policy", async (t) => {
  const lessonAt = new Date("2026-10-28T06:00:00Z");
  if (!rewardEconomyV2AppliesToEvent(lessonAt)) {
    t.skip("mastery rewards need FEATURE_REWARD_ECONOMY_V2=true, as in production");
    return;
  }
  const f = await rewardFixture("group", 50);
  t.after(() => f.cleanup());
  const conflict = await recordLessonTopicConflicts({
    crmClassId: f.crmClassId,
    reportVersion: 1,
    approvedBy: f.admin.id,
    recipientCrmStudentIds: [f.crmStudentId],
    occurredAt: lessonAt,
    topics: [{ topicId: f.topic.id, title: "Тема", expectedPercent: 33, toPercent: 100, currentPercent: 50, reason: "stale" }],
  });
  await resolveLessonTopicConflict(conflict!.id, f.admin.id, "write_lesson", "урок правильный");
  const rows = await masteryRows(f.topic.id);
  assert.equal(rows.length, 1, "the legacy report retains its original present-student award");
  const event = await prisma.learningTopicProgress.findUniqueOrThrow({
    where: { sourceKey: `offline-lesson:${f.crmClassId}:topic:${f.topic.id}` },
  });
  assert.equal(event.occurredAt.toISOString(), lessonAt.toISOString());
});

integrationTest("the admin's write lets the waiting later lessons in, whatever order they were approved", async (t) => {
  const f = await rewardFixture("individual", 50);
  t.after(() => f.cleanup());
  const entry = (from: number, to: number) => ({ topicId: f.topic.id, title: "Тема", expectedPercent: from, toPercent: to, currentPercent: 50, reason: "stale" as const });
  const latest = await recordLessonTopicConflicts({ crmClassId: `${f.crmClassId}-c`, reportVersion: 1, approvedBy: f.admin.id, topics: [entry(45, 60)] });
  const middle = await recordLessonTopicConflicts({ crmClassId: `${f.crmClassId}-b`, reportVersion: 1, approvedBy: f.admin.id, topics: [entry(39, 45)] });
  const earliest = await recordLessonTopicConflicts({ crmClassId: `${f.crmClassId}-a`, reportVersion: 1, approvedBy: f.admin.id, topics: [entry(33, 39)] });
  await resolveLessonTopicConflict(earliest!.id, f.admin.id, "write_lesson", "28.10 правильный");
  assert.equal(await percent(f.topic.id), 60);
  for (const conflict of [middle, latest]) {
    assert.equal((await prisma.crmSyncConflict.findUniqueOrThrow({ where: { id: conflict!.id } })).status, "resolved");
  }
});

integrationTest("a returned or re-approved lesson closes its conflict, so its old percent is never written", async (t) => {
  const f = await rewardFixture("individual", 50);
  t.after(() => f.cleanup());
  const stale = { topicId: f.topic.id, title: "Тема", expectedPercent: 50, toPercent: 39, currentPercent: 60, reason: "stale" as const };
  const first = await recordLessonTopicConflicts({ crmClassId: f.crmClassId, reportVersion: 1, approvedBy: f.admin.id, topics: [stale] });
  // The corrected version is approved and writes its topics cleanly.
  await recordLessonTopicConflicts({ crmClassId: f.crmClassId, reportVersion: 2, approvedBy: f.admin.id, topics: [] });
  assert.equal((await prisma.crmSyncConflict.findUniqueOrThrow({ where: { id: first!.id } })).status, "resolved");
  // Even when the topic comes back to the old start, nothing is written for that lesson.
  assert.equal(await applyWaitingLessonTopicConflicts([f.topic.id]), 0);
  assert.equal(await percent(f.topic.id), 50);

  const second = await recordLessonTopicConflicts({ crmClassId: `${f.crmClassId}-r`, reportVersion: 1, approvedBy: f.admin.id, topics: [stale] });
  assert.equal(await closeLessonTopicConflicts(`${f.crmClassId}-r`, "lesson_returned", "Урок возвращён"), 1);
  assert.equal((await prisma.crmSyncConflict.findUniqueOrThrow({ where: { id: second!.id } })).resolution, "lesson_returned");
});
