import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { productFeatureConfig } from "../src/config/product-features.js";
import {
  applyLearningDialogLegacyMigration,
  previewLearningDialogLegacyMigration,
} from "../src/application/services/learning-dialog-legacy-migration.service.js";
import { applyLearningDialogMembershipProjection } from "../src/application/services/learning-dialog-membership.service.js";
import { prisma } from "../src/infrastructure/database/prisma.js";
import { assertLocalE2eDatabase } from "./qa-database-guard.js";

const API = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4000/api/v1";
const PASSWORD = "QaMaestro2026!";
const NAMESPACE = "e2e:dialogs-api";
const TEACHER_1 = "10000000-0000-4000-8000-000000000011";
const TEACHER_2 = "10000000-0000-4000-8000-000000000012";
const STUDENT_1 = "10000000-0000-4000-8000-000000000021";
const STUDENT_2 = "10000000-0000-4000-8000-000000000022";
const PARENT_1 = "10000000-0000-4000-8000-000000000031";
const PARENT_2 = "10000000-0000-4000-8000-000000000032";
const CURATOR_SOURCE = `curator:student:${STUDENT_1}`;
const TEST_DIRECTION_SLUG = "e2e-dialogs-api-legacy-question";
const TEST_CRM_DIRECTION = "e2e-dialogs-api-direction";

type RequestOptions = { method?: string; token?: string; body?: unknown };

function assertLocalQa() {
  assertLocalE2eDatabase();
  assert.equal(productFeatureConfig.flags.learningDialogsV2, true);
}

