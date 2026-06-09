export type VideoProvider = "youtube" | "vimeo" | "cloudflare" | "unknown";

export interface ParsedVideo {
  provider: VideoProvider;
  videoId: string;
  embedUrl: string;
}

function youtubeEmbedId(id: string) {
  return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
}

function vimeoEmbedId(id: string) {
  return `https://player.vimeo.com/video/${id}`;
}

function cloudflareEmbedId(id: string, host?: string) {
  const base = host ?? "iframe.videodelivery.net";
  return `https://${base}/${id}`;
}

export function parseVideoUrl(videoUrl?: string | null): ParsedVideo | null {
  if (!videoUrl?.trim()) return null;

  let url: URL;
  try {
    url = new URL(videoUrl.trim());
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  // YouTube
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (!id) return null;
    return { provider: "youtube", videoId: id, embedUrl: youtubeEmbedId(id) };
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (url.pathname.startsWith("/embed/")) {
      const id = url.pathname.split("/")[2];
      if (!id) return null;
      return { provider: "youtube", videoId: id, embedUrl: youtubeEmbedId(id) };
    }
    if (url.pathname.startsWith("/shorts/")) {
      const id = url.pathname.split("/")[2];
      if (!id) return null;
      return { provider: "youtube", videoId: id, embedUrl: youtubeEmbedId(id) };
    }
    const id = url.searchParams.get("v");
    if (!id) return null;
    return { provider: "youtube", videoId: id, embedUrl: youtubeEmbedId(id) };
  }

  // Vimeo
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    const id = parts[parts.length - 1];
    if (!id || !/^\d+$/.test(id)) return null;
    return { provider: "vimeo", videoId: id, embedUrl: vimeoEmbedId(id) };
  }

  // Cloudflare Stream
  if (
    host === "videodelivery.net" ||
    host === "iframe.videodelivery.net" ||
    host.endsWith(".cloudflarestream.com")
  ) {
    const parts = url.pathname.split("/").filter(Boolean);
    const id = parts[0];
    if (!id) return null;
    const embedHost = host === "videodelivery.net" ? "iframe.videodelivery.net" : host;
    return { provider: "cloudflare", videoId: id, embedUrl: cloudflareEmbedId(id, embedHost) };
  }

  return null;
}
