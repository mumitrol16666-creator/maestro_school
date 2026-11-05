import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { prisma } from "../../infrastructure/database/prisma.js";
import { listHomeworkCheckHistory } from "./learning-homework-v2.service.js";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

integrationTest("lesson check history excludes other directions and unreviewed assignments while the full history keeps them", async () => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(database.hostname));
  assert.match(database.pathname, /^\/maestro_(?:regression|sectors_\w+)$/);
  const suffix = randomUUID();
  const student = `homework-history-${suffix}`;
  const directions: string[] = [];
  const topics: string[] = [];
  const assignments: string[] = [];
  const recipients: string[] = [];
  try {
    for (const name of ["guitar", "ensemble"]) {
      const direction = await prisma.direction.create({ data: { slug: `${name}-${suffix}`, title: name } });
      directions.push(direction.id);
      const topic = await prisma.learningTopic.create({ data: { directionId: direction.id, crmStudentId: student, title: `Topic ${name}` } });
      topics.push(topic.id);
    }
    for (const [index, topicId] of [topics[0], topics[0], topics[1]].entries()) {
      const assignment = await prisma.learningHomeworkAssignment.create({ data: {
        topicId, instructions: `Instructions ${index}`, idempotencyKey: `history-${suffix}-${index}`,
        recipients: { create: [{ crmStudentId: student }, { crmStudentId: `other-${student}` }] },
      }, include: { recipients: true } });
      assignments.push(assignment.id);
      recipients.push(...assignment.recipients.map(row => row.id));
      if (index !== 1) {
        const recipient = assignment.recipients.find(row => row.crmStudentId === student)!;
        const attempt = await prisma.learningHomeworkAttempt.create({ data: {
          recipientId: recipient.id, attemptNumber: 1, cycleNumber: 1, versionInCycle: 1,
          submissionMode: "ready_for_lesson", status: "accepted", idempotencyKey: `attempt-${suffix}-${index}`,
        } });
        await prisma.learningHomeworkReview.create({ data: {
          recipientId: recipient.id, attemptId: attempt.id, cycleNumber: 1, decision: "accepted",
          completionPercent: index === 0 ? 75 : 100, idempotencyKey: `review-${suffix}-${index}`,
        } });
      }
    }
    const lessonHistory = await listHomeworkCheckHistory([student], { directionIds: [directions[0]], reviewedOnly: true });
    assert.equal(lessonHistory.length, 1);
    assert.equal(lessonHistory[0].topic.title, "Topic guitar");
    assert.equal(lessonHistory[0].directionTitle, "guitar");
    assert.equal(lessonHistory[0].reviews[0].completionPercent, 75);
    assert.equal((await listHomeworkCheckHistory([student])).length, 3, "the student card still has the complete history");
    assert.deepEqual(await listHomeworkCheckHistory([student], { directionIds: [], reviewedOnly: true }), []);
  } finally {
    await prisma.learningHomeworkReview.deleteMany({ where: { recipientId: { in: recipients } } });
    await prisma.learningHomeworkAttempt.deleteMany({ where: { recipientId: { in: recipients } } });
    await prisma.learningHomeworkAssignment.deleteMany({ where: { id: { in: assignments } } });
    await prisma.learningTopic.deleteMany({ where: { id: { in: topics } } });
    await prisma.direction.deleteMany({ where: { id: { in: directions } } });
  }
});
