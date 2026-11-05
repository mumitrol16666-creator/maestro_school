import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { prisma } from "../../infrastructure/database/prisma.js";
import { pendingTopicPercentsBefore } from "./lesson-pending-topics.service.js";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

// 31.10 (Vladislav): the next lesson continues a topic from the sent but unapproved report.
integrationTest("a topic continues from the latest earlier lesson that is sent but not yet approved", async () => {
  const suffix = randomUUID().slice(0, 8);
  const author = randomUUID();
  const direction = await prisma.direction.create({
    data: { title: `Направление ${suffix}`, slug: `pending-topics-${suffix}`, isPublished: true },
  });
  const topic = await prisma.learningTopic.create({
    data: { directionId: direction.id, crmStudentId: `crm-${suffix}`, title: "Переходы Am–Em", progressPercent: 20 },
  });
  const lesson = (name: string, date: string) => ({
    crmClassId: `pending-${name}-${suffix}`,
    date: `${date}T12:00:00.000Z`,
    startTime: "15:00",
    title: `Урок ${name}`,
  });
  const monday = lesson("monday", "2026-10-26");
  const wednesday = lesson("wednesday", "2026-10-28");
  const friday = lesson("friday", "2026-10-30");
  const withdrawn = lesson("withdrawn", "2026-10-29");
  const later = lesson("later", "2026-11-02");
  const ids = [monday, wednesday, friday, withdrawn, later].map((meta) => meta.crmClassId);

  async function sentLesson(meta: ReturnType<typeof lesson>, status: string, toPercent: number, state = "submitted") {
    await prisma.offlineLessonProjection.create({
      data: { crmClassId: meta.crmClassId, status: "pending_admin_review", lessonPayload: meta },
    });
    const report = await prisma.offlineLessonReport.create({
      data: { crmClassId: meta.crmClassId, authorUserId: author, status, currentVersion: 1 },
    });
    await prisma.offlineLessonReportVersion.create({
      data: {
        reportId: report.id,
        version: 1,
        authorUserId: author,
        state,
        attendancePayload: [],
        payload: {
          learningResultsV2: {
            homeworkDecisions: [],
            topicUpdates: [{ topicId: topic.id, expectedPercent: null, toPercent }],
          },
        },
      },
    });
  }

  try {
    await sentLesson(monday, "pending_review", 40);
    await sentLesson(wednesday, "pending_review", 60);
    await sentLesson(withdrawn, "editing", 90, "withdrawn");
    await sentLesson(later, "pending_review", 80);

    const forFriday = await pendingTopicPercentsBefore(friday, [topic.id]);
    assert.equal(forFriday.get(topic.id)?.percent, 60, "Wednesday's report is the latest before Friday");
    assert.equal(forFriday.get(topic.id)?.crmClassId, wednesday.crmClassId);
    assert.equal(forFriday.get(topic.id)?.title, "Урок wednesday");

    const forWednesday = await pendingTopicPercentsBefore(wednesday, [topic.id]);
    assert.equal(forWednesday.get(topic.id)?.percent, 40, "Wednesday itself continues from Monday");

    assert.equal((await pendingTopicPercentsBefore(monday, [topic.id])).size, 0, "nothing before Monday");
    assert.equal((await pendingTopicPercentsBefore(friday, [randomUUID()])).size, 0, "other topics are untouched");

    // A lesson cancelled in CRM after it was sent, or one long ago, holds nothing.
    await prisma.offlineLessonProjection.update({ where: { crmClassId: wednesday.crmClassId }, data: { status: "cancelled" } });
    assert.equal((await pendingTopicPercentsBefore(friday, [topic.id])).get(topic.id)?.percent, 40, "Monday's report is the latest live one");
    await prisma.offlineLessonProjection.update({ where: { crmClassId: wednesday.crmClassId }, data: { status: "pending_admin_review" } });
    assert.equal(
      (await pendingTopicPercentsBefore({ ...friday, date: "2026-11-20T12:00:00.000Z" }, [topic.id])).size,
      0,
      "lessons more than two weeks before do not chain",
    );

    // Monday and Wednesday are approved: their topic events exist, Friday starts from the topic itself.
    await prisma.learningTopicProgress.createMany({
      data: [monday, wednesday].map((meta, index) => ({
        topicId: topic.id,
        fromPercent: index === 0 ? 20 : 40,
        toPercent: index === 0 ? 40 : 60,
        source: "lesson" as const,
        sourceKey: `offline-lesson:${meta.crmClassId}:topic:${topic.id}`,
        occurredAt: new Date(meta.date),
      })),
    });
    assert.equal((await pendingTopicPercentsBefore(friday, [topic.id])).size, 0);

    // CRM confirmed a later lesson before the earlier one: its report is «confirmed», the approval
    // still waits in the outbox, and its percent is what the next lesson continues from.
    const thursday = lesson("thursday", "2026-10-29");
    ids.push(thursday.crmClassId);
    await sentLesson(thursday, "confirmed", 75);
    assert.equal((await pendingTopicPercentsBefore(friday, [topic.id])).size, 0, "a finished approval is not waited for");
    const approval = await prisma.crmOutboxEvent.create({
      data: {
        aggregateType: "offline_lesson",
        aggregateId: thursday.crmClassId,
        eventType: "admin_approve",
        status: "failed",
        idempotencyKey: `pending-topics-approval-${suffix}`,
        payload: {},
      },
    });
    try {
      assert.equal((await pendingTopicPercentsBefore(friday, [topic.id])).get(topic.id)?.percent, 75);
      // 04.11: the admin closed that approval's conflict on the lesson page — nothing waits any more.
      await prisma.crmOutboxEvent.update({ where: { id: approval.id }, data: { status: "resolved" } });
      assert.equal((await pendingTopicPercentsBefore(friday, [topic.id])).size, 0, "a resolved approval is not waited for");
    } finally {
      await prisma.crmOutboxEvent.delete({ where: { id: approval.id } });
    }
  } finally {
    await prisma.learningTopicProgress.deleteMany({ where: { topicId: topic.id } });
    await prisma.offlineLessonReport.deleteMany({ where: { crmClassId: { in: ids } } });
    await prisma.offlineLessonProjection.deleteMany({ where: { crmClassId: { in: ids } } });
    await prisma.learningTopic.delete({ where: { id: topic.id } });
    await prisma.direction.delete({ where: { id: direction.id } });
  }
});
