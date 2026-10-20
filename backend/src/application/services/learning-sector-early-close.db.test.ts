import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.INTEGRATION_SERVICE_SECRET ??= "sector-early-close-test-secret-1234";
process.env.CRM_API_URL ??= "http://127.0.0.1:9";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

async function createFixture(t: Parameters<Parameters<typeof test>[1]>[0]) {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const suffix = randomUUID().slice(0, 8);
  const digits = suffix.replace(/\D/g, "").padEnd(7, "3").slice(0, 7);
  const crmStudentId = `crm-early-${suffix}`;
  const crmDirectionId = `crm-dir-early-${suffix}`;
  const studentRole = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  const teacherRole = await prisma.role.upsert({ where: { slug: "teacher" }, create: { slug: "teacher", name: "teacher" }, update: {} });
  const direction = await prisma.direction.create({
    data: { title: `Гитара ${suffix}`, slug: `early-${suffix}`, isPublished: true, crmDirectionId, crmIsActive: true },
  });
  const student = await prisma.user.create({
    data: {
      login: `early_s_${suffix}`, phone: `+7711${digits}`, passwordHash: "x",
      firstName: "Ученик", lastName: suffix, roleId: studentRole.id, crmStudentId, externalLinkStatus: "linked",
    },
  });
  const teacher = await prisma.user.create({
    data: {
      login: `early_t_${suffix}`, phone: `+7712${digits}`, passwordHash: "x",
      firstName: "Учитель", lastName: suffix, roleId: teacherRole.id, crmTeacherId: `crm-teacher-early-${suffix}`, externalLinkStatus: "linked",
    },
  });
  const otherTeacher = await prisma.user.create({
    data: {
      login: `early_o_${suffix}`, phone: `+7713${digits}`, passwordHash: "x",
      firstName: "Другой", lastName: suffix, roleId: teacherRole.id, crmTeacherId: `crm-teacher-other-${suffix}`, externalLinkStatus: "linked",
    },
  });
  t.after(async () => {
    await prisma.leagueXpEvent.deleteMany({ where: { studentId: student.id } });
    await prisma.pointsTransaction.deleteMany({ where: { studentId: student.id } });
    await prisma.offlineLessonStudentCheck.deleteMany({ where: { crmStudentId } });
    await prisma.sectorExam.deleteMany({ where: { directionId: direction.id } });
    await prisma.pointsTransaction.deleteMany({ where: { studentId: student.id } });
    await prisma.learningPlan.deleteMany({ where: { directionId: direction.id } });
    await prisma.learningTopic.deleteMany({ where: { directionId: direction.id } });
    await prisma.userNotification.deleteMany({ where: { userId: { in: [student.id, teacher.id, otherTeacher.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [student.id, teacher.id, otherTeacher.id] } } });
    await prisma.direction.delete({ where: { id: direction.id } });
  });
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    const body = url.includes("/directions")
      ? { directions: [{ crmDirectionId, title: direction.title, isActive: true, updatedAt: "2026-01-01T00:00:00.000Z" }] }
      : { teacher: { crmTeacherId: teacher.crmTeacherId, name: "Учитель", directions: [direction.title] },
          students: [{ crmStudentId, name: "Ученик", firstName: "Ученик", lastName: suffix, phone: "+7", accountBalance: 0, directions: [direction.title], assignedDirectly: true, groups: [], schedules: [], attendanceHistory: [], memberships: [] }],
          groups: [] };
    return new Response(JSON.stringify({ success: true, data: body }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  return { prisma, suffix, crmStudentId, crmDirectionId, direction, student, teacher, otherTeacher };
}

integrationTest("a teacher closes the open sector early for the Points they write, once", async t => {
  const fixture = await createFixture(t);
  const { prisma, crmStudentId, crmDirectionId, student, teacher } = fixture;
  const {
    saveStudentLearningPlanV2, publishStudentLearningPlanV2, getStudentLearningPlanV2, closeStudentSectorEarlyV2,
  } = await import("./learning-plan-v2.service.js");

  const draft = await saveStudentLearningPlanV2(teacher.id, crmStudentId, crmDirectionId, {
    goal: "Первые аккорды", expectedResult: "", skills: "", checkpoint: "", note: "",
    items: [
      { id: "topic-a", title: "Am и E", status: "planned" },
      { id: "topic-b", title: "Бой", status: "planned" },
    ],
    expectedVersion: 0,
  });
  await assert.rejects(
    closeStudentSectorEarlyV2(teacher.id, crmStudentId, crmDirectionId, { points: 100 }),
    (error: { code?: string }) => error.code === "SECTOR_NOT_PUBLISHED",
  );
  await publishStudentLearningPlanV2(teacher.id, crmStudentId, crmDirectionId, draft.version);
  await assert.rejects(
    closeStudentSectorEarlyV2(teacher.id, crmStudentId, crmDirectionId, { points: 251 }),
    (error: { code?: string }) => error.code === "SECTOR_EARLY_CLOSE_POINTS_INVALID",
  );

  const closed = await closeStudentSectorEarlyV2(teacher.id, crmStudentId, crmDirectionId, { points: 120 });
  assert.equal(closed.status, "closed");
  assert.equal(closed.closeReason, "manual");
  assert.equal(closed.awardedPoints, 120);
  const points = await prisma.pointsTransaction.findMany({ where: { studentId: student.id } });
  assert.deepEqual(points.map((row) => [row.amount, row.sourceKey]), [[120, `learning-plan-completion:${closed.id}:${student.id}`]]);
  const note = await prisma.userNotification.findFirst({ where: { userId: student.id, dedupeKey: `sector-closed:${closed.id}` } });
  assert.ok(note, "the student is told the sector is closed");

  await assert.rejects(
    closeStudentSectorEarlyV2(teacher.id, crmStudentId, crmDirectionId, { points: 120 }),
    (error: { code?: string }) => error.code === "MONTHLY_PLAN_NOT_FOUND",
    "nothing open to close a second time",
  );
  const current = await getStudentLearningPlanV2(teacher.id, crmStudentId, crmDirectionId);
  assert.equal(current.plan, null);
  assert.equal(current.nextSequence, 2, "the next sector can be opened right away");
  assert.equal(current.history[0]?.closeReason, "manual");
});

integrationTest("closing early for 0 Points pays nothing but still closes", async t => {
  const fixture = await createFixture(t);
  const { prisma, crmStudentId, crmDirectionId, student, teacher } = fixture;
  const { saveStudentLearningPlanV2, publishStudentLearningPlanV2, closeStudentSectorEarlyV2 } = await import("./learning-plan-v2.service.js");
  const draft = await saveStudentLearningPlanV2(teacher.id, crmStudentId, crmDirectionId, {
    goal: "Ритм", expectedResult: "", skills: "", checkpoint: "", note: "",
    items: [{ id: "topic-a", title: "Восьмые", status: "planned" }],
    expectedVersion: 0,
  });
  await publishStudentLearningPlanV2(teacher.id, crmStudentId, crmDirectionId, draft.version);
  const closed = await closeStudentSectorEarlyV2(teacher.id, crmStudentId, crmDirectionId, { points: 0 });
  assert.equal(closed.status, "closed");
  assert.equal(closed.awardedPoints, 0);
  assert.equal(await prisma.pointsTransaction.count({ where: { studentId: student.id } }), 0);
});

integrationTest("one teacher bonus per student per week, whichever teacher gives it", async t => {
  const fixture = await createFixture(t);
  const { prisma, crmStudentId, student, teacher, otherTeacher } = fixture;
  await prisma.user.update({ where: { id: student.id }, data: { leagueEligible: true } });
  for (const [index, teacherUser] of [teacher, otherTeacher].entries()) {
    await prisma.offlineLessonStudentCheck.create({
      data: { crmClassId: `early-class-${fixture.suffix}-${index}`, crmStudentId, teacherUserId: teacherUser.id, attendanceStatus: "present" },
    });
  }
  const { awardTeacherLeagueBonus, teacherLeagueBonusStatusThisWeek } = await import("./weekly-league.service.js");
  // Plan 1.5: the lesson step «Итог» asks first whether the week's bonus is still free.
  assert.deepEqual(await teacherLeagueBonusStatusThisWeek(teacher.id, [student.id]), [
    { studentId: student.id, given: false, amount: null, byMe: false },
  ]);

  const first = await awardTeacherLeagueBonus({
    teacherId: teacher.id, studentId: student.id, amount: 5, reason: "Ровный ритм", idempotencyKey: randomUUID(),
  });
  assert.equal(first.awarded, true);

  await assert.rejects(
    awardTeacherLeagueBonus({ teacherId: teacher.id, studentId: student.id, amount: 3, reason: "Ещё раз", idempotencyKey: randomUUID() }),
    (error: { code?: string; message?: string }) => error.code === "BONUS_WEEKLY_LIMIT" && /уже дан/.test(error.message ?? ""),
  );
  await assert.rejects(
    awardTeacherLeagueBonus({ teacherId: otherTeacher.id, studentId: student.id, amount: 3, reason: "От вокала", idempotencyKey: randomUUID() }),
    (error: { code?: string; message?: string }) => error.code === "BONUS_WEEKLY_LIMIT" && /другой преподаватель/.test(error.message ?? ""),
  );
  assert.equal(await prisma.leagueXpEvent.count({ where: { studentId: student.id, sourceType: "teacher_bonus" } }), 1);
  assert.deepEqual(await teacherLeagueBonusStatusThisWeek(otherTeacher.id, [student.id]), [
    { studentId: student.id, given: true, amount: 5, byMe: false },
  ]);
});

integrationTest("a teacher gives the bonus at the student's first lesson through the CRM assignment", async t => {
  const fixture = await createFixture(t);
  const { prisma, student, teacher } = fixture;
  await prisma.user.update({ where: { id: student.id }, data: { leagueEligible: true } });
  const { awardTeacherLeagueBonus } = await import("./weekly-league.service.js");

  // No lesson checks yet: the CRM roster of the teacher has the student.
  const awarded = await awardTeacherLeagueBonus({
    teacherId: teacher.id, studentId: student.id, amount: 3, reason: "Первый урок", idempotencyKey: randomUUID(),
  });
  assert.equal(awarded.awarded, true);

  // A teacher with no CRM link and no lessons with the student cannot.
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { slug: "teacher" } });
  const stranger = await prisma.user.create({
    data: {
      login: `early_x_${fixture.suffix}`, phone: `+7714${fixture.suffix.replace(/\D/g, "").padEnd(7, "3").slice(0, 7)}`, passwordHash: "x",
      firstName: "Чужой", lastName: fixture.suffix, roleId: teacherRole.id,
    },
  });
  t.after(() => prisma.user.delete({ where: { id: stranger.id } }));
  await assert.rejects(
    awardTeacherLeagueBonus({ teacherId: stranger.id, studentId: student.id, amount: 1, reason: "Чужой ученик", idempotencyKey: randomUUID() }),
    /только своему ученику/,
  );
});
