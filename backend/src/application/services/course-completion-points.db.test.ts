import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

// Stage 4, step 4: Points for a finished module (+100) and a finished course (+250) in the new
// economy, once each; no Coins; no XP and no league for a person from outside the school.
process.env.FEATURE_REWARD_ECONOMY_V2 = "true";
process.env.PRODUCT_V2_CUTOVER_AT = "2026-01-01T00:00:00.000Z";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

integrationTest("module and course Points come once, Coins never, XP only for the school; a refund and a reversal behave", async t => {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { enrollStudentInCourse } = await import("./enrollment.service.js");
  const { startLesson, completeLessonWithoutHomework } = await import("./lesson-progress.service.js");
  const { submitHomework } = await import("./homework-submit.service.js");
  const { awardSystemPoints, getStudentPointsReadModel, reverseSystemPoints } = await import("./points.service.js");
  const { createPaymentRequest, confirmPaymentRequest, refundPaymentRequest } = await import("./course-payment.service.js");
  const { courseCompletionSourceKey, courseModuleCompletionSourceKey } = await import("./course-completion-rewards.service.js");
  const { COURSE_COMPLETION_POINTS, COURSE_MODULE_COMPLETION_POINTS } = await import("../../domain/product-economy-v2.js");

  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const role = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  const adminRole = await prisma.role.upsert({ where: { slug: "admin" }, create: { slug: "admin", name: "admin" }, update: {} });
  const makeUser = async (label: string, crmStudentId: string | null, roleId = role.id) => {
    const user = await prisma.user.create({ data: {
      login: `pts_${label}_${suffix}`, phone: `+7702${randomUUID().replace(/\D/g, "").padEnd(7, "3").slice(0, 7)}`, passwordHash: "x",
      firstName: "Баллы", lastName: label, roleId, crmStudentId,
    } });
    userIds.push(user.id);
    return user;
  };
  const external = await makeUser("external", null);
  const school = await makeUser("school", `crm-pts-${suffix}`);
  const paying = await makeUser("paying", null);
  const admin = await makeUser("admin", null, adminRole.id);

  const direction = await prisma.direction.create({ data: { title: `Баллы ${suffix}`, slug: `course-points-${suffix}`, isPublished: true } });
  // Two modules: l1, l2 | l3 (with a test). Coins reward is set, to prove none is paid.
  const course = await prisma.course.create({ data: {
    directionId: direction.id, title: `Курс баллов ${suffix}`, isPublished: true, priceKzt: null, completionCoinsReward: 30,
  } });
  const moduleOne = await prisma.courseModule.create({ data: { courseId: course.id, title: "Первый", sortOrder: 1 } });
  const moduleTwo = await prisma.courseModule.create({ data: { courseId: course.id, title: "Второй", sortOrder: 2 } });
  const lesson = (moduleId: string, sortOrder: number, extra: object = {}) => prisma.lesson.create({
    data: { moduleId, title: `Урок ${sortOrder}`, sortOrder, isPublished: true, ...extra },
  });
  const l1 = await lesson(moduleOne.id, 1);
  const l2 = await lesson(moduleOne.id, 2);
  await lesson(moduleOne.id, 3, { isPublished: false }); // a draft never blocks the module
  const l3 = await lesson(moduleTwo.id, 1);
  const test3 = await prisma.homework.create({ data: {
    lessonId: l3.id, description: "Тест", type: "test", passingScore: 50,
    testQuestions: [{ id: "q1", prompt: "Вопрос", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctOptionId: "a" }],
  } });

  let epoch = await prisma.economicEpoch.findFirst({ where: { status: "active", startsAt: { lte: new Date() } } });
  const epochCreated = !epoch;
  if (!epoch) {
    epoch = await prisma.economicEpoch.create({ data: {
      code: `pts-${suffix}`, name: "Тестовая эпоха", startsAt: new Date(Date.now() - 30 * 86_400_000),
      status: "active", sourceKey: `pts-epoch:${suffix}`, activatedAt: new Date(Date.now() - 30 * 86_400_000),
    } });
  }
  t.after(async () => {
    await prisma.userNotification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.weeklyLeagueActivityEvent.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.leagueXpEvent.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.pointsTransaction.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.maestroCoinTransaction.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.studentCoinBalance.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.economicEpochParticipant.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.homeworkSubmission.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.lessonProgress.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.studentCourse.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.courseAccess.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.coursePaymentRequest.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.course.deleteMany({ where: { directionId: direction.id } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.direction.delete({ where: { id: direction.id } });
    if (epochCreated) await prisma.economicEpoch.delete({ where: { id: epoch!.id } });
    await prisma.$disconnect();
  });

  const points = (studentId: string) => prisma.pointsTransaction.findMany({ where: { studentId }, orderBy: { createdAt: "asc" } });
  const sum = async (studentId: string) => (await points(studentId)).reduce((total, row) => total + row.amount, 0);
  const finish = async (studentId: string, lessonId: string) => {
    await startLesson(studentId, lessonId);
    return completeLessonWithoutHomework(studentId, lessonId);
  };
  const finishWithTest = async (studentId: string, lessonId: string) => {
    await startLesson(studentId, lessonId);
    return submitHomework({ homeworkId: test3.id, studentId, testAnswers: { q1: "a" } });
  };
  const runCourse = async (studentId: string) => {
    await enrollStudentInCourse(studentId, course.id);
    const afterFirst = await finish(studentId, l1.id);
    assert.equal(afterFirst.courseCompleted, false);
    assert.equal(await sum(studentId), 0, "one lesson of two is not a module");
    await finish(studentId, l2.id);
    assert.equal(await sum(studentId), COURSE_MODULE_COMPLETION_POINTS, "the module is done, the course is not");
    await finishWithTest(studentId, l3.id);
  };

  // ── A person from outside: Points, no Coins, no XP, no league ──────────────────
  assert.equal(external.leagueEligible, true, "the default is the worst case: the guard must not rely on the flag");
  await runCourse(external.id);
  const externalPoints = await points(external.id);
  assert.deepEqual(
    externalPoints.map((row) => [row.amount, row.sourceKey, row.economicEpochId]),
    [
      [COURSE_MODULE_COMPLETION_POINTS, courseModuleCompletionSourceKey(moduleOne.id, external.id), epoch.id],
      [COURSE_MODULE_COMPLETION_POINTS, courseModuleCompletionSourceKey(moduleTwo.id, external.id), epoch.id],
      [COURSE_COMPLETION_POINTS, courseCompletionSourceKey(course.id, external.id), epoch.id],
    ],
  );
  assert.equal([COURSE_MODULE_COMPLETION_POINTS, COURSE_COMPLETION_POINTS].join("/"), "100/250");
  assert.equal(await prisma.maestroCoinTransaction.count({ where: { studentId: external.id, sourceType: "course" } }), 0, "no Coins for a finished course in the new economy");
  assert.equal(await prisma.leagueXpEvent.count({ where: { studentId: external.id } }), 0, "no XP for a person outside the school");
  assert.equal(await prisma.weeklyLeagueActivityEvent.count({ where: { studentId: external.id } }), 0);
  assert.equal((await prisma.studentCourse.findFirstOrThrow({ where: { studentId: external.id, courseId: course.id } })).status, "completed");
  assert.equal((await getStudentPointsReadModel(external.id)).points, 450);

  // Doing it all again awards nothing: a lesson already completed is replayed through the same path.
  await completeLessonWithoutHomework(external.id, l1.id);
  await completeLessonWithoutHomework(external.id, l2.id);
  await submitHomework({ homeworkId: test3.id, studentId: external.id, testAnswers: { q1: "a" } }).catch((error: { statusCode?: number }) => assert.equal(error.statusCode, 400, "a finished lesson cannot be answered again"));
  assert.equal((await points(external.id)).length, 3);
  // Parallel replays of the same completion award once as well.
  await Promise.all(Array.from({ length: 4 }, () => completeLessonWithoutHomework(external.id, l2.id)));
  assert.equal(await sum(external.id), 450);
  assert.deepEqual(
    (await prisma.lessonProgress.findMany({ where: { studentId: external.id } })).map((row) => row.status),
    ["completed", "completed", "completed"],
    "completing a lesson again does not push a later lesson back to «available»",
  );

  // ── A student of the school: the same Points, no Coins, XP as before ──────────
  await runCourse(school.id);
  assert.equal(await sum(school.id), 450);
  assert.equal(await prisma.maestroCoinTransaction.count({ where: { studentId: school.id, sourceType: "course" } }), 0);
  const xp = await prisma.leagueXpEvent.findMany({ where: { studentId: school.id } });
  assert.deepEqual(xp.map((event) => [event.sourceType, event.sourceKey, event.economicEpochId]), [["course_homework", `course-homework:${school.id}:${l3.id}`, epoch.id]], "the school student keeps the XP for the accepted test");
  assert.ok(xp[0].amount > 0);

  // ── Renaming the course and the module does not turn a replay into a conflict ──
  await prisma.course.update({ where: { id: course.id }, data: { title: `Новое имя ${suffix}` } });
  await prisma.courseModule.update({ where: { id: moduleOne.id }, data: { title: "Переименован" } });
  await completeLessonWithoutHomework(school.id, l2.id);
  assert.equal(await sum(school.id), 450);

  // ── A paid course: the refund takes back the access, not the Points ──────────
  await prisma.course.update({ where: { id: course.id }, data: { priceKzt: 15000 } });
  const payment = await createPaymentRequest({ courseId: course.id, studentId: paying.id, payerUserId: paying.id });
  await payment.telegram;
  const confirmed = await confirmPaymentRequest({ requestId: payment.request.id, actorId: admin.id });
  assert.equal(confirmed.displayStatus, "confirmed");
  await runCourse(paying.id);
  assert.equal(await sum(paying.id), 450);
  const refunded = await refundPaymentRequest({ requestId: payment.request.id, actorId: admin.id, note: "Возврат" });
  assert.equal(refunded.displayStatus, "refunded");
  assert.equal(await sum(paying.id), 450, "Points stay after a refund");
  assert.equal((await points(paying.id)).length, 3, "no correction rows");
  assert.equal((await prisma.studentCourse.findFirstOrThrow({ where: { studentId: paying.id, courseId: course.id } })).status, "completed", "progress stays");

  // ── reverseSystemPoints: the correction row, the freed key, and a second call that does nothing ──
  const key = courseModuleCompletionSourceKey(moduleOne.id, school.id);
  const at = new Date();
  const taken = await prisma.$transaction((tx) => reverseSystemPoints(tx, { sourceKey: key, version: 1, reason: "Проверка", actorUserId: admin.id, at }));
  assert.equal(taken, COURSE_MODULE_COMPLETION_POINTS);
  assert.equal(await sum(school.id), 350);
  const original = await prisma.pointsTransaction.findUniqueOrThrow({ where: { sourceKey: `${key}:reversed:v1` } });
  const correction = await prisma.pointsTransaction.findUniqueOrThrow({ where: { sourceKey: `${key}:reversal:v1` } });
  assert.deepEqual([original.amount, correction.amount, correction.awardedBy, correction.economicEpochId], [100, -100, admin.id, epoch.id]);
  assert.match(correction.reason, /^Отмена: Пройден модуль/);
  assert.equal(await prisma.$transaction((tx) => reverseSystemPoints(tx, { sourceKey: key, version: 1, reason: "Ещё раз", actorUserId: admin.id, at })), 0, "already reversed");
  assert.equal(await prisma.$transaction((tx) => reverseSystemPoints(tx, { sourceKey: "no-such-key", version: 1, reason: "x", actorUserId: null, at })), 0);
  // The key is free again: the same source can be awarded under it.
  const again = await awardSystemPoints({ studentId: school.id, amount: 100, reason: "Пройден модуль «Заново»", sourceKey: key });
  assert.equal(again.awarded, true);
  assert.equal(await sum(school.id), 450);
});
