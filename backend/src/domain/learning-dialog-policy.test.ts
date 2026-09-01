import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCanChangeLearningMessage,
  assertCanSendLearningMessage,
  assertLearningDialogFileSignature,
  detectLearningDialogMimeType,
  getLearningConversationRetention,
  isLearningDialogCuratorRole,
  validateLearningDialogAttachments,
} from "./learning-dialog-policy.js";

test("the existing admin scope moderates dialogs without a personal curator role", () => {
  assert.equal(isLearningDialogCuratorRole("admin"), true);
  assert.equal(isLearningDialogCuratorRole("owner"), true);
  assert.equal(isLearningDialogCuratorRole("super_admin"), true);
  assert.equal(isLearningDialogCuratorRole("curator"), true);
  assert.equal(isLearningDialogCuratorRole("teacher"), false);
  assert.equal(isLearningDialogCuratorRole("branch_manager"), false);
});

test("active members can write unless the membership is restricted", () => {
  const now = new Date("2026-08-29T08:00:00.000Z");
  assert.doesNotThrow(() => assertCanSendLearningMessage({
    status: "active",
    isMember: true,
    canWrite: true,
  }, now));
  assert.throws(() => assertCanSendLearningMessage({
    status: "active",
    isMember: true,
    canWrite: true,
    restrictedUntil: new Date("2026-08-29T09:00:00.000Z"),
  }, now), /временно ограничена/);
  assert.throws(() => assertCanSendLearningMessage({
    status: "read_only",
    isMember: true,
    canWrite: true,
  }, now), /только для чтения/);
});

test("only the author can edit or retract during the confirmed 15 minute window", () => {
  const createdAt = new Date("2026-08-29T08:00:00.000Z");
  assert.doesNotThrow(() => assertCanChangeLearningMessage({
    authorId: "author",
    actorId: "author",
    createdAt,
    state: "visible",
    now: new Date("2026-08-29T08:15:00.000Z"),
  }));
  assert.throws(() => assertCanChangeLearningMessage({
    authorId: "author",
    actorId: "author",
    createdAt,
    state: "visible",
    now: new Date("2026-08-29T08:15:00.001Z"),
  }), /15 минут/);
  assert.throws(() => assertCanChangeLearningMessage({
    authorId: "author",
    actorId: "other",
    createdAt,
    state: "visible",
    now: createdAt,
  }), /только его автор/);
});

test("chat attachments are limited to five safe images, videos, PDFs or audio files of 50 MB", () => {
  assert.doesNotThrow(() => validateLearningDialogAttachments([
    { mimeType: "image/jpeg", sizeBytes: 50 * 1024 * 1024 },
    { mimeType: "application/pdf", sizeBytes: 50 * 1024 * 1024 },
    { mimeType: "audio/mpeg", sizeBytes: 50 * 1024 * 1024 },
    { mimeType: "video/mp4", sizeBytes: 50 * 1024 * 1024 },
    { mimeType: "video/quicktime", sizeBytes: 50 * 1024 * 1024 },
  ]));
  assert.doesNotThrow(() => validateLearningDialogAttachments([
    { mimeType: "video/webm", sizeBytes: 50 * 1024 * 1024 },
  ]));
  assert.throws(() => validateLearningDialogAttachments([
    { mimeType: "application/zip", sizeBytes: 1 },
  ]), /изображения, видео, PDF и аудио/);
  assert.throws(() => validateLearningDialogAttachments([
    { mimeType: "audio/ogg", sizeBytes: 50 * 1024 * 1024 + 1 },
  ]), /50 MB/);
  assert.throws(() => validateLearningDialogAttachments(Array.from({ length: 6 }, () => ({
    mimeType: "image/png",
    sizeBytes: 1,
  }))), /не более пяти/);
  assert.throws(() => validateLearningDialogAttachments([
    { mimeType: "image/png", sizeBytes: 0 },
  ]), /пустой файл/);
});

test("chat attachment signatures reject disguised files and accept video containers", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(detectLearningDialogMimeType(png), "image/png");
  assert.equal(assertLearningDialogFileSignature("image/png", png), "image/png");
  assert.throws(() => assertLearningDialogFileSignature("image/png", Buffer.from("not a png")), /не соответствует/);

  const videoMp4 = Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from("ftypmp42____vide", "ascii"),
  ]);
  assert.equal(detectLearningDialogMimeType(videoMp4), "video/mp4");
  assert.equal(assertLearningDialogFileSignature("video/mp4", videoMp4), "video/mp4");
  assert.throws(() => assertLearningDialogFileSignature("audio/mp4", videoMp4), /не соответствует/);

  const quicktime = Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from("ftypqt  ____vide", "ascii"),
  ]);
  assert.equal(detectLearningDialogMimeType(quicktime), "video/quicktime");
  assert.equal(assertLearningDialogFileSignature("video/quicktime", quicktime), "video/quicktime");
});

test("conversation retention keeps attachments for one year and text for three", () => {
  assert.deepEqual(getLearningConversationRetention(new Date("2026-08-29T08:00:00.000Z")), {
    attachmentRetentionUntil: new Date("2027-08-29T08:00:00.000Z"),
    textRetentionUntil: new Date("2029-08-29T08:00:00.000Z"),
  });
});
