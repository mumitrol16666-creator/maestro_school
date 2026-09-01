import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { productFeatureConfig } from "../src/config/product-features.js";
import { applyLearningDialogMembershipProjection } from "../src/application/services/learning-dialog-membership.service.js";
import { deleteLearningDialogFile } from "../src/application/services/learning-dialog-private-storage.service.js";
import { prisma } from "../src/infrastructure/database/prisma.js";

const API = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4000/api/v1";
const PASSWORD = "QaMaestro2026!";
const NAMESPACE = "e2e:dialogs-moderation";
const TEACHER_1 = "10000000-0000-4000-8000-000000000011";
const TEACHER_2 = "10000000-0000-4000-8000-000000000012";
const STUDENT_1 = "10000000-0000-4000-8000-000000000021";
const STUDENT_2 = "10000000-0000-4000-8000-000000000022";
const PARENT_1 = "10000000-0000-4000-8000-000000000031";
const PARENT_2 = "10000000-0000-4000-8000-000000000032";

type RequestOptions = { method?: string; token?: string; body?: unknown };

function assertLocalQa() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(process.env.MAESTRO_QA_LOCAL, "true");
  assert.ok(["postgres", "127.0.0.1", "localhost"].includes(url.hostname));
  assert.equal(productFeatureConfig.flags.learningDialogsV2, true);
  assert.equal(productFeatureConfig.flags.curatorWorkspaceV2, true);
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

