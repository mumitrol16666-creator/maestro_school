import { BadRequestError, ForbiddenError } from "./errors.js";

export const LEARNING_MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
export const LEARNING_DIALOG_MAX_ATTACHMENTS = 5;
export const LEARNING_DIALOG_FILE_MAX_BYTES = 50 * 1024 * 1024;
export const LEARNING_DIALOG_IMAGE_MAX_BYTES = LEARNING_DIALOG_FILE_MAX_BYTES;
export const LEARNING_DIALOG_PDF_MAX_BYTES = LEARNING_DIALOG_FILE_MAX_BYTES;
export const LEARNING_DIALOG_SIGNATURE_SAMPLE_BYTES = 512 * 1024;

const SAFE_IMAGE_MIME_TYPES = new Set([
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const SAFE_AUDIO_MIME_TYPES = new Set([
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
]);

const SAFE_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

function startsWith(bytes: Buffer, signature: readonly number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function containsAscii(bytes: Buffer, value: string) {
  return bytes.indexOf(Buffer.from(value, "ascii")) >= 0;
}

export function detectLearningDialogMimeType(bytes: Buffer): string | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (bytes.subarray(0, 6).toString("ascii") === "GIF87a"
    || bytes.subarray(0, 6).toString("ascii") === "GIF89a") return "image/gif";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = bytes.subarray(8, 12).toString("ascii");
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (["mif1", "msf1"].includes(brand)) return "image/heif";
    if (brand === "qt  ") return "video/quicktime";
    return containsAscii(bytes, "vide") ? "video/mp4" : "audio/mp4";
  }
  if (bytes.subarray(0, 3).toString("ascii") === "ID3"
    || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (bytes.subarray(0, 4).toString("ascii") === "OggS") return "audio/ogg";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WAVE") return "audio/wav";
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return containsAscii(bytes, "V_VP8") || containsAscii(bytes, "V_VP9") || containsAscii(bytes, "V_AV1")
      ? "video/webm"
      : "audio/webm";
  }
  return null;
}

export function assertLearningDialogFileSignature(declaredMimeType: string, bytes: Buffer) {
  const normalized = declaredMimeType.trim().toLowerCase();
  const detected = detectLearningDialogMimeType(bytes);
  const heifFamily = new Set(["image/heic", "image/heif"]);
  if (!detected || (detected !== normalized
    && !(heifFamily.has(detected) && heifFamily.has(normalized)))) {
    throw new BadRequestError("Содержимое файла не соответствует заявленному формату");
  }
  return detected;
}

export type LearningConversationSendState = {
  status: "active" | "read_only" | "closed";
  isMember: boolean;
  canWrite: boolean;
  leftAt?: Date | null;
  restrictedUntil?: Date | null;
};

export function isLearningDialogCuratorRole(roleSlug: string) {
  return ["admin", "owner", "super_admin", "curator"].includes(roleSlug);
}

export function assertCanSendLearningMessage(
  state: LearningConversationSendState,
  now = new Date(),
) {
  if (!state.isMember || state.leftAt) {
    throw new ForbiddenError("Диалог недоступен для отправки");
  }
  if (state.status !== "active" || !state.canWrite) {
    throw new ForbiddenError("Диалог доступен только для чтения");
  }
  if (state.restrictedUntil && state.restrictedUntil.getTime() > now.getTime()) {
    throw new ForbiddenError("Отправка сообщений временно ограничена");
  }
}

export function assertCanChangeLearningMessage(params: {
  authorId: string | null;
  actorId: string;
  createdAt: Date;
  state: "visible" | "retracted" | "hidden";
  now?: Date;
}) {
  if (!params.authorId || params.authorId !== params.actorId) {
    throw new ForbiddenError("Изменить сообщение может только его автор");
  }
  if (params.state !== "visible") {
    throw new BadRequestError("Сообщение уже отозвано или скрыто");
  }
  const now = params.now ?? new Date();
  if (now.getTime() - params.createdAt.getTime() > LEARNING_MESSAGE_EDIT_WINDOW_MS) {
    throw new BadRequestError("Изменить или отозвать сообщение можно в течение 15 минут");
  }
}

export function validateLearningDialogAttachments(
  attachments: Array<{ mimeType: string; sizeBytes: number }>,
) {
  if (attachments.length > LEARNING_DIALOG_MAX_ATTACHMENTS) {
    throw new BadRequestError("К одному сообщению можно прикрепить не более пяти файлов");
  }
  for (const attachment of attachments) {
    const mimeType = attachment.mimeType.trim().toLowerCase();
    if (!Number.isSafeInteger(attachment.sizeBytes) || attachment.sizeBytes <= 0) {
      throw new BadRequestError("Нельзя прикрепить пустой файл");
    }
    if (SAFE_IMAGE_MIME_TYPES.has(mimeType)
      || SAFE_AUDIO_MIME_TYPES.has(mimeType)
      || SAFE_VIDEO_MIME_TYPES.has(mimeType)
      || mimeType === "application/pdf") {
      if (attachment.sizeBytes > LEARNING_DIALOG_FILE_MAX_BYTES) {
        throw new BadRequestError("Файл не должен превышать 50 MB");
      }
      continue;
    }
    throw new BadRequestError("В сообщении разрешены только изображения, видео, PDF и аудио");
  }
}

export function getLearningConversationRetention(closedAt: Date) {
  const attachmentRetentionUntil = new Date(closedAt);
  attachmentRetentionUntil.setUTCFullYear(attachmentRetentionUntil.getUTCFullYear() + 1);
  const textRetentionUntil = new Date(closedAt);
  textRetentionUntil.setUTCFullYear(textRetentionUntil.getUTCFullYear() + 3);
  return { attachmentRetentionUntil, textRetentionUntil };
}
