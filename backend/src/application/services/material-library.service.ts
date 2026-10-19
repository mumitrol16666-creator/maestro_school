import { randomUUID } from "node:crypto";
import path from "node:path";
import type { MaterialKind } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../domain/errors.js";
import { isOfflineCoordinatorRole } from "../../domain/cms-access.js";
import { inferMimeType, mediaFolderFor, mediaPath, writeMediaFile } from "./media-storage.service.js";

/**
 * Plan 1.12: the school's shared library of materials. A teacher or school admin pastes a link and
 * gives it a caption, or uploads a file; lesson and homework fields then suggest these by caption,
 * with the type shown (MP4, PNG, ссылка).
 */

export const MATERIAL_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|videodelivery\.net|cloudflarestream\.com)$/i;
const extensionKinds: Array<[RegExp, MaterialKind]> = [
  [/\.(mp4|m4v|mov|webm|ogv)$/i, "video"],
  [/\.(png|jpe?g|webp|gif|heic)$/i, "image"],
  [/\.pdf$/i, "pdf"],
  [/\.(mp3|m4a|wav|ogg|aac|flac)$/i, "audio"],
  [/\.(docx?|xlsx?|pptx?|zip|txt|gp\d?|gpx|mid|midi|musicxml|mscz)$/i, "file"],
];

/** What a link or a file is, from its MIME type, its host or its extension. */
export function materialKindFor(url: string, mimeType?: string | null): MaterialKind {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("audio/")) return "audio";
  let pathname = url;
  try {
    const parsed = new URL(url, "https://maestro.local");
    if (VIDEO_HOSTS.test(parsed.hostname)) return "video";
    pathname = parsed.pathname;
  } catch {
    // Plain path: use it as is.
  }
  for (const [pattern, kind] of extensionKinds) if (pattern.test(pathname)) return kind;
  if (mime && mime !== "application/octet-stream") return "file";
  return url.startsWith("/api/v1/media/") ? "file" : "link";
}

/** Short label the UI shows next to the caption: MP4, PNG, PDF, YouTube, ссылка. */
export function materialBadge(url: string, kind: MaterialKind, mimeType?: string | null) {
  try {
    const host = new URL(url, "https://maestro.local").hostname.replace(/^www\./, "");
    if (/youtube\.com|youtu\.be/.test(host)) return "YouTube";
    if (/vimeo\.com/.test(host)) return "Vimeo";
  } catch {
    // ignore
  }
  const extension = path.extname(url.split(/[?#]/)[0] ?? "").replace(".", "").toUpperCase();
  if (extension && extension.length <= 5 && kind !== "link") return extension === "JPEG" ? "JPG" : extension;
  if (mimeType?.includes("/")) return mimeType.split("/")[1]!.toUpperCase().slice(0, 5);
  return kind === "link" ? "ссылка" : kind === "video" ? "видео" : "файл";
}

function itemDto(item: {
  id: string; kind: MaterialKind; title: string; url: string; mimeType: string | null; sizeBytes: number | null;
  createdAt: Date; createdById: string | null; createdBy?: { firstName: string | null; lastName: string | null } | null;
}) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    url: item.url,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    badge: materialBadge(item.url, item.kind, item.mimeType),
    createdAt: item.createdAt,
    createdById: item.createdById,
    createdByName: item.createdBy ? [item.createdBy.lastName, item.createdBy.firstName].filter(Boolean).join(" ") || null : null,
  };
}

const withAuthor = { createdBy: { select: { firstName: true, lastName: true } } } as const;

function normalizeTitle(title: string) {
  const value = title.trim().replace(/\s+/g, " ");
  if (!value || value.length > 255) {
    throw new BadRequestError("Подпись материала: от 1 до 255 символов", "MATERIAL_TITLE_INVALID");
  }
  return value;
}

function normalizeLink(url: string) {
  const value = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BadRequestError("Вставьте полную ссылку, начиная с https://", "MATERIAL_URL_INVALID");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || value.length > 2048) {
    throw new BadRequestError("Ссылка должна начинаться с https:// и быть не длиннее 2048 символов", "MATERIAL_URL_INVALID");
  }
  // Files uploaded here are kept as same-site paths, whatever host they were copied from.
  const media = /^\/api\/v1\/media\/(images|pdf|files)\/[A-Za-z0-9._-]+$/.exec(parsed.pathname);
  return media ? parsed.pathname : value;
}

