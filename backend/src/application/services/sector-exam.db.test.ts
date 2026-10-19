import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.INTEGRATION_SERVICE_SECRET ??= "sector-exam-test-secret-1234";
process.env.CRM_API_URL ??= "http://127.0.0.1:9";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

async function createFixture(t: Parameters<Parameters<typeof test>[1]>[0]) {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { resetTeacherSubstitutionRefresh } = await import("./teacher-substitution.service.js");
  resetTeacherSubstitutionRefresh();
  const suffix = randomUUID().slice(0, 8);
  const digits = suffix.replace(/\D/g, "").padEnd(7, "5").slice(0, 7);
  const crmStudentId = `crm-exam-${suffix}`;
  const crmDirectionId = `crm-dir-exam-${suffix}`;
  const studentRole = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  const teacherRole = await prisma.role.upsert({ where: { slug: "teacher" }, create: { slug: "teacher", name: "teacher" }, update: {} });
  const direction = await prisma.direction.create({
    data: { title: `Гитара ${suffix}`, slug: `exam-${suffix}`, isPublished: true, crmDirectionId, crmIsActive: true },
  });
  const student = await prisma.user.create({
    data: {
      login: `exam_s_${suffix}`, phone: `+7731${digits}`, passwordHash: "x",
      firstName: "Ученик", lastName: suffix, roleId: studentRole.id, crmStudentId, externalLinkStatus: "linked",
    },
  });
  const teacher = await prisma.user.create({
    data: {
      login: `exam_t_${suffix}`, phone: `+7732${digits}`, passwordHash: "x",
      firstName: "Учитель", lastName: suffix, roleId: teacherRole.id, crmTeacherId: `crm-teacher-exam-${suffix}`, externalLinkStatus: "linked",
    },
  });
  const stranger = await prisma.user.create({
    data: {
      login: `exam_x_${suffix}`, phone: `+7733${digits}`, passwordHash: "x",
      firstName: "Чужой", lastName: suffix, roleId: teacherRole.id, crmTeacherId: `crm-teacher-stranger-${suffix}`, externalLinkStatus: "linked",
    },
  });
  t.after(async () => {
    await prisma.sectorExam.deleteMany({ where: { directionId: direction.id } });
    await prisma.pointsTransaction.deleteMany({ where: { studentId: student.id } });
    await prisma.learningPlan.deleteMany({ where: { directionId: direction.id } });
    await prisma.learningTopic.deleteMany({ where: { directionId: direction.id } });
    await prisma.userNotification.deleteMany({ where: { userId: { in: [student.id, teacher.id, stranger.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [student.id, teacher.id, stranger.id] } } });
    await prisma.direction.delete({ where: { id: direction.id } });
  });
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    const own = url.includes(`/teachers/${teacher.crmTeacherId}/`);
    const body = url.includes("/directions")
      ? { directions: [{ crmDirectionId, title: direction.title, isActive: true, updatedAt: "2026-01-01T00:00:00.000Z" }] }
      : url.includes("/offline-classes")
        ? { classes: [] }
        : { teacher: { crmTeacherId: "x", name: "Учитель", directions: [direction.title] },
            students: own ? [{ crmStudentId, name: "Ученик", firstName: "Ученик", lastName: suffix, phone: "+7", accountBalance: 0, directions: [direction.title], assignedDirectly: true, groups: [], schedules: [], attendanceHistory: [], memberships: [] }] : [],
            groups: [] };
    return new Response(JSON.stringify({ success: true, data: body }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const plans = await import("./learning-plan-v2.service.js");
  const draft = await plans.saveStudentLearningPlanV2(teacher.id, crmStudentId, crmDirectionId, {
    goal: "Первые аккорды", expectedResult: "", skills: "", checkpoint: "", note: "",
    items: [
      { id: "topic-a", title: "Am и E", status: "planned", masteryCriteria: "Смена без пауз" },
      { id: "topic-b", title: "Бой восьмыми", status: "planned", masteryCriteria: "Две минуты под метроном" },
    ],
    expectedVersion: 0,
  });
  const published = await plans.publishStudentLearningPlanV2(teacher.id, crmStudentId, crmDirectionId, draft.version);
  const topicIds = published.items.map((item) => item.id);
  const allTopicsDone = () => prisma.learningTopic.updateMany({ where: { id: { in: topicIds } }, data: { progressPercent: 100 } });
  return { prisma, suffix, crmStudentId, crmDirectionId, student, teacher, stranger, planId: published.id, topicIds, allTopicsDone, plans };
}

const rejectsWith = (code: string) => (error: { code?: string }) => {
  assert.equal(error.code, code);
  return true;
};

integrationTest("the exam starts only once scheduled and every topic is at 100 %, then closes the sector with a certificate", async t => {
  const f = await createFixture(t);
  const exams = await import("./sector-exam.service.js");

  const template = await exams.sectorExamTemplate(f.planId);
  assert.deepEqual(template.items.map((item) => [item.kind, item.title, item.criteria]), [
    ["topic", "Am и E", "Смена без пауз"],
    ["topic", "Бой восьмыми", "Две минуты под метроном"],
  ]);
  const exam = await exams.createSectorExam(f.teacher.id, {
    planId: f.planId,
    items: [...template.items, { kind: "custom", title: "Сыграть песню целиком", criteria: "С вокалом" }],
  });
  assert.equal(exam.status, "draft");
  await assert.rejects(exams.createSectorExam(f.teacher.id, { planId: f.planId, items: template.items }), rejectsWith("SECTOR_EXAM_ALREADY_OPEN"));
  await assert.rejects(exams.startSectorExam(f.teacher.id, exam.id), rejectsWith("SECTOR_EXAM_NOT_SCHEDULED"));

  await exams.sendSectorExamForSchedule(exam.id);
  const pending = await exams.listSectorExamsAwaitingSchedule();
  assert.ok(pending.some((item) => item.examId === exam.id && item.itemsCount === 3), "CRM sees it in the queue");

  const lessonAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  await exams.scheduleSectorExamFromCrm(exam.id, { crmClassId: `exam-${f.suffix}`, lessonAt, crmTeacherId: f.teacher.crmTeacherId });
  const told = await f.prisma.userNotification.findFirst({ where: { userId: f.student.id, type: "sector_exam_updated" } });
  assert.ok(told, "the student is told the exam date");
  await assert.rejects(exams.startSectorExam(f.teacher.id, exam.id), rejectsWith("SECTOR_EXAM_TOPICS_INCOMPLETE"));
  await assert.rejects(exams.startSectorExam(f.stranger.id, exam.id), (error: { statusCode?: number }) => error.statusCode === 403);

  // Topics at 100 % do not close an individual sector on their own any more.
  await f.allTopicsDone();
  const still = await f.plans.listPublishedLearningPlansV2(f.crmStudentId, []);
  assert.equal(still[0]?.status, "active");
  assert.equal(still[0]?.exam?.status, "scheduled");
  assert.equal(still[0]?.exam?.scheduledAt?.toISOString(), lessonAt.toISOString());

  const started = await exams.startSectorExam(f.teacher.id, exam.id);
  assert.equal(started.status, "in_progress");
  for (const item of started.items.slice(0, 2)) await exams.markSectorExamItem(f.teacher.id, exam.id, item.id, true);
  await assert.rejects(
    exams.finishSectorExam(f.teacher.id, exam.id, { decision: "close_sector" }),
    rejectsWith("SECTOR_EXAM_ITEMS_UNMARKED"),
  );
  await exams.markSectorExamItem(f.teacher.id, exam.id, started.items[2]!.id, true);

  const finished = await exams.finishSectorExam(f.teacher.id, exam.id, { decision: "close_sector" });
  assert.equal(finished.exam.outcome, "passed");
  assert.match(finished.exam.certificate?.number ?? "", /^MS-\d{4}-[0-9A-F]{8}$/);
  assert.equal(finished.awardedPoints, 250);
  const again = await exams.finishSectorExam(f.teacher.id, exam.id, { decision: "close_sector" });
  assert.equal(again.awardedPoints, 0, "repeating the result pays nothing");
  const points = await f.prisma.pointsTransaction.findMany({ where: { studentId: f.student.id, sourceKey: { startsWith: "learning-plan-completion:" } } });
  assert.deepEqual(points.map((row) => row.amount), [250]);

  const history = await f.plans.listPublishedLearningPlansV2(f.crmStudentId, [], { includeClosed: true });
  assert.equal(history[0]?.status, "closed");
  assert.deepEqual(history[0]?.exam?.items.map((item) => item.done), [true, true, true]);
  const plan = await f.prisma.learningPlan.findUniqueOrThrow({ where: { id: f.planId } });
  assert.equal(plan.closeReason, "exam");
});

integrationTest("a retake keeps the sector open and queues a new exam with the same points", async t => {
  const f = await createFixture(t);
  const exams = await import("./sector-exam.service.js");
  await f.allTopicsDone();
  const template = await exams.sectorExamTemplate(f.planId);
  const exam = await exams.createSectorExam(f.teacher.id, { planId: f.planId, items: template.items, send: true });
  await exams.scheduleSectorExamFromCrm(exam.id, { crmClassId: `exam-${f.suffix}`, lessonAt: new Date() });
  const started = await exams.startSectorExam(f.teacher.id, exam.id);
  await exams.markSectorExamItem(f.teacher.id, exam.id, started.items[0]!.id, true);
  await exams.markSectorExamItem(f.teacher.id, exam.id, started.items[1]!.id, false);

  const result = await exams.finishSectorExam(f.teacher.id, exam.id, { decision: "retake", comment: "Бой пока неровный" });
  assert.equal(result.exam.outcome, "partial");
  assert.equal(result.exam.certificate, null);
  assert.ok(result.retakeExamId);
  const retake = await f.prisma.sectorExam.findUniqueOrThrow({ where: { id: result.retakeExamId! }, include: { items: true } });
  assert.equal(retake.status, "awaiting_schedule");
  assert.equal(retake.attempt, 2);
  assert.equal(retake.previousExamId, exam.id);
  assert.deepEqual(retake.items.map((item) => item.title).sort(), started.items.map((item) => item.title).sort());

  const plan = await f.prisma.learningPlan.findUniqueOrThrow({ where: { id: f.planId } });
  assert.equal(plan.status, "active");
  assert.equal(await f.prisma.pointsTransaction.count({ where: { studentId: f.student.id, sourceKey: { startsWith: "learning-plan-completion:" } } }), 0);

  const teacherView = await exams.listTeacherStudentSectorExams(f.teacher.id, f.crmStudentId);
  assert.equal(teacherView[0]?.exam?.attempt, 2);
  assert.equal(teacherView[0]?.previousExam?.outcome, "partial");
  assert.equal(teacherView[0]?.canStart, false, "the retake waits for CRM to book it");

  // The teacher may still close the sector after a failed exam.
  await exams.scheduleSectorExamFromCrm(retake.id, { crmClassId: `exam-2-${f.suffix}`, lessonAt: new Date() });
  const second = await exams.startSectorExam(f.teacher.id, retake.id);
  for (const item of second.items) await exams.markSectorExamItem(f.teacher.id, retake.id, item.id, false);
  const closed = await exams.finishSectorExam(f.teacher.id, retake.id, { decision: "close_sector" });
  assert.equal(closed.exam.outcome, "failed");
  assert.equal(closed.exam.certificate, null, "no certificate without passing");
  assert.equal(closed.awardedPoints, 250, "the closed sector still pays its 250");
});

integrationTest("an early close cancels the exam prepared for the sector", async t => {
  const f = await createFixture(t);
  const exams = await import("./sector-exam.service.js");
  const template = await exams.sectorExamTemplate(f.planId);
  const exam = await exams.createSectorExam(f.teacher.id, { planId: f.planId, items: template.items, send: true });
  await f.plans.closeStudentSectorEarlyV2(f.teacher.id, f.crmStudentId, f.crmDirectionId, { points: 50 });
  const cancelled = await f.prisma.sectorExam.findUniqueOrThrow({ where: { id: exam.id } });
  assert.equal(cancelled.status, "cancelled");
  assert.equal((await exams.listSectorExamsAwaitingSchedule()).some((item) => item.examId === exam.id), false);
  await assert.rejects(
    exams.createSectorExam(f.teacher.id, { planId: f.planId, items: template.items }),
    rejectsWith("SECTOR_ALREADY_CLOSED"),
  );
});
