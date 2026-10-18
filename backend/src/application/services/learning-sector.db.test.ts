import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.INTEGRATION_SERVICE_SECRET ??= "sector-lifecycle-test-secret-1234";
process.env.CRM_API_URL ??= "http://127.0.0.1:9";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

integrationTest("sectors follow each other: save opens 1, closing needs the test, the next save opens 2", async t => {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const suffix = randomUUID().slice(0, 8);
  const crmStudentId = `crm-sector-${suffix}`;
  const crmDirectionId = `crm-dir-sector-${suffix}`;
  const studentRole = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  const teacherRole = await prisma.role.upsert({ where: { slug: "teacher" }, create: { slug: "teacher", name: "teacher" }, update: {} });
  const direction = await prisma.direction.create({
    data: { title: `Гитара ${suffix}`, slug: `sector-${suffix}`, isPublished: true, crmDirectionId, crmIsActive: true },
  });
  const student = await prisma.user.create({
    data: {
      login: `sector_s_${suffix}`, phone: `+7705${suffix.replace(/\D/g, "").padEnd(7, "6").slice(0, 7)}`, passwordHash: "x",
      firstName: "Ученик", lastName: suffix, roleId: studentRole.id, crmStudentId, externalLinkStatus: "linked",
    },
  });
  const teacher = await prisma.user.create({
    data: {
      login: `sector_t_${suffix}`, phone: `+7706${suffix.replace(/\D/g, "").padEnd(7, "7").slice(0, 7)}`, passwordHash: "x",
      firstName: "Учитель", lastName: suffix, roleId: teacherRole.id, crmTeacherId: `crm-teacher-${suffix}`, externalLinkStatus: "linked",
    },
  });
  t.after(async () => {
    await prisma.learningPlan.deleteMany({ where: { directionId: direction.id } });
    await prisma.learningTopic.deleteMany({ where: { directionId: direction.id } });
    await prisma.userNotification.deleteMany({ where: { userId: { in: [student.id, teacher.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [student.id, teacher.id] } } });
    await prisma.direction.delete({ where: { id: direction.id } });
  });
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    const body = url.includes("/directions")
      ? { directions: [{ crmDirectionId, title: direction.title, isActive: true, updatedAt: "2026-01-01T00:00:00.000Z" }] }
      : { teacher: { crmTeacherId: teacher.crmTeacherId, name: "Учитель", directions: [direction.title] },
          students: [{ crmStudentId, name: "Ученик", firstName: "Ученик", lastName: suffix, phone: "+7", accountBalance: 0, directions: [direction.title], assignedDirectly: true, groups: [], attendanceHistory: [], memberships: [] }] };
    return new Response(JSON.stringify({ success: true, data: body }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const {
    saveStudentLearningPlanV2, publishStudentLearningPlanV2, getStudentLearningPlanV2,
    listPublishedLearningPlansV2, markSectorTestPassed,
  } = await import("./learning-plan-v2.service.js");

  const first = await saveStudentLearningPlanV2(teacher.id, crmStudentId, crmDirectionId, {
    goal: "Первые аккорды", expectedResult: "", skills: "", checkpoint: "", note: "",
    items: [{ id: "topic-a", title: "Am и E", status: "planned", masteryCriteria: "Без пауз" }],
    expectedVersion: 0, preparedTestId: "theory-1-1",
  });
  assert.equal(first.sequence, 1);
  assert.equal(first.status, "active");
  assert.equal(first.preparedTest?.id, "theory-1-1");
  assert.equal(first.preparedTest?.passedAt, null);

  const published = await publishStudentLearningPlanV2(teacher.id, crmStudentId, crmDirectionId, first.version);
  assert.equal(published.publication.isPublished, true);
  const topicId = published.items[0]!.id;

  // Topics done but the test not yet passed: the sector stays open.
  await prisma.learningTopic.update({ where: { id: topicId }, data: { progressPercent: 100 } });
  assert.deepEqual(await markSectorTestPassed(student.id, "theory-9-9"), [], "another test does not touch it");
  let current = await getStudentLearningPlanV2(teacher.id, crmStudentId, crmDirectionId);
  assert.equal(current.plan?.status, "active");

  const closed = await markSectorTestPassed(student.id, "theory-1-1");
  assert.deepEqual(closed, [first.id]);
  current = await getStudentLearningPlanV2(teacher.id, crmStudentId, crmDirectionId);
  assert.equal(current.plan, null, "no open sector after closing");
  assert.equal(current.history[0]?.sequence, 1);
  assert.equal(current.history[0]?.closeReason, "completed");
  assert.equal(current.nextSequence, 2);

  const visible = await listPublishedLearningPlansV2(crmStudentId, []);
  assert.equal(visible.length, 0, "a closed sector is not the student's current sector");
  const withHistory = await listPublishedLearningPlansV2(crmStudentId, [], { includeClosed: true });
  assert.deepEqual(withHistory.map((row) => [row.sequence, row.status]), [[1, "closed"]]);

  // The next save opens sector 2.
  const second = await saveStudentLearningPlanV2(teacher.id, crmStudentId, crmDirectionId, {
    goal: "Бой шестёркой", expectedResult: "", skills: "", checkpoint: "", note: "",
    items: [{ id: "topic-b", title: "Бой шестёркой", status: "planned" }],
    expectedVersion: 0,
  });
  assert.equal(second.sequence, 2);
  assert.equal(second.status, "active");
  assert.equal(second.preparedTest, null);
  const activeCount = await prisma.learningPlan.count({ where: { crmStudentId, directionId: direction.id, status: "active" } });
  assert.equal(activeCount, 1);
});