/** The library, newest first; `search` matches the caption, so typing a title finds the material. */
export async function listMaterialLibrary(input: { search?: string; kind?: MaterialKind; limit?: number } = {}) {
  const search = input.search?.trim();
  const rows = await prisma.materialLibraryItem.findMany({
    where: {
      archivedAt: null,
      ...(input.kind ? { kind: input.kind } : {}),
      ...(search ? { title: { contains: search, mode: "insensitive" as const } } : {}),
    },
    include: withAuthor,
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(input.limit ?? 50, 1), 200),
  });
  return rows.map(itemDto);
}

/** Adds a link with its caption. The same link added again returns the existing entry. */
export async function addMaterialLink(userId: string, input: { url: string; title: string }) {
  const url = normalizeLink(input.url);
  const title = normalizeTitle(input.title);
  const existing = await prisma.materialLibraryItem.findFirst({ where: { url, archivedAt: null }, include: withAuthor });
  if (existing) return { item: itemDto(existing), duplicate: true };
  const created = await prisma.materialLibraryItem.create({
    data: { kind: materialKindFor(url), title, url, createdById: userId },
    include: withAuthor,
  });
  return { item: itemDto(created), duplicate: false };
}

/** Uploads a file into the school's media storage and adds it to the library. */
export async function uploadMaterialFile(userId: string, input: {
  filename: string;
  mimeType?: string | null;
  contentBase64: string;
  title?: string | null;
}) {
  const bytes = Buffer.from(input.contentBase64, "base64");
  if (!bytes.length) throw new BadRequestError("Файл пустой", "MATERIAL_FILE_EMPTY");
  if (bytes.length > MATERIAL_UPLOAD_MAX_BYTES) {
    throw new BadRequestError("Файл больше 20 МБ. Видео лучше загрузить на YouTube и добавить ссылкой.", "MATERIAL_FILE_TOO_LARGE");
  }
  const mimeType = inferMimeType(input.filename, input.mimeType ?? "");
  const folder = mediaFolderFor(mimeType);
  const extension = path.extname(input.filename).toLowerCase().replace(/[^a-z0-9.]/g, "");
  const filename = `${randomUUID()}${extension}`;
  const title = normalizeTitle(input.title?.trim() || path.basename(input.filename, path.extname(input.filename)));
  await writeMediaFile(folder, filename, bytes, { originalFilename: input.filename, mimeType, title });
  const url = mediaPath(folder, filename);
  const created = await prisma.materialLibraryItem.create({
    data: {
      kind: materialKindFor(url, mimeType),
      title,
      url,
      mimeType,
      sizeBytes: bytes.length,
      mediaFolder: folder,
      mediaFilename: filename,
      createdById: userId,
    },
    include: withAuthor,
  });
  return itemDto(created);
}

async function requireEditable(actor: { id: string; roleSlug: string }, id: string) {
  const item = await prisma.materialLibraryItem.findFirst({ where: { id, archivedAt: null } });
  if (!item) throw new NotFoundError("Материал");
  // The author edits their own material; school admins and coordinators edit any.
  if (item.createdById !== actor.id && !isOfflineCoordinatorRole(actor.roleSlug)) {
    throw new ForbiddenError("Изменять материал может автор или администратор школы");
  }
  return item;
}

export async function renameMaterial(actor: { id: string; roleSlug: string }, id: string, title: string) {
  await requireEditable(actor, id);
  const updated = await prisma.materialLibraryItem.update({
    where: { id },
    data: { title: normalizeTitle(title) },
    include: withAuthor,
  });
  return itemDto(updated);
}

/**
 * Removes a material from the library. The record stays archived and an uploaded file stays on
 * disk, because lessons and homework already sent may point to it.
 */
export async function archiveMaterial(actor: { id: string; roleSlug: string }, id: string) {
  await requireEditable(actor, id);
  await prisma.materialLibraryItem.update({ where: { id }, data: { archivedAt: new Date() } });
  return { archived: true, id };
}
