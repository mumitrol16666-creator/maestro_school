import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";

export const mediaFolders = ["images", "pdf", "files"] as const;
export type MediaFolder = typeof mediaFolders[number];

interface MediaMetadata {
  originalFilename: string;
  mimeType: string;
  title?: string;
  description?: string;
}

const uploadRoot = path.resolve(env.UPLOAD_DIR);

export function inferMimeType(filename: string, mimeType: string): string {
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  if ([".mp4", ".webm", ".mov", ".m4v", ".ogv"].includes(extension)) {
    return extension === ".webm" ? "video/webm" : extension === ".ogv" ? "video/ogg" : "video/mp4";
  }
  return mimeType || "application/octet-stream";
}

export function mediaFolderFor(mime: string): MediaFolder {
  if (mime.startsWith("image/")) return "images";
  if (mime === "application/pdf") return "pdf";
  return "files";
}

export function materialTypeForFolder(folder: MediaFolder): "pdf" | "image" | "file" {
  if (folder === "pdf") return "pdf";
  if (folder === "images") return "image";
  return "file";
}

/** Same-site path of a stored file. Pages load it with the signed-in user's media cookie (plan 1.12). */
export function mediaPath(folder: string, filename: string) {
  return `/api/v1/media/${folder}/${filename}`;
}

/**
 * Absolute URL, only for places outside the site (the avatar CRM shows). Behind the TLS proxy the
 * request itself is plain http, so the forwarded scheme decides.
 */
export function mediaPublicUrl(
  request: { protocol: string; host: string; headers?: Record<string, string | string[] | undefined> },
  folder: string,
  filename: string,
) {
  const forwarded = request.headers?.["x-forwarded-proto"];
  const scheme = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || request.protocol;
  return `${scheme}://${request.host}${mediaPath(folder, filename)}`;
}

export function mediaDirectory(folder: MediaFolder) {
  return path.join(uploadRoot, folder);
}

export function mediaFilePath(folder: MediaFolder, filename: string) {
  return path.join(mediaDirectory(folder), filename);
}

function metadataPath(folder: MediaFolder, filename: string) {
  return `${mediaFilePath(folder, filename)}.meta.json`;
}

export async function writeMediaFile(folder: MediaFolder, filename: string, bytes: Buffer, metadata: MediaMetadata) {
  await mkdir(mediaDirectory(folder), { recursive: true });
  await Promise.all([
    writeFile(mediaFilePath(folder, filename), bytes),
    writeFile(metadataPath(folder, filename), JSON.stringify(metadata), "utf8"),
  ]);
}

export async function updateMediaTitle(folder: MediaFolder, filename: string, title: string) {
  const current = await readMediaMetadata(folder, filename);
  if (!current) throw new Error("Media metadata not found");
  await writeFile(metadataPath(folder, filename), JSON.stringify({ ...current, title }), "utf8");
}

export async function updateMediaMetadata(
  folder: MediaFolder,
  filename: string,
  patch: { title?: string; description?: string | null },
) {
  const current = await readMediaMetadata(folder, filename);
  if (!current) throw new Error("Media metadata not found");
  await writeFile(metadataPath(folder, filename), JSON.stringify({
    ...current,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.description !== undefined ? { description: patch.description || undefined } : {}),
  }), "utf8");
}

export async function readMediaMetadata(folder: MediaFolder, filename: string): Promise<MediaMetadata | null> {
  try {
    return JSON.parse(await readFile(metadataPath(folder, filename), "utf8")) as MediaMetadata;
  } catch {
    return null;
  }
}

export async function getMediaInfo(folder: MediaFolder, filename: string, request: { protocol: string; host: string }) {
  try {
    const [details, metadata] = await Promise.all([
      stat(mediaFilePath(folder, filename)),
      readMediaMetadata(folder, filename),
    ]);
    if (!details.isFile()) return null;
    return {
      filename,
      originalFilename: metadata?.originalFilename ?? filename,
      title: metadata?.title?.trim() || metadata?.originalFilename || filename,
      description: metadata?.description?.trim() || null,
      mimeType: metadata?.mimeType ?? null,
      folder,
      size: details.size,
      createdAt: details.birthtime,
      url: mediaPath(folder, filename),
    };
  } catch {
    return null;
  }
}

export function parseMediaUrl(value: string): { folder: MediaFolder; filename: string } | null {
  try {
    const parts = new URL(value).pathname.split("/").filter(Boolean);
    const mediaIndex = parts.lastIndexOf("media");
    const folder = parts[mediaIndex + 1];
    const filename = parts[mediaIndex + 2];
    if (mediaIndex < 0 || !mediaFolders.includes(folder as MediaFolder) || !filename || !/^[a-zA-Z0-9._-]+$/.test(filename)) return null;
    return { folder: folder as MediaFolder, filename };
  } catch {
    return null;
  }
}

export async function getMediaInfoFromUrl(value: string, request: { protocol: string; host: string }) {
  const parsed = parseMediaUrl(value);
  return parsed ? getMediaInfo(parsed.folder, parsed.filename, request) : null;
}

export async function deleteMediaFile(folder: MediaFolder, filename: string) {
  await unlink(mediaFilePath(folder, filename));
  await unlink(metadataPath(folder, filename)).catch(() => undefined);
}
