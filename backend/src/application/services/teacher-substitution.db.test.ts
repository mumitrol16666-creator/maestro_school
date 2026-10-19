import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.INTEGRATION_SERVICE_SECRET ??= "teacher-substitution-test-secret-1234";
process.env.CRM_API_URL ??= "http://127.0.0.1:9";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

type Lesson = Record<string, unknown>;

async function createFixture(t: Parameters<Parameters<typeof test>[1]>[0]) {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { resetTeacherSubstitutionRefresh } = await import("./teacher-substitution.service.js");
  resetTeacherSubstitutionRefresh();
  const suffix = randomUUID().slice(0, 8);
  const digits = suffix.replace(/\D/g, "").padEnd(7, "4").slice(0, 7);
  const crmStudentId = `crm-sub-s-${suffix}`;
  const crmGroupStudentId = `crm-sub-g-${suffix}`;
  const crmGroupId = `crm-sub-group-${suffix}`;
  const crmDirectionId = `crm-dir-sub-${suffix}`;
  const crmRegular = `crm-sub-regular-${suffix}`;
  const crmSubstitute = `crm-sub-cover-${suffix}`;
  const studentRole = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  const teacherRole = await prisma.role.upsert({ where: { slug: "teacher" }, create: { slug: "teacher", name: "teacher" }, update: {} });
  const direction = await prisma.direction.create({
    data: { title: `Гитара ${suffix}`, slug: `sub-${suffix}`, isPublished: true, crmDirectionId, crmIsActive: true },
  });
  const student = await prisma.user.create({
    data: {
      login: `sub_s_${suffix}`, phone: `+7721${digits}`, passwordHash: "x",
      firstName: "Ученик", lastName: suffix, roleId: studentRole.id, crmStudentId, externalLinkStatus: "linked",
    },
  });
  const regular = await prisma.user.create({
    data: {
      login: `sub_r_${suffix}`, phone: `+7722${digits}`, passwordHash: "x",
      firstName: "Основной", lastName: "Петров", roleId: teacherRole.id, crmTeacherId: crmRegular, externalLinkStatus: "linked",
    },
  });
  const substitute = await prisma.user.create({
    data: {
      login: `sub_c_${suffix}`, phone: `+7723${digits}`, passwordHash: "x",
      firstName: "Замена", lastName: suffix, roleId: teacherRole.id, crmTeacherId: crmSubstitute, externalLinkStatus: "linked",
    },
  });
  t.after(async () => {
    await prisma.learningConversation.deleteMany({ where: { members: { some: { userId: { in: [student.id, regular.id, substitute.id] } } } } });
    await prisma.teacherSubstitution.deleteMany({ where: { crmTeacherId: { in: [crmRegular, crmSubstitute] } } });
    await prisma.learningPlan.deleteMany({ where: { directionId: direction.id } });
    await prisma.learningTopic.deleteMany({ where: { directionId: direction.id } });
    await prisma.userNotification.deleteMany({ where: { userId: { in: [student.id, regular.id, substitute.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [student.id, regular.id, substitute.id] } } });
    await prisma.direction.delete({ where: { id: direction.id } });
  });

  const rosterStudent = (id: string, name: string) => ({
    crmStudentId: id, name, firstName: name, lastName: suffix, phone: "+7", accountBalance: 0,
    directions: [direction.title], assignedDirectly: true, groups: [], schedules: [], attendanceHistory: [], memberships: [],
  });
  const state = { substituteLessons: [] as Lesson[], agendaCalls: 0 };
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    let body: unknown = {};
    if (url.includes("/directions")) {
      body = { directions: [{ crmDirectionId, title: direction.title, isActive: true, updatedAt: "2026-01-01T00:00:00.000Z" }] };
    } else if (url.includes(`/teachers/${crmRegular}/students`)) {
      body = { teacher: { crmTeacherId: crmRegular, name: "Петров", directions: [direction.title] },
        students: [rosterStudent(crmStudentId, "Ученик"), rosterStudent(crmGroupStudentId, "Групповой")] };
    } else if (url.includes(`/teachers/${crmRegular}/groups`)) {
      body = { teacher: { crmTeacherId: crmRegular, name: "Петров", directions: [direction.title] },
        groups: [{ crmGroupId, name: "Группа", direction: direction.title, level: "", color: null, description: null, maxStudents: 6, schedules: [],
          students: [{ crmStudentId: crmGroupStudentId, name: "Групповой", avatarUrl: null, assignedDirectly: false }] }] };
    } else if (url.includes(`/teachers/${crmSubstitute}/students`)) {
      body = { teacher: { crmTeacherId: crmSubstitute, name: "Замена", directions: [direction.title] }, students: [] };
    } else if (url.includes(`/teachers/${crmSubstitute}/groups`)) {
      body = { teacher: { crmTeacherId: crmSubstitute, name: "Замена", directions: [direction.title] }, groups: [] };
    } else if (url.includes(`/teachers/${crmSubstitute}/offline-classes`)) {
      state.agendaCalls += 1;
      body = { crmTeacherId: crmSubstitute, classes: state.substituteLessons };
    } else if (url.includes("/offline-classes")) {
      body = { classes: [] };
    }
    return new Response(JSON.stringify({ success: true, data: body }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const lesson = (crmClassId: string, extra: Lesson = {}): Lesson => ({
    crmClassId, title: "Гитара", date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), startTime: "10:00", endTime: "11:00",
    status: "scheduled", classType: "individual", group: null, crmIndividualStudentId: crmStudentId,
    teacher: { crmTeacherId: crmSubstitute, name: "Замена" }, originalCrmTeacherId: crmRegular, substitution: true, ...extra,
  });
  return {
    prisma, suffix, state, lesson, resetTeacherSubstitutionRefresh,
    crmStudentId, crmGroupStudentId, crmGroupId, crmDirectionId, crmRegular, crmSubstitute, student, regular, substitute,
  };
}

integrationTest("a substitute works with the lesson's student from assignment until approval", async t => {
  const f = await createFixture(t);
  const { getTeacherStudentWorkspace } = await import("./teacher-student-workspace.service.js");
  const { saveStudentLearningPlanV2, getStudentLearningPlanV2 } = await import("./learning-plan-v2.service.js");
  const { closeLessonSubstitutions, reopenLessonSubstitutions } = await import("./teacher-substitution.service.js");

  // The regular teacher opens a sector; the future substitute has no access yet.
  await saveStudentLearningPlanV2(f.regular.id, f.crmStudentId, f.crmDirectionId, {
    goal: "Аккорды", expectedResult: "", skills: "", checkpoint: "", note: "",
    items: [{ id: "topic-a", title: "Am и E", status: "planned" }], expectedVersion: 0,
  });
  await assert.rejects(getTeacherStudentWorkspace(f.substitute.id, f.crmStudentId), (error: { statusCode?: number }) => error.statusCode === 403);
  await assert.rejects(
    getStudentLearningPlanV2(f.substitute.id, f.crmStudentId, f.crmDirectionId),
    (error: { code?: string }) => error.code === "STUDENT_NOT_ASSIGNED",
  );

  // CRM hands the lesson to the substitute: the first miss re-reads their lessons.
  const crmClassId = `sub-class-${f.suffix}`;
  f.state.substituteLessons = [f.lesson(crmClassId)];
  f.resetTeacherSubstitutionRefresh();
  const during = await getTeacherStudentWorkspace(f.substitute.id, f.crmStudentId);
  assert.equal(during.access.kind, "substitute");
  assert.equal(during.access.kind === "substitute" && during.access.crmClassId, crmClassId);
  assert.equal(during.access.kind === "substitute" && during.access.originalTeacherName, "Петров Основной");
  assert.ok(during.recentLessons.available, "the substitute sees the history, not the sector alone");
  const plan = await getStudentLearningPlanV2(f.substitute.id, f.crmStudentId, f.crmDirectionId);
  assert.equal(plan.plan?.goal, "Аккорды", "the substitute sees the regular teacher's sector");

  // Approval closes it; CRM now reports the lesson completed, so a re-read keeps it closed.
  assert.equal(await closeLessonSubstitutions(crmClassId, "approved"), 1);
  f.state.substituteLessons = [f.lesson(crmClassId, { status: "completed" })];
  f.resetTeacherSubstitutionRefresh();
  await assert.rejects(getTeacherStudentWorkspace(f.substitute.id, f.crmStudentId), (error: { statusCode?: number }) => error.statusCode === 403);
  const row = await f.prisma.teacherSubstitution.findFirstOrThrow({ where: { crmClassId } });
  assert.equal(row.closeReason, "approved");

  // A lesson returned after approval is the substitute's work again.
  assert.equal(await reopenLessonSubstitutions(crmClassId), 1);
  f.state.substituteLessons = [f.lesson(crmClassId, { status: "pending_admin_review" })];
  f.resetTeacherSubstitutionRefresh();
  assert.equal((await getTeacherStudentWorkspace(f.substitute.id, f.crmStudentId)).access.kind, "substitute");

  // The regular teacher is never limited by any of this.
  const regular = await getTeacherStudentWorkspace(f.regular.id, f.crmStudentId);
  assert.equal(regular.access.kind, "assigned");
});

integrationTest("each new lesson opens access again and a lesson handed back closes it", async t => {
  const f = await createFixture(t);
  const { getTeacherStudentWorkspace } = await import("./teacher-student-workspace.service.js");
  const { closeLessonSubstitutions, syncTeacherSubstitutions } = await import("./teacher-substitution.service.js");

  const first = `sub-first-${f.suffix}`;
  const second = `sub-second-${f.suffix}`;
  f.state.substituteLessons = [f.lesson(first)];
  f.resetTeacherSubstitutionRefresh();
  assert.equal((await getTeacherStudentWorkspace(f.substitute.id, f.crmStudentId)).access.kind, "substitute");
  await closeLessonSubstitutions(first, "approved");
  f.state.substituteLessons = [f.lesson(first, { status: "completed" })];
  f.resetTeacherSubstitutionRefresh();
  await assert.rejects(getTeacherStudentWorkspace(f.substitute.id, f.crmStudentId), (error: { statusCode?: number }) => error.statusCode === 403);

  f.state.substituteLessons = [f.lesson(first, { status: "completed" }), f.lesson(second)];
  f.resetTeacherSubstitutionRefresh();
  const again = await getTeacherStudentWorkspace(f.substitute.id, f.crmStudentId);
  assert.equal(again.access.kind === "substitute" && again.access.crmClassId, second);

  // CRM gives the second lesson back to the regular teacher: it drops out of the substitute's range.
  const range = { from: new Date(Date.now() - 86_400_000).toISOString(), to: new Date(Date.now() + 7 * 86_400_000).toISOString() };
  await syncTeacherSubstitutions(f.crmSubstitute, [f.lesson(first, { status: "completed" })], range);
  const handedBack = await f.prisma.teacherSubstitution.findFirstOrThrow({ where: { crmClassId: second } });
  assert.equal(handedBack.closeReason, "reassigned");
});

integrationTest("a substitute for a group lesson reaches the group and its students", async t => {
  const f = await createFixture(t);
  const { fetchTeacherGroupsForAccess, fetchTeacherStudentsForAccess } = await import("./teacher-substitution.service.js");
  const { getTeacherStudentWorkspace } = await import("./teacher-student-workspace.service.js");
  f.state.substituteLessons = [f.lesson(`sub-group-${f.suffix}`, {
    classType: "group", group: { crmGroupId: f.crmGroupId, name: "Группа" }, crmIndividualStudentId: null,
  })];
  f.resetTeacherSubstitutionRefresh();
  const groups = await fetchTeacherGroupsForAccess(f.crmSubstitute, { need: f.crmGroupId });
  assert.deepEqual(groups.groups.map((group) => [group.crmGroupId, Boolean(group.substitution)]), [[f.crmGroupId, true]]);
  const students = await fetchTeacherStudentsForAccess(f.crmSubstitute);
  assert.deepEqual(students.students.map((student) => student.crmStudentId), [f.crmGroupStudentId]);
  assert.equal((await getTeacherStudentWorkspace(f.substitute.id, f.crmGroupStudentId)).access.kind, "substitute");
  await assert.rejects(getTeacherStudentWorkspace(f.substitute.id, f.crmStudentId), (error: { statusCode?: number }) => error.statusCode === 403,
    "the individual student of the regular teacher stays closed");
});

integrationTest("a substitute can write to the student, and approval archives that dialog", async t => {
  const f = await createFixture(t);
  const { productFeatureConfig } = await import("../../config/product-features.js");
  const previous = productFeatureConfig.flags.learningDialogsV2;
  productFeatureConfig.flags.learningDialogsV2 = true;
  t.after(() => { productFeatureConfig.flags.learningDialogsV2 = previous; });
  const { openTeacherStudentDialog } = await import("./learning-dialog-membership.service.js");
  const { closeLessonSubstitutions } = await import("./teacher-substitution.service.js");

  await assert.rejects(openTeacherStudentDialog(f.substitute.id, f.student.id, "student"));
  const crmClassId = `sub-dialog-${f.suffix}`;
  f.state.substituteLessons = [f.lesson(crmClassId)];
  f.resetTeacherSubstitutionRefresh();
  const opened = await openTeacherStudentDialog(f.substitute.id, f.student.id, "student");
  const member = await f.prisma.learningConversationMember.findFirstOrThrow({
    where: { conversationId: opened.conversationId, userId: f.substitute.id },
  });
  assert.equal(member.canWrite, true);

  f.state.substituteLessons = [f.lesson(crmClassId, { status: "completed" })];
  f.resetTeacherSubstitutionRefresh();
  await closeLessonSubstitutions(crmClassId, "approved");
  let conversation = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    conversation = await f.prisma.learningConversation.findUniqueOrThrow({ where: { id: opened.conversationId } });
    if (conversation.status !== "active") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(conversation?.status, "read_only", "the substitute's dialog closes with the lesson");
  const after = await f.prisma.learningConversationMember.findFirstOrThrow({
    where: { conversationId: opened.conversationId, userId: f.substitute.id },
  });
  assert.equal(after.canWrite, false);
});
