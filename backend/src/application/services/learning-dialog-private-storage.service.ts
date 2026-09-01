import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  assertLearningDialogFileSignature,
  LEARNING_DIALOG_FILE_MAX_BYTES,
  LEARNING_DIALOG_SIGNATURE_SAMPLE_BYTES,
  validateLearningDialogAttachments,
} from "../../domain/learning-dialog-policy.js";
import { BadRequestError } from "../../domain/errors.js";
import { scanFileForMalware } from "./malware-scanner.service.js";
import {
  createPrivateQuarantinePath,
  deletePrivateObject,
  getPrivateObject,
  promotePrivateObject,
} from "./private-object-storage.service.js";

const extensionByMime: Record<string, string> = {
  "application/pdf": ".pdf",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/webm": ".webm",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
};

export type StoredLearningDialogFile = {
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};

function safeOriginalFilename(filename: string) {
  const normalized = path.basename(filename).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (normalized || "attachment").slice(0, 255);
}

export async function storeLearningDialogFile(input: {
  conversationId: string;
  filename: string;
  mimeType: string;
  stream: Readable;
}) {
  const declaredMime = input.mimeType.trim().toLowerCase();
  try {
    validateLearningDialogAttachments([{ mimeType: declaredMime, sizeBytes: 1 }]);
  } catch (error) {
    input.stream.resume();
    throw error;
  }
  const extension = extensionByMime[declaredMime];
  if (!extension) {
    input.stream.resume();
    throw new BadRequestError("Неподдерживаемый формат файла");
  }

  const storageKey = `learning-dialogs/${input.conversationId}/${randomUUID()}${extension}`;
  const temporaryPath = createPrivateQuarantinePath(`dialog-${randomUUID()}.upload`);
  await mkdir(path.dirname(temporaryPath), { recursive: true });

  const hash = createHash("sha256");
  const samples: Buffer[] = [];
  let sampleBytes = 0;
  let sizeBytes = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      sizeBytes += chunk.length;
      if (sizeBytes > LEARNING_DIALOG_FILE_MAX_BYTES) {
        callback(new BadRequestError("Файл не должен превышать 50 MB"));
        return;
      }
      hash.update(chunk);
      if (sampleBytes < LEARNING_DIALOG_SIGNATURE_SAMPLE_BYTES) {
        const remaining = LEARNING_DIALOG_SIGNATURE_SAMPLE_BYTES - sampleBytes;
        const sample = chunk.subarray(0, remaining);
        samples.push(sample);
        sampleBytes += sample.length;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(input.stream, meter, createWriteStream(temporaryPath, { flags: "wx" }));
    validateLearningDialogAttachments([{ mimeType: declaredMime, sizeBytes }]);
    assertLearningDialogFileSignature(declaredMime, Buffer.concat(samples));
    const sha256 = hash.digest("hex");
    await scanFileForMalware(temporaryPath);
    await promotePrivateObject({
      key: storageKey,
      temporaryPath,
      mimeType: declaredMime,
      sizeBytes,
      sha256,
    });
    return {
      storageKey,
      originalFilename: safeOriginalFilename(input.filename),
      mimeType: declaredMime,
      sizeBytes,
      sha256,
    } satisfies StoredLearningDialogFile;
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    await deletePrivateObject(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function deleteLearningDialogFile(storageKey: string) {
  await deletePrivateObject(storageKey);
}

export async function getLearningDialogFile(storageKey: string) {
  return getPrivateObject(storageKey);
}
