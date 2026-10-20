import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.INTEGRATION_SERVICE_SECRET ??= "family-results-test-secret-1234";
process.env.CRM_API_URL ??= "http://127.0.0.1:9";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

/** Plan 3.3: the parent's «Результаты» — this month's topics and sectors, own and the group's. */
integrationTest("results show this month's mastered topics and sectors, own and the group's, and nothing older", async t => {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { getFamilyChildResults } = await import("./family-results.service.js");
  const suffix = randomUUID().slice(0, 8);
  const crmStudentId = `crm-results-${suffix}`;
  const crmGroupId = `crm-results-group-${suffix}`;
  const studentRole = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  const direction = await prisma.direction.create({
    data: { title: `Гитара ${suffix}`, slug: `results-${suffix}`, isPublished: true, crmDirectionId: `crm-dir-results-${suffix}`, crmIsActive: true },
  });
  const student = await prisma.user.create({
    data: {
      login: `results_${suffix}`, phone: `+7761${suffix.replace(/\D/g, "").padEnd(7, "2").slice(0, 7)}`, passwordHash: "x",
      firstName: "Ученик", lastName: suffix, roleId: studentRole.id, crmStudentId, externalLinkStatus: "linked",
    },
  });
  t.after(async () => {
    await prisma.pointsTransaction.deleteMany({ where: { studentId: student.id } });
    await prisma.sectorExam.deleteMany({ where: { directionId: direction.id } });
    await prisma.learningPlan.deleteMany({ where: { directionId: direction.id } });
    await prisma.learningTopic.deleteMany({ where: { directionId: direction.id } });
    await prisma.user.delete({ where: { id: student.id } });
    await prisma.direction.delete({ where: { id: direction.id } });
  });

  const now = new Date("2026-10-20T10:00:00+05:00");
  const thisMonth = new Date("2026-10-05T12:00:00+05:00");
  const lastMonth = new Date("2026-09-25T12:00:00+05:00");
  await prisma.learningTopic.createMany({
    data: [
      { directionId: direction.id, crmStudentId, title: "Бой шестёркой", progressPercent: 100, masteredAt: thisMonth },
      { directionId: direction.id, crmStudentId, title: "Старая тема", progressPercent: 100, masteredAt: lastMonth },
    ],
  });
  const groupTopic = await prisma.learningTopic.create({
    data: { directionId: direction.id, crmGroupId, title: "Вступление вместе", progressPercent: 100, masteredAt: thisMonth },
  });
  await prisma.pointsTransaction.create({
    data: { studentId: student.id, amount: 100, reason: "Тема группы", sourceKey: `learning-topic-mastery:${groupTopic.id}:${student.id}`, createdAt: thisMonth },
  });
  const ownSector = await prisma.learningPlan.create({
    data: {
      directionId: direction.id, crmStudentId, month: "2026-10", sequence: 1, status: "closed",
      closedAt: thisMonth, closeReason: "exam", publishedVersionNumber: 1, currentVersionNumber: 1,
    },
  });
  await prisma.sectorExam.create({
    data: { planId: ownSector.id, crmStudentId, directionId: direction.id, status: "completed", outcome: "passed", certificateNumber: `MS-2026-${suffix.toUpperCase()}` },
  });
  const groupSector = await prisma.learningPlan.create({
    data: { directionId: direction.id, crmGroupId, month: "2026-10", sequence: 2, status: "closed", closedAt: thisMonth, closeReason: "manual", publishedVersionNumber: 1, currentVersionNumber: 1 },
  });
  await prisma.sectorMemberPass.create({ data: { planId: groupSector.id, crmStudentId, method: "manual", passedAt: thisMonth } });
  await prisma.learningPlan.create({
    data: { directionId: direction.id, crmStudentId, month: "2026-09", sequence: 0, status: "closed", closedAt: lastMonth, closeReason: "manual", publishedVersionNumber: 1, currentVersionNumber: 1 },
  });

  const results = await getFamilyChildResults(student.id, now);
  assert.equal(results?.month, "2026-10");
  assert.deepEqual(results?.topics.map((topic) => [topic.title, topic.group]).sort(), [["Бой шестёркой", false], ["Вступление вместе", true]]);
  assert.deepEqual(
    results?.sectors.map((sector) => [sector.scope, sector.sequence, sector.how, sector.certificate]).sort(),
    [["group", 2, "teacher", null], ["student", 1, "exam", `MS-2026-${suffix.toUpperCase()}`]],
  );
  assert.equal(results?.level, null, "no LEVEL before the economy epoch");
});
