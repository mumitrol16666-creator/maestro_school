import { cmsApi } from "@/lib/cms-api";

export function fileToBase64(file: globalThis.File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function uploadMediaFile(file: globalThis.File) {
  return cmsApi.uploadMedia({
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    base64: await fileToBase64(file),
  });
}
