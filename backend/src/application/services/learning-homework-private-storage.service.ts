import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BadRequestError, NotFoundError } from "../../domain/errors.js";
import {
  detectLearningDialogMimeType,
  LEARNING_DIALOG_SIGNATURE_SAMPLE_BYTES,
} from "../../domain/learning-dialog-policy.js";
import { scanFileForMalware } from "./malware-scanner.service.js";
import {
  createPrivateQuarantinePath,
  deletePrivateObject,
  getPrivateObject,
  privateObjectExists,
  promotePrivateObject,
  putPrivateTextObject,
  readPrivateTextObject,
} from "./private-object-storage.service.js";

const imageMimeTypes = new Set([
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const audioMimeTypes = new Set([
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
]);
const videoMimeTypes = new Set(["video/mp4", "video/quicktime", "video/webm"]);

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

type HomeworkFileMetadata = {
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};

function maxBytesFor(mimeType: string) {
  if (imageMimeTypes.has(mimeType)) return 15 * 1024 * 1024;
  if (mimeType === "application/pdf") return 25 * 1024 * 1024;
  if (audioMimeTypes.has(mimeType)) return 100 * 1024 * 1024;
  if (videoMimeTypes.has(mimeType)) return 500 * 1024 * 1024;
  throw new BadRequestError("Разрешены изображения, PDF, аудио и видео");
}

function sizeError(mimeType: string) {
  if (imageMimeTypes.has(mimeType)) return "Изображение не должно превышать 15 MB";
  if (mimeType === "application/pdf") return "PDF не должен превышать 25 MB";
  if (audioMimeTypes.has(mimeType)) return "Аудио не должно превышать 100 MB";
  return "Видео не должно превышать 500 MB";
}

function safeOriginalFilename(filename: string) {
  const normalized = path.basename(filename).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (normalized || "attachment").slice(0, 255);
}

function assignmentStoragePrefix(assignmentId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) throw new NotFoundError("Homework file");
  return `learning-homework/${assignmentId}`;
}

function storedKey(assignmentId: string, filename: string) {
  if (!/^[a-f0-9]{64}\.[a-z0-9]+$/i.test(filename)) throw new NotFoundError("Homework file");
  return `${assignmentStoragePrefix(assignmentId)}/${filename}`;
}

function signaturesMatch(declared: string, detected: string | null) {
  if (!detected) return false;
  if (declared === detected) return true;
  const heif = new Set(["image/heic", "image/heif"]);
  if (heif.has(declared) && heif.has(detected)) return true;
  return declared === "video/quicktime" && detected === "video/mp4";
}

export function learningHomeworkMaterialType(mimeType: string): "audio" | "video" | "file" {
  if (audioMimeTypes.has(mimeType)) return "audio";
  if (videoMimeTypes.has(mimeType)) return "video";
  return "file";
}

export async function storeLearningHomeworkFile(input: {
  assignmentId: string;
  filename: string;
  mimeType: string;
  stream: Readable;
}) {
  const mimeType = input.mimeType.trim().toLowerCase();
  const maxBytes = maxBytesFor(mimeType);
  const extension = extensionByMime[mimeType];
  assignmentStoragePrefix(input.assignmentId);
  const temporaryPath = createPrivateQuarantinePath(`homework-${randomUUID()}.upload`);
  await mkdir(path.dirname(temporaryPath), { recursive: true });
  const hash = createHash("sha256");
  const samples: Buffer[] = [];
  let sampleBytes = 0;
  let sizeBytes = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      sizeBytes += chunk.length;
      if (sizeBytes > maxBytes) {
        callback(new BadRequestError(sizeError(mimeType)));
        return;
      }
      hash.update(chunk);
      if (sampleBytes < LEARNING_DIALOG_SIGNATURE_SAMPLE_BYTES) {
        const sample = chunk.subarray(0, LEARNING_DIALOG_SIGNATURE_SAMPLE_BYTES - sampleBytes);
        samples.push(sample);
        sampleBytes += sample.length;
      }
      callback(null, chunk);
    },
  });
  let created = false;
  let objectKey: string | null = null;

  try {
    await pipeline(input.stream, meter, createWriteStream(temporaryPath, { flags: "wx" }));
    if (sizeBytes === 0) throw new BadRequestError("Нельзя прикрепить пустой файл");
    const detected = detectLearningDialogMimeType(Buffer.concat(samples));
    if (!signaturesMatch(mimeType, detected)) {
      throw new BadRequestError("Содержимое файла не соответствует заявленному формату");
    }
    const sha256 = hash.digest("hex");
    const filename = `${sha256}${extension}`;
    objectKey = storedKey(input.assignmentId, filename);
    await scanFileForMalware(temporaryPath);
    if (await privateObjectExists(objectKey)) {
      await unlink(temporaryPath);
    } else {
      await promotePrivateObject({
        key: objectKey,
        temporaryPath,
        mimeType,
        sizeBytes,
        sha256,
      });
      created = true;
    }
    const metadata: HomeworkFileMetadata = {
      originalFilename: safeOriginalFilename(input.filename),
      mimeType,
      sizeBytes,
      sha256,
    };
    await putPrivateTextObject(`${objectKey}.meta.json`, JSON.stringify(metadata));
    return { ...metadata, filename, created };
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    if (created && objectKey) await deletePrivateObject(objectKey).catch(() => undefined);
    throw error;
  }
}

export async function deleteLearningHomeworkFile(assignmentId: string, filename: string) {
  const objectKey = storedKey(assignmentId, filename);
  await Promise.all([
    deletePrivateObject(objectKey).catch(() => undefined),
    deletePrivateObject(`${objectKey}.meta.json`).catch(() => undefined),
  ]);
}

export async function getLearningHomeworkFile(assignmentId: string, filename: string) {
  const objectKey = storedKey(assignmentId, filename);
  try {
    const [object, metadataText] = await Promise.all([
      getPrivateObject(objectKey),
      readPrivateTextObject(`${objectKey}.meta.json`),
    ]);
    const metadata = JSON.parse(metadataText) as HomeworkFileMetadata;
    return { ...metadata, stream: object.stream };
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw new NotFoundError("Homework file");
  }
}
