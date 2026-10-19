import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.INTEGRATION_SERVICE_SECRET ??= "workspace-test-secret-1234";
process.env.CRM_API_URL ??= "http://127.0.0.1:9";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

/**
 * Answers the CRM calls the workspace makes: the teacher's students, groups
 * and the student's offline summary. `assigned` controls whether the student
 * is on the teacher's roster.
 */
function mockCrm(t: Parameters<Parameters<typeof test>[1]>[0], params: { crmStudentId: string; assigned: boolean }) {
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    let data: unknown;
    if (url.includes("/teachers/") && url.endsWith("/students")) {
      data = {
        students: params.assigned
          ? [{ crmStudentId: params.crmStudentId, name: "Камбар Казыбаев", firstName: "Камбар", lastName: "Казыбаев", phone: "+7 777", directions: ["Гитара"], groups: [],
              attendanceHistory: [
                { crmClassId: "c1", title: "Урок", date: "2026-10-12", startTime: "10:00", classStatus: "completed", attended: true, attendanceStatus: "present" },
                { crmClassId: "c2", title: "Урок", date: "2026-10-14", startTime: "10:00", classStatus: "completed", attended: false, attendanceStatus: "unexcused_absence" },
              ] }]
          : [],
      };
    } else if (url.includes("/teachers/") && url.endsWith("/groups")) {
      data = { groups: [] };
    } else if (url.includes("/students/") && url.includes("offline-summary")) {
      data = {
        profile: { name: "Камбар", groups: [] },
        balanceSnapshot: {},
        upcomingLessons: [],
        lessonHistory: [
          { crmClassId: "c2", title: "Урок", date: "2026-10-14", startTime: "10:00", endTime: "10:45", status: "completed", attended: false },
          { crmClassId: "c1", title: "Урок", date: "2026-10-12", startTime: "10:00", endTime: "10:45", status: "completed", attended: true, topic: "Бой шестёркой", lessonSummary: "Разобрали бой", homework: "Повторить" },
        ],
      };
    } else {
      data = {};
    }
    return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

async function createFixture() {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const suffix = randomUUID().slice(0, 8);
  const digits = suffix.replace(/\D/g, "").padEnd(7, "6").slice(0, 7);
  const studentRole = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  const teacherRole = await prisma.role.upsert({ where: { slug: "teacher" }, create: { slug: "teacher", name: "teacher" }, update: {} });
  const direction = await prisma.direction.create({
    data: { title: `Гитара ${suffix}`, slug: `guitar-ws-${suffix}`, isPublished: true, crmDirectionId: `crm-dir-ws-${suffix}`, crmIsActive: true },
  });
  const student = await prisma.user.create({
    data: {
      login: `ws_s_${suffix}`, phone: `+7705${digits}`, passwordHash: "x",
      firstName: "Камбар", lastName: suffix, roleId: studentRole.id, crmStudentId: `crm-student-ws-${suffix}`, externalLinkStatus: "linked",
    },
  });
  const teacher = await prisma.user.create({
    data: {
      login: `ws_t_${suffix}`, phone: `+7706${digits}`, passwordHash: "x",
      firstName: "Учитель", lastName: suffix, roleId: teacherRole.id, crmTeacherId: `crm-teacher-ws-${suffix}`, externalLinkStatus: "linked",
    },
  });
  const topic = await prisma.learningTopic.create({
    data: { directionId: direction.id, crmStudentId: student.crmStudentId!, title: "Бой шестёркой", progressPercent: 40, responsibleTeacherId: teacher.id },
  });
  const plan = await prisma.learningPlan.create({
    data: {
      directionId: direction.id, crmStudentId: student.crmStudentId!, month: "2026-10", sequence: 2, status: "active",
      currentVersionNumber: 1, publishedVersionNumber: 1, createdById: teacher.id, preparedTestId: "theory-1-1",
      versions: { create: { version: 1, goal: "Сектор 2: ровный бой", createdById: teacher.id, publishedAt: new Date(),
        topics: { create: [{ topicId: topic.id, sortOrder: 0, titleSnapshot: "Бой шестёркой", masteryCriteriaSnapshot: "" }] } } },
    },
  });
  await prisma.learningSectorProposal.create({
    data: { studentUserId: student.id, crmStudentId: student.crmStudentId!, directionId: direction.id, kind: "song", text: "«Кукла колдуна»", status: "new" },
  });
  await prisma.preparedTestAttempt.create({
    data: { testId: "theory-1-1", studentId: student.id, attemptNumber: 1, score: 80, correctAnswers: 4, totalQuestions: 5, passed: true, answers: [] },
  });
  await prisma.leagueXpEvent.create({
    data: { studentId: student.id, amount: 20, sourceType: "offline_lesson", sourceKey: `ws-xp-${suffix}`, description: "Посещение", createdAt: new Date() },
  });
  await prisma.appUsageEvent.create({
    data: { eventKey: `ws-usage-${suffix}`, userId: student.id, eventType: "login", section: "auth", occurredAt: new Date("2026-10-15T07:00:00.000Z") },
  });
  return { prisma, suffix, direction, student, teacher, topic, plan };
}

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function removeFixture({ prisma, direction, student, teacher }: Fixture) {
  await prisma.appUsageEvent.deleteMany({ where: { userId: student.id } });
  await prisma.leagueXpEvent.deleteMany({ where: { studentId: student.id } });
  await prisma.preparedTestAttempt.deleteMany({ where: { studentId: student.id } });
  await prisma.learningSectorProposal.deleteMany({ where: { studentUserId: student.id } });
  await prisma.learningPlan.deleteMany({ where: { directionId: direction.id } });
  await prisma.learningTopic.deleteMany({ where: { directionId: direction.id } });
  await prisma.user.deleteMany({ where: { id: { in: [student.id, teacher.id] } } });
  await prisma.direction.delete({ where: { id: direction.id } });
}

integrationTest("the assigned teacher gets the whole student card in one read", async t => {
  const fixture = await createFixture();
  t.after(() => removeFixture(fixture));
  mockCrm(t, { crmStudentId: fixture.student.crmStudentId!, assigned: true });
  const { getTeacherStudentWorkspace } = await import("./teacher-student-workspace.service.js");

  const card = await getTeacherStudentWorkspace(fixture.teacher.id, fixture.student.crmStudentId!);
  assert.deepEqual(card.access, { kind: "assigned", direct: true });
  assert.equal(card.student.appUserId, fixture.student.id);
  assert.equal(card.student.appActivity.lastLoginAt?.toISOString(), "2026-10-15T07:00:00.000Z");

  assert.equal(card.sectors.length, 1);
  assert.equal(card.sectors[0]?.sequence, 2);
  assert.equal(card.sectors[0]?.items[0]?.progressPercent, 40);
  assert.equal(card.sectors[0]?.preparedTest?.id, "theory-1-1");

  assert.equal(card.proposals.length, 1);
  assert.equal(card.proposals[0]?.text, "«Кукла колдуна»");

  assert.equal(card.tests.length, 1);
  assert.equal(card.tests[0]?.score, 80);
  assert.notEqual(card.tests[0]?.title, "theory-1-1", "the test title comes from the template, not the id");

  assert.equal(card.weekXp?.total, 20);
  assert.deepEqual(card.weekXp?.bySource, [{ sourceType: "offline_lesson", amount: 20 }]);

  assert.equal(card.recentLessons.available, true);
  assert.equal(card.recentLessons.items.length, 2);
  assert.equal(card.recentLessons.items[0]?.crmClassId, "c2", "newest lesson first");
  assert.equal(card.recentLessons.items[1]?.title, "Бой шестёркой");

  assert.equal(card.dynamics?.attendance.rate, 50);
  assert.equal(card.dynamics?.sectors[0]?.percent, 0);
});

integrationTest("a teacher without an assignment is refused, and a lesson gives the sector only", async t => {
  const fixture = await createFixture();
  t.after(() => removeFixture(fixture));
  mockCrm(t, { crmStudentId: fixture.student.crmStudentId!, assigned: false });
  const { getTeacherStudentWorkspace } = await import("./teacher-student-workspace.service.js");

  await assert.rejects(
    getTeacherStudentWorkspace(fixture.teacher.id, fixture.student.crmStudentId!),
    (error: { statusCode?: number }) => error.statusCode === 403,
  );
});
