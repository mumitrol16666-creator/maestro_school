import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.INTEGRATION_SERVICE_SECRET ??= "teacher-today-test-secret-1234";
process.env.CRM_API_URL ??= "http://127.0.0.1:9";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

// Monday 19 October 2026, 10:30 in Aqtobe.
const NOW = new Date("2026-10-19T05:30:00.000Z");

function mockCrm(t: Parameters<Parameters<typeof test>[1]>[0], params: { crmStudentId: string; crmGroupId: string; groupMateId: string }) {
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    let data: unknown = {};
    if (url.includes("/offline-classes")) {
      data = {
        classes: [
          { crmClassId: "today-ind", title: "Гитара", date: "2026-10-19", startTime: "11:00", endTime: "11:45", status: "scheduled", crmIndividualStudentId: params.crmStudentId },
          { crmClassId: "today-group", title: "Ансамбль", date: "2026-10-19", startTime: "09:00", endTime: "09:45", status: "started", group: { crmGroupId: params.crmGroupId, name: "Квартет" } },
          { crmClassId: "old-open", title: "Гитара", date: "2026-10-16", startTime: "17:00", endTime: "17:45", status: "not_filled", crmIndividualStudentId: params.crmStudentId },
          { crmClassId: "old-sent", title: "Гитара", date: "2026-10-15", startTime: "17:00", endTime: "17:45", status: "pending_admin_review", crmIndividualStudentId: params.crmStudentId },
          { crmClassId: "today-cancelled", title: "Гитара", date: "2026-10-19", startTime: "15:00", endTime: "15:45", status: "cancelled", crmIndividualStudentId: params.crmStudentId },
        ],
      };
    } else if (url.includes("/teachers/") && url.endsWith("/students")) {
      data = {
        students: [
          { crmStudentId: params.crmStudentId, name: "Казыбаев Камбар", firstName: "Камбар", lastName: "Казыбаев", phone: "+7", dateOfBirth: "2012-10-21", directions: ["Гитара"], groups: [], attendanceHistory: [] },
          { crmStudentId: params.groupMateId, name: "Серикова Алина", firstName: "Алина", lastName: "Серикова", phone: "+7", dateOfBirth: "2011-03-02", directions: ["Гитара"], groups: [], attendanceHistory: [] },
        ],
      };
    } else if (url.includes("/teachers/") && url.endsWith("/groups")) {
      data = {
        groups: [{ crmGroupId: params.crmGroupId, name: "Квартет", direction: "Гитара", students: [
          { crmStudentId: params.crmStudentId, name: "Казыбаев Камбар", avatarUrl: null, assignedDirectly: false },
          { crmStudentId: params.groupMateId, name: "Серикова Алина", avatarUrl: null, assignedDirectly: false },
        ] }],
      };
    }
    return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

async function createFixture() {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const suffix = randomUUID().slice(0, 8);
  const digits = suffix.replace(/\D/g, "").padEnd(7, "8").slice(0, 7);
  const studentRole = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  const teacherRole = await prisma.role.upsert({ where: { slug: "teacher" }, create: { slug: "teacher", name: "teacher" }, update: {} });
  const direction = await prisma.direction.create({
    data: { title: `Гитара ${suffix}`, slug: `guitar-today-${suffix}`, isPublished: true, crmDirectionId: `crm-dir-today-${suffix}`, crmIsActive: true },
  });
  const student = await prisma.user.create({
    data: {
      login: `today_s_${suffix}`, phone: `+7709${digits}`, passwordHash: "x",
      firstName: "Камбар", lastName: "Казыбаев", roleId: studentRole.id, crmStudentId: `crm-student-today-${suffix}`, externalLinkStatus: "linked",
    },
  });
  const teacher = await prisma.user.create({
    data: {
      login: `today_t_${suffix}`, phone: `+7710${digits}`, passwordHash: "x",
      firstName: "Учитель", lastName: suffix, roleId: teacherRole.id, crmTeacherId: `crm-teacher-today-${suffix}`, externalLinkStatus: "linked",
    },
  });
  const topic = await prisma.learningTopic.create({
    data: { directionId: direction.id, crmStudentId: student.crmStudentId!, title: "Бой шестёркой" },
  });
  const assignment = await prisma.learningHomeworkAssignment.create({
    data: { topicId: topic.id, instructions: "Повторить бой", idempotencyKey: `today-hw-${suffix}` },
  });
  await prisma.learningHomeworkRecipient.create({
    data: { assignmentId: assignment.id, crmStudentId: student.crmStudentId!, studentUserId: student.id, state: "assigned" },
  });
  await prisma.learningSectorProposal.createMany({
    data: [
      { directionId: direction.id, crmStudentId: student.crmStudentId!, studentUserId: student.id, kind: "song", text: "«Кино — Группа крови»", createdAt: new Date("2026-10-14T05:00:00.000Z") },
      { directionId: direction.id, crmStudentId: student.crmStudentId!, studentUserId: student.id, kind: "topic", text: "Баррэ", createdAt: new Date("2026-10-18T05:00:00.000Z") },
    ],
  });
  return { prisma, suffix, direction, student, teacher, groupMateId: `crm-mate-${suffix}`, crmGroupId: `crm-group-${suffix}` };
}

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function removeFixture({ prisma, direction, student, teacher }: Fixture) {
  await prisma.userNotification.deleteMany({ where: { userId: { in: [teacher.id, student.id] } } });
  await prisma.learningSectorProposal.deleteMany({ where: { studentUserId: student.id } });
  await prisma.learningHomeworkAssignment.deleteMany({ where: { topic: { directionId: direction.id } } });
  await prisma.learningTopic.deleteMany({ where: { directionId: direction.id } });
  await prisma.user.deleteMany({ where: { id: { in: [student.id, teacher.id] } } });
  await prisma.direction.delete({ where: { id: direction.id } });
}

integrationTest("«Сегодня» shows today's lessons, owed reports, homework to check, proposals and birthdays", async t => {
  const fixture = await createFixture();
  t.after(() => removeFixture(fixture));
  mockCrm(t, { crmStudentId: fixture.student.crmStudentId!, crmGroupId: fixture.crmGroupId, groupMateId: fixture.groupMateId });
  const { getTeacherToday } = await import("./teacher-today.service.js");

  const today = await getTeacherToday(fixture.teacher.id, { now: NOW });
  assert.equal(today.date, "2026-10-19");
  assert.deepEqual(today.lessons.map((lesson) => lesson.crmClassId), ["today-group", "today-ind"], "sorted by time, cancelled left out");
  const [group, individual] = today.lessons;
  assert.equal(group?.phase, "ended");
  assert.equal(group?.reportOpen, true, "the group lesson ended and its report is owed");
  assert.equal(group?.studentsCount, 2);
  assert.equal(group?.homeworkToCheck, 1, "only the student with open homework counts");
  assert.equal(individual?.phase, "upcoming");
  assert.equal(individual?.studentName, "Казыбаев Камбар");
  assert.equal(individual?.homeworkToCheck, 1);

  assert.deepEqual(today.reports.map((report) => [report.crmClassId, report.overdue]), [["old-open", true], ["today-group", false]]);

  assert.equal(today.proposals.total, 2);
  assert.deepEqual(today.proposals.items.map((item) => item.stale), [true, false], "oldest first, stale after three days");

  assert.deepEqual(today.birthdays.map((item) => [item.name, item.daysUntil, item.age]), [["Казыбаев Камбар", 2, 14]]);

  assert.deepEqual(
    today.attention.map((item) => [item.kind, item.count]),
    [["reports_overdue", 1], ["reports_open", 1], ["proposals_stale", 1], ["proposals_new", 1], ["homework_today", 2]],
  );
});

integrationTest("the morning summary and a stale proposal reminder go out once a day", async t => {
  const fixture = await createFixture();
  t.after(() => removeFixture(fixture));
  mockCrm(t, { crmStudentId: fixture.student.crmStudentId!, crmGroupId: fixture.crmGroupId, groupMateId: fixture.groupMateId });
  // Only this fixture's teacher: other teachers in the test database are left alone.
  const { prisma } = fixture;
  const others = await prisma.user.findMany({
    where: { crmTeacherId: { not: null }, id: { not: fixture.teacher.id }, isActive: true },
    select: { id: true },
  });
  await prisma.user.updateMany({ where: { id: { in: others.map((row) => row.id) } }, data: { isActive: false } });
  t.after(() => prisma.user.updateMany({ where: { id: { in: others.map((row) => row.id) } }, data: { isActive: true } }));

  const { sendTeacherTodayReminders } = await import("./teacher-today-reminder.service.js");
  await sendTeacherTodayReminders(NOW);
  await sendTeacherTodayReminders(new Date(NOW.getTime() + 60 * 60 * 1000));

  const notes = await prisma.userNotification.findMany({ where: { userId: fixture.teacher.id }, orderBy: { createdAt: "asc" } });
  const summary = notes.filter((note) => note.type === "lesson_teacher_reminder");
  assert.equal(summary.length, 1, "one morning summary a day");
  assert.match(summary[0]!.body, /2 урока сегодня/);
  assert.match(summary[0]!.body, /просрочено отчётов: 1/);
  const stale = notes.filter((note) => note.type === "sector_proposal_created");
  assert.equal(stale.length, 1, "one reminder for the proposal waiting more than three days");

  // Before 08:00 nothing is sent.
  await prisma.userNotification.deleteMany({ where: { userId: fixture.teacher.id } });
  await sendTeacherTodayReminders(new Date("2026-10-20T01:00:00.000Z"));
  assert.equal(await prisma.userNotification.count({ where: { userId: fixture.teacher.id } }), 0);
});
