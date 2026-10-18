import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.INTEGRATION_SERVICE_SECRET ??= "sector-proposal-test-secret-1234";
process.env.CRM_API_URL ??= "http://127.0.0.1:9";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

async function createFixture() {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const suffix = randomUUID().slice(0, 8);
  const studentRole = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  const teacherRole = await prisma.role.upsert({ where: { slug: "teacher" }, create: { slug: "teacher", name: "teacher" }, update: {} });
  const direction = await prisma.direction.create({
    data: { title: `Гитара ${suffix}`, slug: `guitar-${suffix}`, isPublished: true, crmDirectionId: `crm-dir-${suffix}`, crmIsActive: true },
  });
  const student = await prisma.user.create({
    data: {
      login: `proposal_s_${suffix}`, phone: `+7703${suffix.replace(/\D/g, "").padEnd(7, "4").slice(0, 7)}`, passwordHash: "x",
      firstName: "Ученик", lastName: suffix, roleId: studentRole.id, crmStudentId: `crm-student-${suffix}`, externalLinkStatus: "linked",
    },
  });
  const teacher = await prisma.user.create({
    data: {
      login: `proposal_t_${suffix}`, phone: `+7704${suffix.replace(/\D/g, "").padEnd(7, "5").slice(0, 7)}`, passwordHash: "x",
      firstName: "Учитель", lastName: suffix, roleId: teacherRole.id, crmTeacherId: `crm-teacher-${suffix}`, externalLinkStatus: "linked",
    },
  });
  return { prisma, suffix, direction, student, teacher };
}

integrationTest("a student proposes into the sector, the teacher decides, both are notified", async t => {
  const { prisma, direction, student, teacher } = await createFixture();
  t.after(async () => {
    await prisma.learningSectorProposal.deleteMany({ where: { studentUserId: student.id } });
    await prisma.userNotification.deleteMany({ where: { userId: { in: [student.id, teacher.id] } } });
    await prisma.learningTopic.deleteMany({ where: { directionId: direction.id } });
    await prisma.learningPlan.deleteMany({ where: { directionId: direction.id } });
    await prisma.user.deleteMany({ where: { id: { in: [student.id, teacher.id] } } });
    await prisma.direction.delete({ where: { id: direction.id } });
  });
  // The teacher is responsible for a topic of this student: that is who gets told.
  await prisma.learningTopic.create({
    data: { directionId: direction.id, crmStudentId: student.crmStudentId!, title: "Бой шестёркой", responsibleTeacherId: teacher.id },
  });
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    success: true,
    data: { students: [{ crmStudentId: student.crmStudentId, name: "Ученик", firstName: "Ученик", lastName: "Т", phone: "+7", directions: [], groups: [] }] },
  }), { status: 200, headers: { "Content-Type": "application/json" } }));

  const { createStudentSectorProposal, listTeacherSectorProposals, decideSectorProposal, listStudentSectorProposals } = await import("./sector-proposal.service.js");
  const created = await createStudentSectorProposal(student.id, {
    crmDirectionId: direction.crmDirectionId!, kind: "song", text: "Хочу разобрать «Кукла колдуна»", link: "https://youtube.com/watch?v=x",
  });
  assert.equal(created.status, "new");
  assert.equal(created.sector, null, "no active sector yet, the proposal still lands");
  const teacherNote = await prisma.userNotification.findFirst({ where: { userId: teacher.id, type: "sector_proposal_created" } });
  assert.ok(teacherNote, "the responsible teacher is notified");

  const queue = await listTeacherSectorProposals(teacher.id, { status: "new" });
  assert.equal(queue.length, 1);
  await assert.rejects(decideSectorProposal(teacher.id, created.id, { decision: "declined" }), (error: { code?: string }) => error.code === "SECTOR_PROPOSAL_REPLY_REQUIRED");
  const decided = await decideSectorProposal(teacher.id, created.id, { decision: "accepted", reply: "Берём в сектор 3" });
  assert.equal(decided.status, "accepted");
  assert.equal(decided.decidedBy?.id, teacher.id);
  const studentNote = await prisma.userNotification.findFirst({ where: { userId: student.id, type: "sector_proposal_decided" } });
  assert.ok(studentNote);
  const mine = await listStudentSectorProposals(student.id);
  assert.equal(mine[0]?.teacherReply, "Берём в сектор 3");
  // Deciding twice does not flip anything.
  const again = await decideSectorProposal(teacher.id, created.id, { decision: "declined", reply: "нет" });
  assert.equal(again.status, "accepted");
});

integrationTest("sector templates are numbered per direction and publish only with topics", async t => {
  const { prisma, direction, teacher } = await createFixture();
  t.after(async () => {
    await prisma.sectorTemplate.deleteMany({ where: { directionId: direction.id } });
    await prisma.user.deleteMany({ where: { roleId: { in: (await prisma.role.findMany({ where: { slug: { in: ["student", "teacher"] } }, select: { id: true } })).map((r) => r.id) }, lastName: direction.slug.slice(7) } });
    await prisma.direction.delete({ where: { id: direction.id } });
  });
  const { createSectorTemplate, updateSectorTemplate, setSectorTemplatePublished, listSectorTemplates } = await import("./sector-template.service.js");
  const empty = await createSectorTemplate(teacher.id, { crmDirectionId: direction.crmDirectionId, number: 1, title: "Ступень 1", topics: [] });
  await assert.rejects(setSectorTemplatePublished(empty.id, true), (error: { code?: string }) => error.code === "SECTOR_TEMPLATE_TOPICS_REQUIRED");
  await assert.rejects(
    createSectorTemplate(teacher.id, { crmDirectionId: direction.crmDirectionId, number: 1, title: "Дубль", topics: [] }),
    (error: { code?: string }) => error.code === "SECTOR_TEMPLATE_NUMBER_TAKEN",
  );
  const filled = await updateSectorTemplate(empty.id, {
    crmDirectionId: direction.crmDirectionId, number: 1, title: "Ступень 1. Первые аккорды", preparedTestId: "theory-1-1",
    topics: [
      { line: "chords", title: "Am и E", masteryCriteria: "Переход без паузы" },
      { line: "melody", title: "Мелодия «Кузнечик»" },
      { line: "theory", title: "Струны и строй" },
    ],
  });
  assert.equal(filled.topics.length, 3);
  assert.equal(filled.preparedTest?.known, true);
  const published = await setSectorTemplatePublished(filled.id, true);
  assert.equal(published.isPublished, true);
  const forTeacher = await listSectorTemplates({ crmDirectionId: direction.crmDirectionId, publishedOnly: true });
  assert.deepEqual(forTeacher.map((row) => row.number), [1]);
});