async function request(path: string, options: RequestOptions = {}) {
  const response = await fetch(`${API}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function login(loginName: string, profile: "student" | "parent" | "staff") {
  const { response, payload } = await request("/auth/login", {
    method: "POST",
    body: { phone: loginName, password: PASSWORD, profile },
  });
  assert.equal(response.status, 200, `Login failed for ${loginName}`);
  return payload.data.token as string;
}

async function cleanup(questionId?: string | null) {
  if (questionId) await prisma.lessonQuestion.deleteMany({ where: { id: questionId } });
  await prisma.direction.deleteMany({ where: { slug: TEST_DIRECTION_SLUG } });
  const conversations = await prisma.learningConversation.findMany({
    where: {
      OR: [
        { sourceKey: { startsWith: `${NAMESPACE}:` } },
        { sourceKey: CURATOR_SOURCE },
      ],
    },
    select: { id: true, messages: { select: { id: true } } },
  });
  const messageIds = conversations.flatMap((conversation) => conversation.messages.map((message) => message.id));
  if (messageIds.length > 0) {
    await prisma.userNotification.deleteMany({
      where: { OR: messageIds.map((messageId) => ({ dedupeKey: { startsWith: `learning-dialog:${messageId}:` } })) },
    });
  }
  await prisma.learningConversation.deleteMany({
    where: { id: { in: conversations.map((conversation) => conversation.id) } },
  });
}

async function createLegacyQuestionLesson() {
  const direction = await prisma.direction.create({
    data: {
      title: "E2E Dialog Legacy Direction",
      slug: TEST_DIRECTION_SLUG,
      crmDirectionId: TEST_CRM_DIRECTION,
    },
  });
  const course = await prisma.course.create({
    data: {
      directionId: direction.id,
      title: "E2E Dialog Legacy Course",
    },
  });
  const module = await prisma.courseModule.create({
    data: {
      courseId: course.id,
      title: "E2E Dialog Legacy Module",
    },
  });
  return prisma.lesson.create({
    data: {
      moduleId: module.id,
      title: "E2E Dialog Legacy Lesson",
    },
    select: { id: true },
  });
}

async function main() {
  assertLocalQa();
  await cleanup();
  const legacyBefore = {
    conversations: await prisma.teacherConversation.count(),
    messages: await prisma.teacherMessage.count(),
  };
  let questionId: string | null = null;
  try {
    await applyLearningDialogMembershipProjection({
      namespace: NAMESPACE,
      teacherUserId: TEACHER_1,
      syncedAt: new Date(),
      assignments: [{
        studentUserId: STUDENT_1,
        teacherUserId: TEACHER_1,
        crmDirectionId: TEST_CRM_DIRECTION,
        directionTitle: "Гитара",
        parentUserIds: [PARENT_1, PARENT_2],
      }],
      groups: [{
        crmGroupId: "qa-dialog-api-group",
        title: "QA Dialog API group",
        crmDirectionId: TEST_CRM_DIRECTION,
        teacherUserId: TEACHER_1,
        studentUserIds: [STUDENT_1, STUDENT_2],
      }],
    });
    const learning = await prisma.learningConversation.findFirstOrThrow({
      where: { sourceKey: { startsWith: `${NAMESPACE}:learning:` } },
    });
    const group = await prisma.learningConversation.findFirstOrThrow({
      where: { sourceKey: { startsWith: `${NAMESPACE}:group:` } },
    });
    const parentConversation = await prisma.learningConversation.findFirstOrThrow({
      where: { sourceKey: { startsWith: `${NAMESPACE}:parent:` } },
    });

    const [studentToken, secondStudentToken, teacherToken, secondTeacherToken, adminToken, parentToken, secondParentToken] = await Promise.all([
      login("qa_student_1", "student"),
      login("qa_student_2", "student"),
      login("qa_teacher_1", "staff"),
      login("qa_teacher_2", "staff"),
      login("qa_admin", "staff"),
      login("qa_parent_1", "parent"),
      login("qa_parent_2", "parent"),
    ]);

    const studentList = await request("/learning-dialogs", { token: studentToken });
    assert.equal(studentList.response.status, 200);
    assert.equal(
      studentList.payload.data.some((item: { id: string }) => item.id === learning.id),
      true,
    );
    assert.equal(
      studentList.payload.data.some((item: { id: string }) => item.id === group.id),
      true,
    );
    const outsiderList = await request("/learning-dialogs", { token: secondTeacherToken });
    assert.equal(outsiderList.response.status, 200);
    assert.equal(
      outsiderList.payload.data.some((item: { id: string }) => (
        item.id === learning.id || item.id === group.id || item.id === parentConversation.id
      )),
      false,
    );
    const firstParentList = await request("/learning-dialogs", { token: parentToken });
    const secondParentList = await request("/learning-dialogs", { token: secondParentToken });
    assert.equal(firstParentList.response.status, 200);
    const firstParentConversation = firstParentList.payload.data.find(
      (item: { id: string }) => item.id === parentConversation.id,
    );
    const secondParentConversation = secondParentList.payload.data.find(
      (item: { id: string }) => item.id === parentConversation.id,
    );
    assert.ok(firstParentConversation);
    assert.ok(secondParentConversation);
    assert.equal(firstParentConversation.type, "parent_teacher");
    const parentConversationId = parentConversation.id;
    const parentSent = await request(`/learning-dialogs/${parentConversationId}/messages`, {
      method: "POST",
      token: parentToken,
      body: { message: "Общий вопрос родителей", idempotencyKey: randomUUID() },
    });
    assert.equal(parentSent.response.status, 201);
    const sharedParentDetail = await request(`/learning-dialogs/${parentConversationId}`, { token: secondParentToken });
    assert.equal(sharedParentDetail.response.status, 200);
    assert.equal(sharedParentDetail.payload.data.messages[0].body, "Общий вопрос родителей");
    const childParentRead = await request(`/learning-dialogs/${parentConversationId}`, { token: studentToken });
    assert.equal(childParentRead.response.status, 404);
    await request(`/learning-dialogs/${parentConversationId}/read`, { method: "POST", token: teacherToken });

    const unreadBaseline = await request("/learning-dialogs/unread-count", { token: teacherToken });
    assert.equal(unreadBaseline.response.status, 200);
    const teacherUnreadBaseline = unreadBaseline.payload.data.count as number;

    const sendKey = randomUUID();
    const sent = await request(`/learning-dialogs/${learning.id}/messages`, {
      method: "POST",
      token: studentToken,
      body: { message: "Первое V2 сообщение", idempotencyKey: sendKey },
    });
    assert.equal(sent.response.status, 201);
    const messageId = sent.payload.data.id as string;
    const repeatedSend = await request(`/learning-dialogs/${learning.id}/messages`, {
      method: "POST",
      token: studentToken,
      body: { message: "Другой текст с тем же ключом", idempotencyKey: sendKey },
    });
    assert.equal(repeatedSend.response.status, 200);
    assert.equal(repeatedSend.payload.data.id, messageId);
    assert.equal(await prisma.learningMessage.count({
      where: { conversationId: learning.id, sourceKey: { startsWith: "api:learning-message:" } },
    }), 1);
    assert.equal(await prisma.userNotification.count({
      where: { dedupeKey: { startsWith: `learning-dialog:${messageId}:` } },
    }), 1);

    const muted = await request(`/learning-dialogs/${group.id}/preferences`, {
      method: "PATCH",
      token: studentToken,
      body: { notificationsMuted: true },
    });
    assert.equal(muted.response.status, 200);
    assert.equal(muted.payload.data.notificationsMuted, true);
    const groupSent = await request(`/learning-dialogs/${group.id}/messages`, {
      method: "POST",
      token: teacherToken,
      body: { message: "Сообщение без уведомления для выключившего их ученика", idempotencyKey: randomUUID() },
    });
    assert.equal(groupSent.response.status, 201);
    const groupMessageId = groupSent.payload.data.id as string;
    assert.equal(await prisma.userNotification.count({
      where: { dedupeKey: `learning-dialog:${groupMessageId}:${STUDENT_1}` },
    }), 0);
    const archived = await request(`/learning-dialogs/${group.id}/preferences`, {
      method: "PATCH",
      token: studentToken,
      body: { archived: true },
    });
    assert.equal(archived.response.status, 200);
    const activeAfterArchive = await request("/learning-dialogs?archive=active", { token: studentToken });
    assert.equal(activeAfterArchive.payload.data.some((item: { id: string }) => item.id === group.id), false);
    const archiveList = await request("/learning-dialogs?archive=archived", { token: studentToken });
    assert.equal(archiveList.payload.data.some((item: { id: string }) => item.id === group.id), true);
    await request(`/learning-dialogs/${group.id}/preferences`, {
      method: "PATCH",
      token: studentToken,
      body: { archived: false, notificationsMuted: false },
    });

    const unreadBefore = await request("/learning-dialogs/unread-count", { token: teacherToken });
    assert.equal(unreadBefore.response.status, 200);
    assert.equal(unreadBefore.payload.data.count, teacherUnreadBaseline + 1);
    const detail = await request(`/learning-dialogs/${learning.id}`, { token: teacherToken });
    assert.equal(detail.response.status, 200);
    assert.equal(detail.payload.data.messages[0].body, "Первое V2 сообщение");
    await request(`/learning-dialogs/${learning.id}/read`, { method: "POST", token: teacherToken });
    const unreadAfter = await request("/learning-dialogs/unread-count", { token: teacherToken });
    assert.equal(unreadAfter.payload.data.count, teacherUnreadBaseline);

    const foreignEdit = await request(`/learning-dialogs/${learning.id}/messages/${messageId}`, {
      method: "PATCH",
      token: teacherToken,
      body: { message: "Нельзя", idempotencyKey: randomUUID() },
    });
    assert.equal(foreignEdit.response.status, 403);
    const editKey = randomUUID();
    const edited = await request(`/learning-dialogs/${learning.id}/messages/${messageId}`, {
      method: "PATCH",
      token: studentToken,
      body: { message: "Исправленное V2 сообщение", idempotencyKey: editKey },
    });
    assert.equal(edited.response.status, 200);
    assert.equal(edited.payload.data.changed, true);
    const repeatedEdit = await request(`/learning-dialogs/${learning.id}/messages/${messageId}`, {
      method: "PATCH",
      token: studentToken,
      body: { message: "Не должно заменить", idempotencyKey: editKey },
    });
    assert.equal(repeatedEdit.payload.data.changed, false);
    assert.equal(await prisma.learningMessageVersion.count({ where: { messageId } }), 2);

    const curatorAudit = await request(`/learning-dialogs/${learning.id}`, { token: adminToken });
    assert.equal(curatorAudit.response.status, 200);
    assert.equal(curatorAudit.payload.data.messages[0].versions.length, 2);
    const adminGroupWrite = await request(`/learning-dialogs/${group.id}/messages`, {
      method: "POST",
      token: adminToken,
      body: { message: "Не модераторское сообщение", idempotencyKey: randomUUID() },
    });
    assert.equal(adminGroupWrite.response.status, 403);

    const retractKey = randomUUID();
    const retracted = await request(`/learning-dialogs/${learning.id}/messages/${messageId}/retract`, {
      method: "POST",
      token: studentToken,
      body: { idempotencyKey: retractKey },
    });
    assert.equal(retracted.response.status, 200);
    assert.equal(retracted.payload.data.message.state, "retracted");
    assert.equal(retracted.payload.data.message.body, null);
    const repeatedRetract = await request(`/learning-dialogs/${learning.id}/messages/${messageId}/retract`, {
      method: "POST",
      token: studentToken,
      body: { idempotencyKey: retractKey },
    });
    assert.equal(repeatedRetract.payload.data.changed, false);
    assert.equal(await prisma.learningMessageVersion.count({ where: { messageId } }), 3);

    const curatorKey = randomUUID();
    const curatorStarted = await request("/learning-dialogs/curator", {
      method: "POST",
      token: studentToken,
      body: { message: "Вопрос куратору", idempotencyKey: curatorKey },
    });
    assert.equal(curatorStarted.response.status, 201);
    const curatorConversationId = curatorStarted.payload.data.conversationId as string;
    const curatorRepeated = await request("/learning-dialogs/curator", {
      method: "POST",
      token: studentToken,
      body: { message: "Повтор", idempotencyKey: curatorKey },
    });
    assert.equal(curatorRepeated.response.status, 200);
    assert.equal(curatorRepeated.payload.data.conversationId, curatorConversationId);
    const adminReply = await request(`/learning-dialogs/${curatorConversationId}/messages`, {
      method: "POST",
      token: adminToken,
      body: { message: "Ответ общей админки", idempotencyKey: randomUUID() },
    });
    assert.equal(adminReply.response.status, 201);
    const teacherCuratorRead = await request(`/learning-dialogs/${curatorConversationId}`, { token: teacherToken });
    assert.equal(teacherCuratorRead.response.status, 404);
    const secondStudentLearningRead = await request(`/learning-dialogs/${learning.id}`, { token: secondStudentToken });
    assert.equal(secondStudentLearningRead.response.status, 404);

    const lesson = await createLegacyQuestionLesson();
    const lessonQuestion = await request("/learning-dialogs/lesson-question", {
      method: "POST",
      token: studentToken,
      body: {
        lessonId: lesson.id,
        message: "E2E V2 вопрос по уроку",
        idempotencyKey: randomUUID(),
      },
    });
    assert.equal(lessonQuestion.response.status, 201);
    assert.equal(lessonQuestion.payload.data.message.contextType, "lesson");
    assert.equal(lessonQuestion.payload.data.message.contextId, lesson.id);
    assert.equal(lessonQuestion.payload.data.message.conversationId, learning.id);
    const question = await prisma.lessonQuestion.create({
      data: {
        lessonId: lesson.id,
        studentId: STUDENT_1,
        message: "E2E legacy lesson question",
      },
    });
    questionId = question.id;
    const preview = await previewLearningDialogLegacyMigration();
    assert.equal(preview.blockers.length, 0);
    assert.equal(preview.pending.directMessages, legacyBefore.messages);
    assert.equal(preview.pending.lessonQuestions >= 1, true);
    const migrated = await applyLearningDialogLegacyMigration();
    assert.equal(migrated.created.directMessages, legacyBefore.messages);
    assert.equal(migrated.created.lessonQuestions >= 1, true);
    const secondMigration = await applyLearningDialogLegacyMigration();
    assert.equal(secondMigration.created.directMessages, 0);
    assert.equal(secondMigration.created.lessonQuestions, 0);
    assert.equal(await prisma.learningMessage.count({
      where: { sourceKey: { startsWith: "legacy:teacher-message:" } },
    }), legacyBefore.messages);
    assert.equal(await prisma.learningMessage.count({
      where: { sourceKey: lessonQuestionSource(question.id) },
    }), 1);
  } finally {
    await cleanup(questionId);
  }

  assert.deepEqual({
    conversations: await prisma.teacherConversation.count(),
    messages: await prisma.teacherMessage.count(),
  }, legacyBefore);
  assert.equal(await prisma.learningConversation.count({
    where: {
      OR: [
        { sourceKey: { startsWith: `${NAMESPACE}:` } },
        { sourceKey: CURATOR_SOURCE },
      ],
    },
  }), 0);
  console.log("Learning dialog V2 API and legacy migration E2E passed");
}

function lessonQuestionSource(id: string) {
  return `legacy:lesson-question:${id}`;
}

main().finally(() => prisma.$disconnect());
