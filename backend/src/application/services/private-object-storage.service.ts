import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { env } from "../../config/env.js";
import { NotFoundError } from "../../domain/errors.js";

const privateRoot = path.resolve(env.UPLOAD_DIR, "private");
const quarantineRoot = path.resolve(env.UPLOAD_DIR, "quarantine");
let s3Client: S3Client | null = null;

function validatedKey(key: string) {
  if (!/^[a-zA-Z0-9/_\-.]+$/.test(key) || key.startsWith("/") || key.includes("..")) {
    throw new NotFoundError("Private file");
  }
  return key;
}

function localPath(key: string) {
  const resolved = path.resolve(privateRoot, validatedKey(key));
  if (!resolved.startsWith(`${privateRoot}${path.sep}`)) throw new NotFoundError("Private file");
  return resolved;
}

function client() {
  if (s3Client) return s3Client;
  if (!env.S3_ENDPOINT || !env.S3_REGION || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new Error("S3 private storage is not fully configured");
  }
  s3Client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
  return s3Client;
}

function bucket() {
  if (!env.S3_BUCKET) throw new Error("S3_BUCKET is not configured");
  return env.S3_BUCKET;
}

function encryptionOptions() {
  return env.S3_SERVER_SIDE_ENCRYPTION
    ? { ServerSideEncryption: env.S3_SERVER_SIDE_ENCRYPTION }
    : {};
}

function isNotFound(error: unknown) {
  const details = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return details.$metadata?.httpStatusCode === 404 || details.name === "NoSuchKey" || details.name === "NotFound";
}

function readableBody(body: unknown) {
  if (body instanceof Readable) return body;
  if (body && typeof (body as { transformToWebStream?: unknown }).transformToWebStream === "function") {
    return Readable.fromWeb((body as { transformToWebStream(): ReadableStream }).transformToWebStream());
  }
  throw new Error("S3 returned an unsupported response body");
}

async function bodyText(body: unknown) {
  let value = "";
  for await (const chunk of readableBody(body)) value += Buffer.from(chunk).toString("utf8");
  return value;
}

export function createPrivateQuarantinePath(id: string) {
  const safeId = id.replace(/[^a-zA-Z0-9_.-]/g, "-");
  return path.join(quarantineRoot, safeId);
}

export async function promotePrivateObject(input: {
  key: string;
  temporaryPath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}) {
  const key = validatedKey(input.key);
  if (env.PRIVATE_STORAGE_DRIVER === "local") {
    const destination = localPath(key);
    await mkdir(path.dirname(destination), { recursive: true });
    await rename(input.temporaryPath, destination);
    return;
  }

  await client().send(new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    Body: createReadStream(input.temporaryPath),
    ContentType: input.mimeType,
    ContentLength: input.sizeBytes,
    Metadata: { sha256: input.sha256 },
    ...encryptionOptions(),
  }));
  await unlink(input.temporaryPath);
}

export async function putPrivateTextObject(key: string, value: string) {
  const safeKey = validatedKey(key);
  if (env.PRIVATE_STORAGE_DRIVER === "local") {
    const destination = localPath(safeKey);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, value, "utf8");
    return;
  }
  await client().send(new PutObjectCommand({
    Bucket: bucket(),
    Key: safeKey,
    Body: value,
    ContentType: "application/json",
    ...encryptionOptions(),
  }));
}

export async function readPrivateTextObject(key: string) {
  const safeKey = validatedKey(key);
  if (env.PRIVATE_STORAGE_DRIVER === "local") {
    try {
      return await readFile(localPath(safeKey), "utf8");
    } catch {
      throw new NotFoundError("Private file");
    }
  }
  try {
    const response = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: safeKey }));
    return await bodyText(response.Body);
  } catch (error) {
    if (isNotFound(error)) throw new NotFoundError("Private file");
    throw error;
  }
}

export async function privateObjectExists(key: string) {
  const safeKey = validatedKey(key);
  if (env.PRIVATE_STORAGE_DRIVER === "local") {
    try {
      return (await stat(localPath(safeKey))).isFile();
    } catch {
      return false;
    }
  }
  try {
    await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: safeKey }));
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

export async function getPrivateObject(key: string) {
  const safeKey = validatedKey(key);
  if (env.PRIVATE_STORAGE_DRIVER === "local") {
    try {
      const filePath = localPath(safeKey);
      const details = await stat(filePath);
      if (!details.isFile()) throw new NotFoundError("Private file");
      return { sizeBytes: details.size, stream: createReadStream(filePath) };
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new NotFoundError("Private file");
    }
  }
  try {
    const response = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: safeKey }));
    return { sizeBytes: response.ContentLength ?? 0, stream: readableBody(response.Body) };
  } catch (error) {
    if (isNotFound(error)) throw new NotFoundError("Private file");
    throw error;
  }
}

export async function deletePrivateObject(key: string) {
  const safeKey = validatedKey(key);
  if (env.PRIVATE_STORAGE_DRIVER === "local") {
    await unlink(localPath(safeKey)).catch(() => undefined);
    return;
  }
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: safeKey }));
}

export async function copyIntoPrivateQuarantine(source: Readable, temporaryPath: string) {
  await mkdir(path.dirname(temporaryPath), { recursive: true });
  await pipeline(source, createWriteStream(temporaryPath, { flags: "wx" }));
}
