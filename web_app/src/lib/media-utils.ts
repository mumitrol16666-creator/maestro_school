import type { CmsMaterial, CmsMedia } from "@/types/cms";

export function titleFromFilename(name: string): string {
  const trimmed = name.trim();
  const withoutExt = trimmed.replace(/\.[^.]+$/, "");
  return withoutExt || trimmed;
}

export function materialTypeFromFile(file: globalThis.File): CmsMaterial["type"] {
  const lower = file.name.toLowerCase();
  if (file.type === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/i.test(lower)) return "image";
  return "file";
}

export function materialTypeFromMedia(media: CmsMedia): CmsMaterial["type"] {
  if (media.folder === "pdf") return "pdf";
  if (media.folder === "images") return "image";
  return "file";
}

export function inferFileMimeType(file: globalThis.File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".ogv")) return "video/ogg";
  if (/\.(mp4|m4v|mov)$/i.test(lower)) return "video/mp4";
  return file.type || "application/octet-stream";
}

export function formatMediaSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}
