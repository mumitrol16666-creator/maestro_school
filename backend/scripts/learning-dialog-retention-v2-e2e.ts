import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { productFeatureConfig } from "../src/config/product-features.js";
import { runLearningDialogRetention } from "../src/application/services/learning-dialog-retention.service.js";
import {
  deleteLearningDialogFile,
  getLearningDialogFile,
  storeLearningDialogFile,
} from "../src/application/services/learning-dialog-private-storage.service.js";
import { prisma } from "../src/infrastructure/database/prisma.js";

const SOURCE_KEY = "e2e:dialogs-retention:conversation";
const STUDENT = "10000000-0000-4000-8000-000000000021";

function assertLocalQa() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(process.env.MAESTRO_QA_LOCAL, "true");
  assert.ok(["postgres", "127.0.0.1", "localhost"].includes(url.hostname));
  assert.ok(!/prod|production|neon|supabase|render/i.test(process.env.DATABASE_URL ?? ""));
  assert.equal(productFeatureConfig.flags.learningDialogsV2, true);
}

async function cleanup(storageKey?: string) {
  await prisma.learningConversation.deleteMany({ where: { sourceKey: SOURCE_KEY } });
  if (storageKey) await deleteLearningDialogFile(storageKey);
}

async function main() {
  assertLocalQa();
  await cleanup();
  let storageKey: string | undefined;
  try {
    const expiredAt = new Date(Date.now() - 60_000);
    const conversation = await prisma.learningConversation.create({
      data: {
        sourceKey: SOURCE_KEY,
        type: "learning_direction",
        title: "QA retention",
        textRetentionUntil: expiredAt,
        attachmentRetentionUntil: expiredAt,
      },
    });
    const message = await prisma.learningMessage.create({
      data: {
        sourceKey: "e2e:dialogs-retention:message",
        conversationId: conversation.id,
        authorId: STUDENT,
        versions: {
          create: {
            sourceKey: "e2e:dialogs-retention:version",
            version: 1,
            kind: "created",
            body: "Этот текст должен быть очищен",
            createdById: STUDENT,
          },
        },
      },
    });
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const stored = await storeLearningDialogFile({
      conversationId: conversation.id,
      filename: "retention.png",
      mimeType: "image/png",
      stream: Readable.from(png),
    });
    storageKey = stored.storageKey;
    const attachment = await prisma.learningMessageAttachment.create({
      data: {
        sourceKey: "e2e:dialogs-retention:attachment",
        conversationId: conversation.id,
        messageId: message.id,
        uploaderId: STUDENT,
        storageKey: stored.storageKey,
        originalFilename: stored.originalFilename,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        sha256: stored.sha256,
        quarantineStatus: "clean",
      },
    });

    const result = await runLearningDialogRetention(new Date());
    assert.equal(result.deletedAttachments >= 1, true);
    assert.equal(result.purgedTextVersions >= 1, true);
    assert.equal((await prisma.learningMessageVersion.findFirstOrThrow({ where: { messageId: message.id } })).body, null);
    assert.notEqual((await prisma.learningMessageAttachment.findUniqueOrThrow({ where: { id: attachment.id } })).deletedAt, null);
    await assert.rejects(() => getLearningDialogFile(stored.storageKey));
  } finally {
    await cleanup(storageKey);
  }
  console.log("Learning dialog V2 retention E2E passed");
}

main().finally(() => prisma.$disconnect());