async function multipartMessage(params: {
  conversationId: string;
  token: string;
  idempotencyKey: string;
  message?: string;
  files: Array<{ name: string; mimeType: string; bytes: Uint8Array }>;
}) {
  const form = new FormData();
  if (params.message !== undefined) form.append("message", params.message);
  for (const file of params.files) {
    form.append("files", new Blob([file.bytes], { type: file.mimeType }), file.name);
  }
  const response = await fetch(`${API}/learning-dialogs/${params.conversationId}/messages`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${params.token}`,
      "Idempotency-Key": params.idempotencyKey,
    },
    body: form,
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

async function cleanup() {
  const conversations = await prisma.learningConversation.findMany({
    where: { sourceKey: { startsWith: `${NAMESPACE}:` } },
    select: {
      id: true,
      attachments: { select: { id: true, storageKey: true } },
      messages: {
        select: {
          id: true,
          reports: { select: { id: true } },
          moderationActions: { select: { id: true } },
        },
      },
      moderationActions: { select: { id: true } },
    },
  });
  const attachments = conversations.flatMap((conversation) => conversation.attachments);
  const messageIds = conversations.flatMap((conversation) => conversation.messages.map((message) => message.id));
  const reportIds = conversations.flatMap((conversation) => (
    conversation.messages.flatMap((message) => message.reports.map((report) => report.id))
  ));
  const actionIds = new Set(conversations.flatMap((conversation) => [
    ...conversation.moderationActions.map((action) => action.id),
    ...conversation.messages.flatMap((message) => message.moderationActions.map((action) => action.id)),
  ]));
  const linkedIds = [...reportIds, ...actionIds];
  if (attachments.length) {
    await prisma.auditLog.deleteMany({
      where: {
        entityType: "learning_message_attachment",
        entityId: { in: attachments.map((attachment) => attachment.id) },
      },
    });
  }
  if (linkedIds.length) {
    await prisma.adminJournalEntry.deleteMany({ where: { linkedEntityId: { in: linkedIds } } });
  }
  if (messageIds.length) {
    await prisma.userNotification.deleteMany({
      where: { OR: messageIds.map((messageId) => ({ dedupeKey: { startsWith: `learning-dialog:${messageId}:` } })) },
    });
  }
  await prisma.learningConversation.deleteMany({
    where: { sourceKey: { startsWith: `${NAMESPACE}:` } },
  });
  await Promise.all(attachments.map((attachment) => deleteLearningDialogFile(attachment.storageKey)));
}

async function main() {
  assertLocalQa();
  await cleanup();
  try {
    await applyLearningDialogMembershipProjection({
      namespace: NAMESPACE,
      teacherUserId: TEACHER_1,
      syncedAt: new Date(),
      assignments: [{
        studentUserId: STUDENT_1,
        teacherUserId: TEACHER_1,
        crmDirectionId: "qa-direction-guitar",
        directionTitle: "Гитара",
        parentUserIds: [PARENT_1, PARENT_2],
      }],
      groups: [{
        crmGroupId: "qa-dialog-moderation-group",
        title: "QA Dialog Moderation Group",
        crmDirectionId: "qa-direction-guitar",
        teacherUserId: TEACHER_1,
        studentUserIds: [STUDENT_1, STUDENT_2],
      }],
    });
    const learning = await prisma.learningConversation.findFirstOrThrow({
      where: { sourceKey: { startsWith: `${NAMESPACE}:learning:` } },
    });
    const parent = await prisma.learningConversation.findFirstOrThrow({
      where: { sourceKey: { startsWith: `${NAMESPACE}:parent:` } },
    });
    const group = await prisma.learningConversation.findFirstOrThrow({
      where: { sourceKey: { startsWith: `${NAMESPACE}:group:` } },
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

    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const pdf = new TextEncoder().encode("%PDF-1.4\nE2E private attachment\n%%EOF");
    const attachmentKey = randomUUID();
    const uploaded = await multipartMessage({
      conversationId: parent.id,
      token: parentToken,
      idempotencyKey: attachmentKey,
      message: "Материалы для преподавателя",
      files: [
        { name: "photo.png", mimeType: "image/png", bytes: png },
        { name: "notes.pdf", mimeType: "application/pdf", bytes: pdf },
      ],
    });
    assert.equal(uploaded.response.status, 201);
    assert.equal(uploaded.payload.data.attachments.length, 2);
    const repeatedUpload = await multipartMessage({
      conversationId: parent.id,
      token: parentToken,
      idempotencyKey: attachmentKey,
      files: [{ name: "other.png", mimeType: "image/png", bytes: png }],
    });
    assert.equal(repeatedUpload.response.status, 200);
    assert.equal(repeatedUpload.payload.data.id, uploaded.payload.data.id);
    assert.equal(await prisma.learningMessageAttachment.count({ where: { conversationId: parent.id } }), 2);

    const parentDetail = await request(`/learning-dialogs/${parent.id}`, { token: secondParentToken });
    assert.equal(parentDetail.response.status, 200);
    assert.equal(parentDetail.payload.data.messages[0].attachments.length, 2);
    const attachmentId = parentDetail.payload.data.messages[0].attachments[0].id as string;
    const parentDownload = await fetch(`${API}/learning-dialog-attachments/${attachmentId}/download`, {
      headers: { Authorization: `Bearer ${secondParentToken}` },
    });
    assert.equal(parentDownload.status, 200);
    assert.deepEqual(new Uint8Array(await parentDownload.arrayBuffer()), png);
    const childDownload = await fetch(`${API}/learning-dialog-attachments/${attachmentId}/download`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.equal(childDownload.status, 404);
    const outsiderDownload = await fetch(`${API}/learning-dialog-attachments/${attachmentId}/download`, {
      headers: { Authorization: `Bearer ${secondTeacherToken}` },
    });
    assert.equal(outsiderDownload.status, 404);
    assert.equal(await prisma.auditLog.count({
      where: { entityType: "learning_message_attachment", entityId: attachmentId, actorId: PARENT_2 },
    }), 1);

    const disguised = await multipartMessage({
      conversationId: parent.id,
      token: parentToken,
      idempotencyKey: randomUUID(),
      files: [{ name: "fake.png", mimeType: "image/png", bytes: new TextEncoder().encode("not an image") }],
    });
    assert.equal(disguised.response.status, 400);
    const video = await multipartMessage({
      conversationId: parent.id,
      token: parentToken,
      idempotencyKey: randomUUID(),
      files: [{ name: "video.mp4", mimeType: "video/mp4", bytes: new TextEncoder().encode("video") }],
    });
    assert.equal(video.response.status, 400);
    assert.equal(await prisma.learningMessageAttachment.count({ where: { conversationId: parent.id } }), 2);

    const sent = await request(`/learning-dialogs/${learning.id}/messages`, {
      method: "POST",
      token: studentToken,
      body: { message: "Сообщение для жалобы", idempotencyKey: randomUUID() },
    });
    assert.equal(sent.response.status, 201);
    const messageId = sent.payload.data.id as string;
    const reportKey = randomUUID();
    const reported = await request(`/learning-dialogs/${learning.id}/messages/${messageId}/reports`, {
      method: "POST",
      token: teacherToken,
      body: {
        versionId: sent.payload.data.currentVersionId,
        reason: "Нужно проверить содержание сообщения",
        idempotencyKey: reportKey,
      },
    });
    assert.equal(reported.response.status, 201);
    const reportId = reported.payload.data.id as string;
    const repeatedReport = await request(`/learning-dialogs/${learning.id}/messages/${messageId}/reports`, {
      method: "POST",
      token: teacherToken,
      body: {
        versionId: sent.payload.data.currentVersionId,
        reason: "Повтор с тем же ключом",
        idempotencyKey: reportKey,
      },
    });
    assert.equal(repeatedReport.response.status, 200);
    assert.equal(repeatedReport.payload.data.id, reportId);
    assert.equal(await prisma.learningMessageReport.count({ where: { id: reportId } }), 1);
    const complaintJournal = await prisma.adminJournalEntry.findUniqueOrThrow({
      where: { sourceKey: `learning-dialog-report:${reportId}` },
    });
    assert.equal(complaintJournal.status, "new");

    const teacherHide = await request(`/learning-dialogs/${learning.id}/messages/${messageId}/hide`, {
      method: "POST",
      token: teacherToken,
      body: { reason: "Нет прав", idempotencyKey: randomUUID() },
    });
    assert.equal(teacherHide.response.status, 403);
    const hidden = await request(`/learning-dialogs/${learning.id}/messages/${messageId}/hide`, {
      method: "POST",
      token: adminToken,
      body: { reason: "Скрыто после проверки администратором", idempotencyKey: randomUUID() },
    });
    assert.equal(hidden.response.status, 200);
    assert.equal(hidden.payload.data.message.state, "hidden");
    const participantAfterHide = await request(`/learning-dialogs/${learning.id}`, { token: teacherToken });
    assert.equal(participantAfterHide.payload.data.messages.at(-1).body, null);

    const resolved = await request(`/learning-dialogs/${learning.id}/reports/${reportId}/resolve`, {
      method: "POST",
      token: adminToken,
      body: {
        status: "resolved",
        resolution: "Сообщение проверено и скрыто",
        idempotencyKey: randomUUID(),
      },
    });
    assert.equal(resolved.response.status, 200);
    assert.equal(resolved.payload.data.report.status, "resolved");
    assert.equal((await prisma.adminJournalEntry.findUniqueOrThrow({
      where: { sourceKey: `learning-dialog-report:${reportId}` },
    })).status, "resolved");

    const restrictionKey = randomUUID();
    const restricted = await request(`/learning-dialogs/${group.id}/members/${STUDENT_2}/restrict`, {
      method: "POST",
      token: adminToken,
      body: {
        restrictedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        reason: "Временная модерация группового чата",
        idempotencyKey: restrictionKey,
      },
    });
    assert.equal(restricted.response.status, 200);
    assert.equal(restricted.payload.data.changed, true);
    const repeatedRestriction = await request(`/learning-dialogs/${group.id}/members/${STUDENT_2}/restrict`, {
      method: "POST",
      token: adminToken,
      body: {
        restrictedUntil: new Date(0).toISOString(),
        reason: "Повтор",
        idempotencyKey: restrictionKey,
      },
    });
    assert.equal(repeatedRestriction.payload.data.changed, false);
    const blockedSend = await request(`/learning-dialogs/${group.id}/messages`, {
      method: "POST",
      token: secondStudentToken,
      body: { message: "Не должно отправиться", idempotencyKey: randomUUID() },
    });
    assert.equal(blockedSend.response.status, 403);
    const wrongScopeRestriction = await request(`/learning-dialogs/${learning.id}/members/${STUDENT_1}/restrict`, {
      method: "POST",
      token: adminToken,
      body: {
        restrictedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        reason: "Неверный scope",
        idempotencyKey: randomUUID(),
      },
    });
    assert.equal(wrongScopeRestriction.response.status, 400);
    const unrestricted = await request(`/learning-dialogs/${group.id}/members/${STUDENT_2}/unrestrict`, {
      method: "POST",
      token: adminToken,
      body: { reason: "Проверка завершена", idempotencyKey: randomUUID() },
    });
    assert.equal(unrestricted.response.status, 200);
    const allowedSend = await request(`/learning-dialogs/${group.id}/messages`, {
      method: "POST",
      token: secondStudentToken,
      body: { message: "Отправка снова работает", idempotencyKey: randomUUID() },
    });
    assert.equal(allowedSend.response.status, 201);

    const adminDetail = await request(`/learning-dialogs/${learning.id}`, { token: adminToken });
    assert.equal(adminDetail.response.status, 200);
    assert.equal(adminDetail.payload.data.messages.at(-1).reports[0].status, "resolved");
    assert.equal(adminDetail.payload.data.moderationActions.some((action: { action: string }) => action.action === "message_hidden"), true);
    assert.equal(await prisma.adminJournalEntry.count({
      where: { linkedEntityType: "learning_conversation_moderation_action" },
    }) >= 3, true);
  } finally {
    await cleanup();
  }

  assert.equal(await prisma.learningConversation.count({
    where: { sourceKey: { startsWith: `${NAMESPACE}:` } },
  }), 0);
  console.log("Learning dialog V2 files and moderation E2E passed");
}

main().finally(() => prisma.$disconnect());
