import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.INTEGRATION_SERVICE_SECRET ??= "group-sector-test-secret-1234";
process.env.CRM_API_URL ??= "http://127.0.0.1:9";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

/**
 * Plan 1.13: a group's sector. Every member sits their own exam, the 250 Points go only to members
 * who passed (by exam or counted by the teacher), and the group moves on without the others, who
 * retake later.
 */
async function createFixture(t: Parameters<Parameters<typeof test>[1]>[0]) {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { resetTeacherSubstitutionRefresh } = await import("./teacher-substitution.service.js");
  resetTeacherSubstitutionRefresh();
  const suffix = randomUUID().slice(0, 8);
  const digits = suffix.replace(/\D/g, "").padEnd(6, "4").slice(0, 6);
  const crmDirectionId = `crm-dir-group-${suffix}`;
  const crmGroupId = `crm-group-${suffix}`;
  const studentRole = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  const teacherRole = await prisma.role.upsert({ where: { slug: "teacher" }, create: { slug: "teacher", name: "teacher" }, update: {} });
  const direction = await prisma.direction.create({
    data: { title: `Ансамбль ${suffix}`, slug: `group-${suffix}`, isPublished: true, crmDirectionId, crmIsActive: true },
  });
  const makeStudent = (index: number) => prisma.user.create({
    data: {
      login: `group_s${index}_${suffix}`, phone: `+774${index}${digits}`, passwordHash: "x",
      firstName: `Ученик${index}`, lastName: suffix, roleId: studentRole.id, crmStudentId: `crm-group-s${index}-${suffix}`, externalLinkStatus: "linked",
    },
  });
  const [first, second] = [await makeStudent(1), await makeStudent(2)];
  const teacher = await prisma.user.create({
    data: {
      login: `group_t_${suffix}`, phone: `+7750${digits}0`, passwordHash: "x",
      firstName: "Учитель", lastName: suffix, roleId: teacherRole.id, crmTeacherId: `crm-teacher-group-${suffix}`, externalLinkStatus: "linked",
    },
  });
  const stranger = await prisma.user.create({
    data: {
      login: `group_x_${suffix}`, phone: `+7751${digits}0`, passwordHash: "x",
      firstName: "Чужой", lastName: suffix, roleId: teacherRole.id, crmTeacherId: `crm-teacher-stranger-${suffix}`, externalLinkStatus: "linked",
    },
  });
  const users = [first, second, teacher, stranger];
  t.after(async () => {
    await prisma.sectorExam.deleteMany({ where: { directionId: direction.id } });
    await prisma.pointsTransaction.deleteMany({ where: { studentId: { in: [first.id, second.id] } } });
    await prisma.learningPlan.deleteMany({ where: { directionId: direction.id } });
    await prisma.learningTopic.deleteMany({ where: { directionId: direction.id } });
    await prisma.userNotification.deleteMany({ where: { userId: { in: users.map((user) => user.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await prisma.direction.delete({ where: { id: direction.id } });
  });
  const members = [first, second].map((user) => ({ crmStudentId: user.crmStudentId!, name: user.firstName, avatarUrl: null, assignedDirectly: false }));
  const group = { crmGroupId, name: "Квартет", direction: direction.title, level: "", color: null, description: null, maxStudents: 4, schedules: [], students: members };
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    let body: unknown = {};
    if (url.includes("/directions")) {
      body = { directions: [{ crmDirectionId, title: direction.title, isActive: true, updatedAt: "2026-01-01T00:00:00.000Z" }] };
    } else if (url.includes(`/teachers/${teacher.crmTeacherId}/groups`)) {
      body = { teacher: { crmTeacherId: teacher.crmTeacherId, name: "Учитель", directions: [direction.title] }, groups: [group] };
    } else if (url.includes("/groups") && !url.includes("/teachers/")) {
      body = { groups: [{ crmGroupId, name: "Квартет", direction: direction.title, isActive: true, crmTeacherId: teacher.crmTeacherId, students: members }] };
    } else if (url.includes("/groups")) {
      body = { teacher: null, groups: [] };
    } else if (url.includes("/offline-classes")) {
      body = { classes: [] };
    } else {
      body = { teacher: null, students: [] };
    }
    return new Response(JSON.stringify({ success: true, data: body }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const plans = await import("./learning-plan-v2.service.js");
  const draft = await plans.saveGroupLearningPlanV2(teacher.id, crmGroupId, crmDirectionId, {
    goal: "Ансамблевая игра", expectedResult: "", skills: "", checkpoint: "", note: "",
    items: [{ id: "topic-a", title: "Вступление вместе", status: "planned", masteryCriteria: "Без расхождений" }],
    expectedVersion: 0,
  });
  const published = await plans.publishGroupLearningPlanV2(teacher.id, crmGroupId, crmDirectionId, draft.version);
  const topicIds = published.items.map((item) => item.id);
  await prisma.learningTopic.updateMany({ where: { id: { in: topicIds } }, data: { progressPercent: 100 } });
  return { prisma, suffix, crmGroupId, crmDirectionId, first, second, teacher, stranger, planId: published.id, plans };
}

const rejectsWith = (code: string) => (error: { code?: string }) => {
  assert.equal(error.code, code);
  return true;
};

const completionPoints = (prisma: Awaited<ReturnType<typeof createFixture>>["prisma"], studentId: string) => prisma.pointsTransaction.findMany({
  where: { studentId, sourceKey: { startsWith: "learning-plan-completion:" } },
  select: { amount: true },
});

integrationTest("each member sits their own exam; 250 only to who passed; the group moves on and the rest retake", async t => {
  const f = await createFixture(t);
  const exams = await import("./sector-exam.service.js");
  const groups = await import("./group-sector.service.js");

  // All topics at 100 % no longer close a group sector by themselves.
  assert.equal((await f.prisma.learningPlan.findUniqueOrThrow({ where: { id: f.planId } })).status, "active");

  const board = await exams.listAdminSectorExamBoard();
  const row = board.groupSectors.find((item) => item.planId === f.planId);
  assert.equal(row?.groupName, "Квартет");
  assert.deepEqual(row?.members.map((member) => member.crmStudentId).sort(), [f.first.crmStudentId, f.second.crmStudentId].sort());

  const template = await exams.sectorExamTemplate(f.planId);
  await assert.rejects(exams.createSectorExam(f.teacher.id, { planId: f.planId, items: template.items }), rejectsWith("SECTOR_EXAM_GROUP_MEMBERS_REQUIRED"));
  const created = await exams.createGroupSectorExams(f.teacher.id, {
    planId: f.planId, crmStudentIds: [f.first.crmStudentId!, f.second.crmStudentId!], items: template.items, send: true,
  });
  assert.equal(created.created.length, 2);
  const again = await exams.createGroupSectorExams(f.teacher.id, { planId: f.planId, crmStudentIds: [f.first.crmStudentId!], items: template.items });
  assert.deepEqual(again.skipped, [{ crmStudentId: f.first.crmStudentId, reason: "open_exam" }]);

  const queue = await exams.listSectorExamsAwaitingSchedule();
  const mine = queue.filter((item) => item.crmGroupId === f.crmGroupId);
  assert.equal(mine.length, 2, "CRM sees one exam per member, marked with the group");

  // CRM books both members into one exam lesson.
  const lessonAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  for (const exam of created.created) {
    await exams.scheduleSectorExamFromCrm(exam.id, { crmClassId: `group-exam-${f.suffix}`, lessonAt, crmTeacherId: f.teacher.crmTeacherId });
  }
  const [firstExam, secondExam] = created.created.sort((left) => (left.crmStudentId === f.first.crmStudentId ? -1 : 1));
  await assert.rejects(exams.startSectorExam(f.stranger.id, firstExam!.id), (error: { statusCode?: number }) => error.statusCode === 403);
  for (const exam of [firstExam!, secondExam!]) {
    const started = await exams.startSectorExam(f.teacher.id, exam.id);
    await exams.markSectorExamItem(f.teacher.id, exam.id, started.items[0]!.id, exam === firstExam);
  }

  await assert.rejects(exams.finishSectorExam(f.teacher.id, firstExam!.id, { decision: "close_sector" }), rejectsWith("SECTOR_EXAM_DECISION_INVALID"));
  const passed = await exams.finishSectorExam(f.teacher.id, firstExam!.id, { decision: "pass" });
  assert.equal(passed.awardedPoints, 250);
  assert.match(passed.exam.certificate?.number ?? "", /^MS-/);
  assert.equal((await exams.finishSectorExam(f.teacher.id, firstExam!.id, { decision: "pass" })).awardedPoints, 0);
  const retake = await exams.finishSectorExam(f.teacher.id, secondExam!.id, { decision: "retake" });
  assert.ok(retake.retakeExamId);
  assert.equal((await f.prisma.learningPlan.findUniqueOrThrow({ where: { id: f.planId } })).status, "active", "a pass does not close the group's sector");

  // The group moves on.
  await assert.rejects(groups.closeGroupSector(f.stranger.id, f.crmGroupId, f.planId), (error: { statusCode?: number }) => error.statusCode === 403);
  await groups.closeGroupSector(f.teacher.id, f.crmGroupId, f.planId);
  const closedPlan = await f.prisma.learningPlan.findUniqueOrThrow({ where: { id: f.planId } });
  assert.equal(closedPlan.status, "closed");
  assert.equal(closedPlan.closeReason, "exam");
  await assert.rejects(groups.closeGroupSector(f.teacher.id, f.crmGroupId, f.planId), rejectsWith("SECTOR_ALREADY_CLOSED"));
  assert.deepEqual((await completionPoints(f.prisma, f.first.id)).map((row) => row.amount), [250]);
  assert.deepEqual(await completionPoints(f.prisma, f.second.id), [], "closing pays nobody");

  // The teacher still sees the closed sector while a member has a retake.
  const page = await exams.listTeacherGroupSectorExams(f.teacher.id, f.crmGroupId);
  const sector = page.sectors.find((item) => item.planId === f.planId);
  assert.equal(sector?.status, "closed");
  const secondRow = sector?.members.find((member) => member.crmStudentId === f.second.crmStudentId);
  assert.equal(secondRow?.exam?.status, "awaiting_schedule");
  assert.equal(secondRow?.exam?.attempt, 2);
  assert.equal(sector?.members.find((member) => member.crmStudentId === f.first.crmStudentId)?.pass?.method, "exam");

  // The retake after the group moved on.
  await exams.scheduleSectorExamFromCrm(retake.retakeExamId!, { crmClassId: `group-retake-${f.suffix}`, lessonAt, crmTeacherId: f.teacher.crmTeacherId });
  const retakeStarted = await exams.startSectorExam(f.teacher.id, retake.retakeExamId!);
  await exams.markSectorExamItem(f.teacher.id, retakeStarted.id, retakeStarted.items[0]!.id, true);
  assert.equal((await exams.finishSectorExam(f.teacher.id, retakeStarted.id, { decision: "pass" })).awardedPoints, 250);

  // Each member sees their own exam and pass in the group's sector.
  const seenBySecond = await f.plans.listPublishedLearningPlansV2(f.second.crmStudentId!, [f.crmGroupId], { includeClosed: true });
  const groupSector = seenBySecond.find((item) => item.id === f.planId);
  assert.equal(groupSector?.scope, "group");
  assert.equal(groupSector?.exam?.attempt, 2);
  assert.equal(groupSector?.memberPass?.method, "exam");
  assert.equal(groupSector?.memberPass?.points, 250);
});

integrationTest("the teacher counts a member without an exam: 250 once, the member's waiting exam is cancelled", async t => {
  const f = await createFixture(t);
  const exams = await import("./sector-exam.service.js");
  const groups = await import("./group-sector.service.js");
  const template = await exams.sectorExamTemplate(f.planId);
  const { created } = await exams.createGroupSectorExams(f.teacher.id, {
    planId: f.planId, crmStudentIds: [f.first.crmStudentId!], items: template.items, send: true,
  });

  await assert.rejects(
    groups.passGroupSectorMemberManually(f.stranger.id, f.crmGroupId, f.planId, f.first.crmStudentId!),
    (error: { statusCode?: number }) => error.statusCode === 403,
  );
  await assert.rejects(
    groups.passGroupSectorMemberManually(f.teacher.id, f.crmGroupId, f.planId, "crm-not-in-group"),
    rejectsWith("GROUP_MEMBER_NOT_FOUND"),
  );
  const pass = await groups.passGroupSectorMemberManually(f.teacher.id, f.crmGroupId, f.planId, f.first.crmStudentId!);
  assert.equal(pass.method, "manual");
  assert.equal(pass.awardedPoints, 250);
  assert.equal((await groups.passGroupSectorMemberManually(f.teacher.id, f.crmGroupId, f.planId, f.first.crmStudentId!)).awardedPoints, 0);
  assert.deepEqual((await completionPoints(f.prisma, f.first.id)).map((row) => row.amount), [250]);
  const cancelled = await f.prisma.sectorExam.findUniqueOrThrow({ where: { id: created[0]!.id } });
  assert.equal(cancelled.status, "cancelled");

  // A member already passed is not given another exam; the others are.
  const next = await exams.createGroupSectorExams(f.teacher.id, {
    planId: f.planId, crmStudentIds: [f.first.crmStudentId!, f.second.crmStudentId!], items: template.items,
  });
  assert.deepEqual(next.skipped, [{ crmStudentId: f.first.crmStudentId, reason: "passed" }]);
  assert.equal(next.created.length, 1);

  // Without any exam pass the group's sector closes as a manual close.
  await groups.closeGroupSector(f.teacher.id, f.crmGroupId, f.planId);
  assert.equal((await f.prisma.learningPlan.findUniqueOrThrow({ where: { id: f.planId } })).closeReason, "manual");
  const draftLeft = await f.prisma.sectorExam.findUniqueOrThrow({ where: { id: next.created[0]!.id } });
  assert.equal(draftLeft.status, "cancelled", "a draft nobody sent is dropped when the group moves on");
});
