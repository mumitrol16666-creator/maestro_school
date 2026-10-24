import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { prisma } from "../../infrastructure/database/prisma.js";
import { readHomeworkChecks, readLessonRewards, readSectorProgress } from "./student-lesson-result.service.js";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

/**
 * Plan 2.7: the rows a confirmed lesson leaves behind — a topic brought to 100 and another
 * moved, the previous homework checked at the lesson, the attendance XP and a teacher's bonus
 * given that day — read back as the student's lesson result.
 */
integrationTest("the student's lesson result reads the sector step, the homework check and the day's XP from real rows", async () => {
  const suffix = randomUUID().slice(0, 8);
  const crmClassId = `result-${suffix}`;
  const crmStudentId = `crm-student-${suffix}`;
  const lessonAt = new Date("2026-10-20T07:00:00.000Z"); // 12:00 in Aqtobe
  const role = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  const student = await prisma.user.create({
    data: {
      login: `result_${suffix}`, phone: `+7701${suffix.replace(/\D/g, "").padEnd(7, "2").slice(0, 7)}`, passwordHash: "x",
      firstName: "Итог", lastName: suffix, roleId: role.id, crmStudentId,
    },
  });
  const teacherRole = await prisma.role.upsert({ where: { slug: "teacher" }, create: { slug: "teacher", name: "teacher" }, update: {} });
  const teacher = await prisma.user.create({
    data: { login: `result_teacher_${suffix}`, phone: `+7702${suffix.replace(/\D/g, "").padEnd(7, "3").slice(0, 7)}`, passwordHash: "x", firstName: "Учитель", lastName: suffix, roleId: teacherRole.id, crmTeacherId: `crm-teacher-${suffix}` },
  });
  const otherTeacher = await prisma.user.create({
    data: { login: `result_other_${suffix}`, phone: `+7703${suffix.replace(/\D/g, "").padEnd(7, "4").slice(0, 7)}`, passwordHash: "x", firstName: "Другой", lastName: suffix, roleId: teacherRole.id, crmTeacherId: `crm-other-${suffix}` },
  });
  const direction = await prisma.direction.create({ data: { title: `Гитара ${suffix}`, slug: `direction-${suffix}`, isPublished: true } });
  const epoch = await prisma.economicEpoch.create({
    data: { code: `result-${suffix}`, name: "Тестовая эпоха", startsAt: new Date("2026-01-01T00:00:00.000Z"), status: "archived", sourceKey: `result-epoch:${suffix}`, activatedAt: new Date("2026-01-01T00:00:00.000Z") },
  });
  const topics = await Promise.all([
    { title: "Ранее освоенная", progressPercent: 100, masteredAt: new Date("2026-10-01T07:00:00.000Z") },
    { title: "Бой восьмыми", progressPercent: 100, masteredAt: lessonAt },
    { title: "Переходы", progressPercent: 30, masteredAt: null },
    { title: "Куплет", progressPercent: 0, masteredAt: null },
  ].map((item) => prisma.learningTopic.create({ data: { directionId: direction.id, crmStudentId, ...item } })));
  const plan = await prisma.learningPlan.create({
    data: { directionId: direction.id, crmStudentId, month: "2026-10", sequence: 2, currentVersionNumber: 1, publishedVersionNumber: 1 },
  });
  const version = await prisma.learningPlanVersion.create({ data: { planId: plan.id, version: 1 } });
  await prisma.learningPlanTopic.createMany({ data: topics.map((topic, index) => ({ planVersionId: version.id, topicId: topic.id, titleSnapshot: topic.title, sortOrder: index })) });
  await prisma.learningTopicProgress.createMany({
    data: [
      { topicId: topics[1].id, fromPercent: 70, toPercent: 100, source: "lesson", sourceKey: `offline-lesson:${crmClassId}:topic:${topics[1].id}`, occurredAt: lessonAt },
      { topicId: topics[2].id, fromPercent: 0, toPercent: 30, source: "lesson", sourceKey: `offline-lesson:${crmClassId}:topic:${topics[2].id}`, occurredAt: lessonAt },
    ],
  });
  const assignment = await prisma.learningHomeworkAssignment.create({ data: { topicId: topics[2].id, instructions: "Переходы 5 минут", idempotencyKey: `result-assignment:${suffix}` } });
  const recipient = await prisma.learningHomeworkRecipient.create({ data: { assignmentId: assignment.id, crmStudentId, studentUserId: student.id, state: "accepted", currentCycle: 1 } });
  const attempt = await prisma.learningHomeworkAttempt.create({
    data: { recipientId: recipient.id, attemptNumber: 1, cycleNumber: 1, versionInCycle: 1, submissionMode: "ready_for_lesson", status: "accepted", idempotencyKey: `result-attempt:${suffix}` },
  });
  await prisma.learningHomeworkReview.create({
    data: { recipientId: recipient.id, attemptId: attempt.id, cycleNumber: 1, decision: "accepted", completionPercent: 70, comment: "Темп держи", reviewedAt: lessonAt, idempotencyKey: `offline-lesson:${crmClassId}:homework:${recipient.id}:1` },
  });
  await prisma.leagueXpEvent.createMany({
    data: [
      { economicEpochId: epoch.id, studentId: student.id, amount: 20, sourceType: "offline_lesson", sourceKey: `offline-lesson:${crmClassId}:${crmStudentId}`, description: "Посещение", recordedAt: lessonAt },
      { economicEpochId: epoch.id, studentId: student.id, amount: 3, sourceType: "teacher_bonus", sourceKey: `teacher-bonus:${suffix}:same-day`, description: "Бонус", recordedAt: new Date("2026-10-20T13:00:00.000Z"), awardedById: teacher.id },
      { economicEpochId: epoch.id, studentId: student.id, amount: 7, sourceType: "teacher_bonus", sourceKey: `teacher-bonus:${suffix}:other-teacher`, description: "Бонус группы", recordedAt: new Date("2026-10-20T14:00:00.000Z"), awardedById: otherTeacher.id },
      { economicEpochId: epoch.id, studentId: student.id, amount: 5, sourceType: "teacher_bonus", sourceKey: `teacher-bonus:${suffix}:other-day`, description: "Бонус", recordedAt: new Date("2026-10-22T07:00:00.000Z"), awardedById: teacher.id },
      { economicEpochId: epoch.id, studentId: student.id, amount: 20, sourceType: "offline_lesson", sourceKey: `offline-lesson:${crmClassId}-reversed:${crmStudentId}`, description: "Откат", recordedAt: lessonAt, reversedAt: lessonAt },
    ],
  });

  try {
    const lessons = [
      { crmClassId, date: lessonAt.toISOString(), startTime: "12:00", status: "completed", crmTeacherId: teacher.crmTeacherId },
      { crmClassId: `${crmClassId}-later`, date: "2026-10-20T10:00:00.000Z", startTime: "15:00", status: "completed", crmTeacherId: teacher.crmTeacherId },
      { crmClassId: `${crmClassId}-group`, date: "2026-10-20T13:00:00.000Z", startTime: "18:00", status: "completed", crmTeacherId: otherTeacher.crmTeacherId },
      { crmClassId: `${crmClassId}-draft`, date: lessonAt.toISOString(), startTime: "09:00", status: "not_filled", crmTeacherId: teacher.crmTeacherId },
    ];
    const rewards = await readLessonRewards({ appUserId: student.id, crmStudentId, lessons });
    assert.deepEqual(rewards.get(crmClassId), { xp: 20, bonusXp: 3 }, "attendance XP plus this teacher's bonus of the same Aqtobe day");
    assert.equal(rewards.get(`${crmClassId}-later`), undefined, "the day's bonus is shown once, on the teacher's first confirmed lesson");
    assert.deepEqual(rewards.get(`${crmClassId}-group`), { xp: 0, bonusXp: 7 }, "another teacher's bonus goes to that teacher's lesson");
    assert.equal(rewards.get(`${crmClassId}-draft`), undefined, "an unconfirmed lesson earns nothing");

    const sector = await readSectorProgress(new Map([[crmClassId, [
      { topicId: topics[1].id, fromPercent: 70, toPercent: 100, occurredAt: lessonAt },
      { topicId: topics[2].id, fromPercent: 0, toPercent: 30, occurredAt: lessonAt },
    ]]]));
    assert.deepEqual(sector.get(crmClassId), {
      planId: plan.id, sequence: 2, direction: direction.title, fromPercent: 25, toPercent: 50, completed: 2, total: 4,
    });

    const checks = await readHomeworkChecks({ crmStudentId, crmClassIds: [crmClassId, `${crmClassId}-later`] });
    assert.deepEqual(checks.get(crmClassId)?.map((check) => ({ ...check, reviewedAt: check.reviewedAt.toISOString() })), [
      { topicTitle: "Переходы", completionPercent: 70, comment: "Темп держи", reviewedAt: lessonAt.toISOString() },
    ]);
    assert.equal(checks.get(`${crmClassId}-later`), undefined);
  } finally {
    await prisma.learningHomeworkAssignment.deleteMany({ where: { id: assignment.id } });
    await prisma.learningPlan.deleteMany({ where: { id: plan.id } });
    await prisma.learningTopic.deleteMany({ where: { id: { in: topics.map((topic) => topic.id) } } });
    await prisma.leagueXpEvent.deleteMany({ where: { studentId: student.id } });
    await prisma.economicEpoch.deleteMany({ where: { id: epoch.id } });
    await prisma.direction.deleteMany({ where: { id: direction.id } });
    await prisma.user.deleteMany({ where: { id: { in: [student.id, teacher.id, otherTeacher.id] } } });
  }
});
