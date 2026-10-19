import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.INTEGRATION_SERVICE_SECRET ??= "lesson-check-test-secret-1234";
process.env.CRM_API_URL ??= "http://127.0.0.1:9";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

/**
 * The teacher checks homework at the lesson. The student sent nothing: the
 * check itself becomes the attempt, the percent is kept on the review and the
 * recipient, 0 closes the homework as «не выполнено» without a retake.
 */
async function createFixture() {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const suffix = randomUUID().slice(0, 8);
  const digits = suffix.replace(/\D/g, "").padEnd(7, "7").slice(0, 7);
  const studentRole = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  const adminRole = await prisma.role.upsert({ where: { slug: "admin" }, create: { slug: "admin", name: "admin" }, update: {} });
  const direction = await prisma.direction.create({
    data: { title: `Гитара ${suffix}`, slug: `guitar-hw-${suffix}`, isPublished: true, crmDirectionId: `crm-dir-hw-${suffix}`, crmIsActive: true },
  });
  const student = await prisma.user.create({
    data: {
      login: `hw_s_${suffix}`, phone: `+7707${digits}`, passwordHash: "x",
      firstName: "Ученик", lastName: suffix, roleId: studentRole.id, crmStudentId: `crm-student-hw-${suffix}`, externalLinkStatus: "linked",
    },
  });
  const reviewer = await prisma.user.create({
    data: {
      login: `hw_a_${suffix}`, phone: `+7708${digits}`, passwordHash: "x",
      firstName: "Админ", lastName: suffix, roleId: adminRole.id,
    },
  });
  const topic = await prisma.learningTopic.create({
    data: { directionId: direction.id, crmStudentId: student.crmStudentId!, title: "Бой шестёркой", progressPercent: 40 },
  });
  const assignment = await prisma.learningHomeworkAssignment.create({
    data: { topicId: topic.id, instructions: "Повторить бой", idempotencyKey: `hw-check-${suffix}`, createdById: reviewer.id },
  });
  const recipient = await prisma.learningHomeworkRecipient.create({
    data: { assignmentId: assignment.id, crmStudentId: student.crmStudentId!, studentUserId: student.id, state: "assigned", currentCycle: 1 },
  });
  return { prisma, suffix, direction, student, reviewer, topic, assignment, recipient };
}

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function removeFixture({ prisma, direction, student, reviewer }: Fixture) {
  await prisma.leagueXpEvent.deleteMany({ where: { studentId: student.id } });
  await prisma.userNotification.deleteMany({ where: { userId: student.id } });
  await prisma.learningHomeworkAssignment.deleteMany({ where: { topic: { directionId: direction.id } } });
  await prisma.learningTopic.deleteMany({ where: { directionId: direction.id } });
  await prisma.user.deleteMany({ where: { id: { in: [student.id, reviewer.id] } } });
  await prisma.direction.delete({ where: { id: direction.id } });
}

integrationTest("a percent above zero at the lesson accepts homework the student never sent", async t => {
  const fixture = await createFixture();
  t.after(() => removeFixture(fixture));
  const { reviewLearningHomework } = await import("./learning-homework-v2.service.js");

  const result = await reviewLearningHomework({
    recipientId: fixture.recipient.id,
    reviewerUserId: fixture.reviewer.id,
    completionPercent: 70,
    idempotencyKey: `offline-lesson:class-${fixture.suffix}:homework:${fixture.recipient.id}:1`,
    checkedAtLesson: true,
  });
  assert.equal(result.idempotent, false);
  assert.equal(result.review.decision, "accepted");
  assert.equal(result.review.completionPercent, 70);

  const recipient = await fixture.prisma.learningHomeworkRecipient.findUniqueOrThrow({
    where: { id: fixture.recipient.id },
    include: { attempts: true },
  });
  assert.equal(recipient.state, "accepted");
  assert.equal(recipient.completionPercent, 70);
  assert.ok(recipient.acceptedAt);
  assert.equal(recipient.attempts.length, 1, "the check at the lesson is recorded as the attempt");
  assert.equal(recipient.attempts[0]?.submissionMode, "ready_for_lesson");
  assert.equal(recipient.attempts[0]?.status, "accepted");

  // The same lesson decision again changes nothing.
  const again = await reviewLearningHomework({
    recipientId: fixture.recipient.id,
    reviewerUserId: fixture.reviewer.id,
    completionPercent: 70,
    idempotencyKey: `offline-lesson:class-${fixture.suffix}:homework:${fixture.recipient.id}:1`,
    checkedAtLesson: true,
  });
  assert.equal(again.idempotent, true);
});

integrationTest("zero percent closes homework as not completed, without XP and without a retake", async t => {
  const fixture = await createFixture();
  t.after(() => removeFixture(fixture));
  const { reviewLearningHomework } = await import("./learning-homework-v2.service.js");

  const result = await reviewLearningHomework({
    recipientId: fixture.recipient.id,
    reviewerUserId: fixture.reviewer.id,
    completionPercent: 0,
    idempotencyKey: `offline-lesson:class-${fixture.suffix}:homework:${fixture.recipient.id}:1`,
    checkedAtLesson: true,
  });
  assert.equal(result.review.decision, "not_completed");
  const recipient = await fixture.prisma.learningHomeworkRecipient.findUniqueOrThrow({ where: { id: fixture.recipient.id } });
  assert.equal(recipient.state, "not_completed");
  assert.equal(recipient.completionPercent, 0);
  const xp = await fixture.prisma.leagueXpEvent.findMany({ where: { studentId: fixture.student.id } });
  assert.equal(xp.length, 0);

  await assert.rejects(
    reviewLearningHomework({
      recipientId: fixture.recipient.id,
      reviewerUserId: fixture.reviewer.id,
      completionPercent: 50,
      idempotencyKey: `offline-lesson:class-${fixture.suffix}-2:homework:${fixture.recipient.id}:1`,
      checkedAtLesson: true,
    }),
    (error: { code?: string }) => error.code === "HOMEWORK_NOT_WAITING_REVIEW",
  );
});
