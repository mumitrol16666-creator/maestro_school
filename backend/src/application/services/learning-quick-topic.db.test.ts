import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.INTEGRATION_SERVICE_SECRET ??= "quick-topic-test-secret-1234";
process.env.CRM_API_URL ??= "http://127.0.0.1:9";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

/**
 * Plan 1.6: a topic added during the lesson goes only into the published sector of the chosen
 * direction. A draft the teacher has not published yet keeps its edits and gets the topic too.
 */
async function createFixture(t: Parameters<Parameters<typeof test>[1]>[0]) {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { productFeatureConfig } = await import("../../config/product-features.js");
  const flags = productFeatureConfig.flags;
  const previous = { ...flags };
  Object.assign(flags, { learningTopicsV2: true, homeworkFlowV2: true, unifiedLessonV2: true, lessonSyncV2: false });

  const suffix = randomUUID().slice(0, 8);
  const digits = suffix.replace(/\D/g, "").padEnd(7, "5").slice(0, 7);
  const crmStudentId = `crm-quick-${suffix}`;
  const crmDirectionId = `crm-dir-quick-${suffix}`;
  const crmTeacherId = `crm-teacher-quick-${suffix}`;
  const crmClassId = `quick-class-${suffix}`;
  const studentRole = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  const teacherRole = await prisma.role.upsert({ where: { slug: "teacher" }, create: { slug: "teacher", name: "teacher" }, update: {} });
  const direction = await prisma.direction.create({
    data: { title: `Гитара ${suffix}`, slug: `quick-${suffix}`, isPublished: true, crmDirectionId, crmIsActive: true },
  });
  const otherDirection = await prisma.direction.create({
    data: { title: `Вокал ${suffix}`, slug: `quick-other-${suffix}`, isPublished: true, crmDirectionId: `${crmDirectionId}-other`, crmIsActive: true },
  });
  const student = await prisma.user.create({
    data: {
      login: `quick_s_${suffix}`, phone: `+7731${digits}`, passwordHash: "x",
      firstName: "Ученик", lastName: suffix, roleId: studentRole.id, crmStudentId, externalLinkStatus: "linked",
    },
  });
  const teacher = await prisma.user.create({
    data: {
      login: `quick_t_${suffix}`, phone: `+7732${digits}`, passwordHash: "x",
      firstName: "Учитель", lastName: suffix, roleId: teacherRole.id, crmTeacherId, externalLinkStatus: "linked",
    },
  });
  t.after(async () => {
    Object.assign(flags, previous);
    await prisma.learningPlan.deleteMany({ where: { directionId: { in: [direction.id, otherDirection.id] } } });
    await prisma.learningTopic.deleteMany({ where: { directionId: { in: [direction.id, otherDirection.id] } } });
    await prisma.userNotification.deleteMany({ where: { userId: { in: [student.id, teacher.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [student.id, teacher.id] } } });
    await prisma.direction.deleteMany({ where: { id: { in: [direction.id, otherDirection.id] } } });
  });

  const rosterStudent = {
    crmStudentId, name: "Ученик", firstName: "Ученик", lastName: suffix, phone: "+7", accountBalance: 0,
    directions: [direction.title], assignedDirectly: true, groups: [], schedules: [], attendanceHistory: [], memberships: [],
  };
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    let body: unknown = {};
    if (url.includes("/directions")) {
      body = { directions: [{ crmDirectionId, title: direction.title, isActive: true, updatedAt: "2026-01-01T00:00:00.000Z" }] };
    } else if (url.includes(`/teachers/${crmTeacherId}/students`)) {
      body = { teacher: { crmTeacherId, name: "Учитель", directions: [direction.title] }, students: [rosterStudent] };
    } else if (url.includes(`/classes/${crmClassId}/students`)) {
      body = { crmClassId, students: [{ crmStudentId, name: "Ученик", attendance: null }] };
    } else if (url.includes(`/classes/${crmClassId}`)) {
      body = {
        crmClassId, title: "Гитара", date: new Date().toISOString(), startTime: "10:00", endTime: "11:00",
        status: "started", classType: "individual", group: null, crmIndividualStudentId: crmStudentId,
        teacher: { crmTeacherId, name: "Учитель" },
      };
    }
    return new Response(JSON.stringify({ success: true, data: body }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  return { prisma, suffix, crmStudentId, crmDirectionId, crmClassId, direction, otherDirection, teacher };
}

integrationTest("a quick topic needs a published sector of the chosen direction", async t => {
  const f = await createFixture(t);
  const { quickAddOfflineLessonTopic } = await import("./learning-lesson-v2.service.js");
  const { saveStudentLearningPlanV2 } = await import("./learning-plan-v2.service.js");

  await assert.rejects(
    quickAddOfflineLessonTopic(f.teacher.id, f.crmClassId, { title: "Бой", directionId: f.direction.id }),
    (error: { code?: string }) => error.code === "QUICK_TOPIC_SECTOR_NOT_PUBLISHED",
  );
  assert.equal(await f.prisma.learningPlan.count({ where: { crmStudentId: f.crmStudentId } }), 0, "no sector is opened on the fly");

  // A draft that was never published is not a place for lesson topics either.
  await saveStudentLearningPlanV2(f.teacher.id, f.crmStudentId, f.crmDirectionId, {
    goal: "Аккорды", expectedResult: "", skills: "", checkpoint: "", note: "",
    items: [{ id: "topic-a", title: "Am и E", status: "planned" }], expectedVersion: 0,
  });
  await assert.rejects(
    quickAddOfflineLessonTopic(f.teacher.id, f.crmClassId, { title: "Бой", directionId: f.direction.id }),
    (error: { code?: string }) => error.code === "QUICK_TOPIC_SECTOR_NOT_PUBLISHED",
  );
  await assert.rejects(
    quickAddOfflineLessonTopic(f.teacher.id, f.crmClassId, { title: "Бой", directionId: "" }),
    (error: { code?: string }) => error.code === "DIRECTION_REQUIRED",
  );
  await assert.rejects(
    quickAddOfflineLessonTopic(f.teacher.id, f.crmClassId, { title: "Бой", directionId: f.otherDirection.id }),
    (error: { code?: string }) => error.code === "QUICK_TOPIC_SECTOR_NOT_PUBLISHED",
  );
});

integrationTest("a quick topic goes into the published version and the draft keeps its edits", async t => {
  const f = await createFixture(t);
  const { quickAddOfflineLessonTopic } = await import("./learning-lesson-v2.service.js");
  const { saveStudentLearningPlanV2, publishStudentLearningPlanV2 } = await import("./learning-plan-v2.service.js");

  const first = await saveStudentLearningPlanV2(f.teacher.id, f.crmStudentId, f.crmDirectionId, {
    goal: "Аккорды", expectedResult: "", skills: "", checkpoint: "", note: "",
    items: [{ id: "topic-a", title: "Am и E", status: "planned" }], expectedVersion: 0,
  });
  const published = await publishStudentLearningPlanV2(f.teacher.id, f.crmStudentId, f.crmDirectionId, first.version);
  const topicA = published.items[0]!.id;
  // The teacher starts editing the sector and does not publish yet.
  await saveStudentLearningPlanV2(f.teacher.id, f.crmStudentId, f.crmDirectionId, {
    goal: "Аккорды и бой (черновик)", expectedResult: "", skills: "", checkpoint: "", note: "",
    items: [
      { id: topicA, title: "Am и E", status: "planned" },
      { id: "topic-b", title: "Dm", status: "planned" },
    ],
    expectedVersion: published.version,
  });

  const added = await quickAddOfflineLessonTopic(f.teacher.id, f.crmClassId, {
    title: "Бой шестёркой", masteryCriteria: "Ровно в 80 bpm", directionId: f.direction.id,
  });
  assert.equal(added.topic.title, "Бой шестёркой");
  const lessonTopics = added.learningV2?.plans.flatMap((plan) => plan.topics.map((topic) => topic.title));
  assert.deepEqual(lessonTopics, ["Am и E", "Бой шестёркой"], "the lesson sees the published sector, not the draft");

  const plan = await f.prisma.learningPlan.findFirstOrThrow({
    where: { id: first.id },
    include: { versions: { include: { topics: { orderBy: { sortOrder: "asc" } } } } },
  });
  assert.ok(plan.currentVersionNumber > plan.publishedVersionNumber!, "the draft stays unpublished");
  const publishedNow = plan.versions.find((version) => version.version === plan.publishedVersionNumber)!;
  const draftNow = plan.versions.find((version) => version.version === plan.currentVersionNumber)!;
  assert.equal(publishedNow.goal, "Аккорды");
  assert.ok(publishedNow.publishedAt);
  assert.deepEqual(publishedNow.topics.map((link) => link.titleSnapshot), ["Am и E", "Бой шестёркой"]);
  assert.equal(draftNow.goal, "Аккорды и бой (черновик)");
  assert.equal(draftNow.publishedAt, null);
  assert.deepEqual(draftNow.topics.map((link) => link.titleSnapshot), ["Am и E", "Dm", "Бой шестёркой"]);
  assert.equal(draftNow.topics[2]!.topicId, added.topic.id, "publishing the draft later keeps the lesson topic");

  // The same title again returns the topic already in the sector.
  const versionsBefore = plan.versions.length;
  const again = await quickAddOfflineLessonTopic(f.teacher.id, f.crmClassId, { title: " бой шестёркой ", directionId: f.direction.id });
  assert.equal(again.topic.id, added.topic.id);
  assert.equal(await f.prisma.learningPlanVersion.count({ where: { planId: first.id } }), versionsBefore);
});
