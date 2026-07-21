import { cmsApi } from "@/lib/cms-api";
import { inferFileMimeType } from "@/lib/media-utils";

export function fileToBase64(file: globalThis.File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function uploadMediaFile(file: globalThis.File, metadata?: { title?: string; description?: string }) {
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("Файл больше 20 МБ");
  }
  return cmsApi.uploadMedia({
    filename: file.name,
    mimeType: inferFileMimeType(file),
    ...metadata,
    base64: await fileToBase64(file),
  });
}
