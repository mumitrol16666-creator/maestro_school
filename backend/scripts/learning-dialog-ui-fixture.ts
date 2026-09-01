import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { productFeatureConfig } from "../src/config/product-features.js";
import { prisma } from "../src/infrastructure/database/prisma.js";
import { applyLearningDialogMembershipProjection } from "../src/application/services/learning-dialog-membership.service.js";
import {
  ensureStudentCuratorConversation,
  reportLearningMessage,
  sendLearningMessage,
} from "../src/application/services/learning-dialog.service.js";

const NAMESPACE = "qa:dialogs-ui";
const TEACHER = "10000000-0000-4000-8000-000000000011";
const STUDENT = "10000000-0000-4000-8000-000000000021";
const SECOND_STUDENT = "10000000-0000-4000-8000-000000000022";
const PARENT_1 = "10000000-0000-4000-8000-000000000031";
const PARENT_2 = "10000000-0000-4000-8000-000000000032";
const ADMIN = "10000000-0000-4000-8000-000000000001";
const CURATOR_SOURCE = `curator:student:${STUDENT}`;

function assertLocalQa() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(process.env.MAESTRO_QA_LOCAL, "true");
  assert.ok(["postgres", "127.0.0.1", "localhost"].includes(url.hostname));
  assert.ok(!/prod|production|neon|supabase|render/i.test(process.env.DATABASE_URL ?? ""));
  assert.equal(productFeatureConfig.flags.learningDialogsV2, true);
}

async function cleanup() {
  const conversations = await prisma.learningConversation.findMany({
    where: { OR: [{ sourceKey: { startsWith: `${NAMESPACE}:` } }, { sourceKey: CURATOR_SOURCE }] },
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

async function send(actor: { userId: string; roleSlug: string }, conversationId: string, body: string) {
  return sendLearningMessage(actor, conversationId, { body, idempotencyKey: randomUUID() });
}

async function main() {
  assertLocalQa();
  await cleanup();
  if (process.argv.includes("--cleanup")) {
    console.log("Learning dialog UI fixture cleaned");
    return;
  }

  await applyLearningDialogMembershipProjection({
    namespace: NAMESPACE,
    teacherUserId: TEACHER,
    syncedAt: new Date(),
    assignments: [{
      studentUserId: STUDENT,
      teacherUserId: TEACHER,
      crmDirectionId: "QA-DIRECTION-GUITAR",
      directionTitle: "Гитара",
      parentUserIds: [PARENT_1, PARENT_2],
    }],
    groups: [{
      crmGroupId: "QA-GROUP-1",
      title: "Ансамбль Ultimatum",
      crmDirectionId: "QA-DIRECTION-GUITAR",
      teacherUserId: TEACHER,
      studentUserIds: [STUDENT, SECOND_STUDENT],
    }],
  });

  const learning = await prisma.learningConversation.findFirstOrThrow({
    where: { sourceKey: { startsWith: `${NAMESPACE}:learning:` } },
  });
  const parents = await prisma.learningConversation.findFirstOrThrow({
    where: { sourceKey: { startsWith: `${NAMESPACE}:parent:` } },
  });
  const group = await prisma.learningConversation.findFirstOrThrow({
    where: { sourceKey: { startsWith: `${NAMESPACE}:group:` } },
  });
  const curator = await ensureStudentCuratorConversation(STUDENT);

  await send({ userId: STUDENT, roleSlug: "student" }, learning.id, "Не получается чисто сыграть переход в припеве. Можно разобрать его на следующем уроке?");
  const teacherMessage = await send({ userId: TEACHER, roleSlug: "teacher" }, learning.id, "Да. До урока сыграй переход медленно под 70 BPM и пришли короткую запись.");
  await send({ userId: PARENT_1, roleSlug: "parent" }, parents.id, "Подскажите, пожалуйста, что Камбару повторить перед следующим занятием?");
  await send({ userId: TEACHER, roleSlug: "teacher" }, parents.id, "Основной акцент сейчас на ровном ритме и переходе между Am и F.");
  await send({ userId: TEACHER, roleSlug: "teacher" }, group.id, "На субботу готовим общий прогон. Начинаем с куплета, темп 90 BPM.");
  await send({ userId: SECOND_STUDENT, roleSlug: "student" }, group.id, "Я подготовлю свою партию к пятнице.");
  await send({ userId: STUDENT, roleSlug: "student" }, curator.id, "Можно уточнить баланс занятий на следующий месяц?");
  await send({ userId: ADMIN, roleSlug: "admin" }, curator.id, "Да, проверим данные CRM и ответим здесь сегодня.");

  if (teacherMessage.message.currentVersionId) {
    await reportLearningMessage(
      { userId: STUDENT, roleSlug: "student" },
      learning.id,
      teacherMessage.message.id,
      {
        versionId: teacherMessage.message.currentVersionId,
        reason: "QA-жалоба для проверки модерации: сообщение отмечено намеренно.",
        idempotencyKey: randomUUID(),
      },
    );
  }

  console.log("Learning dialog UI fixture ready");
}

main().finally(() => prisma.$disconnect());
