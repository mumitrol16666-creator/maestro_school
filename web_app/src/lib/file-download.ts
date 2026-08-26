/**
 * Helpers for reliable file downloading across desktop, mobile browsers and PWA/TWA.
 */

export function isManagedMediaUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url, "https://app.maestro.com.kz");
    return parsed.pathname.includes("/api/v1/media/") || parsed.pathname.includes("/media/");
  } catch {
    return url.includes("/media/");
  }
}

export function formatDownloadUrl(url?: string | null, _filename?: string): string {
  if (!url) return "";
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed, typeof window !== "undefined" ? window.location.origin : "https://app.maestro.com.kz");
    if (isManagedMediaUrl(trimmed)) {
      parsed.searchParams.set("download", "1");
      return parsed.toString();
    }
    return trimmed;
  } catch {
    if (isManagedMediaUrl(trimmed) && !trimmed.includes("download=")) {
      return trimmed.includes("?") ? `${trimmed}&download=1` : `${trimmed}?download=1`;
    }
    return trimmed;
  }
}

export async function triggerFileDownload(url?: string | null, filename?: string): Promise<void> {
  if (!url) return;
  const directUrl = formatDownloadUrl(url, filename);
  const targetName = filename?.trim() || "material";

  try {
    const response = await fetch(directUrl, { mode: "cors" });
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = targetName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 2000);
  } catch {
    const link = document.createElement("a");
    link.href = directUrl;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.download = targetName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
