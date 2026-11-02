export type VideoProvider = "youtube" | "vimeo" | "cloudflare" | "instagram" | "tiktok" | "unknown";

export interface ParsedVideo {
  provider: VideoProvider;
  videoId: string;
  embedUrl: string;
  /** Shorts, Reels and TikTok are filmed upright: a 16:9 frame would shrink them to a strip. */
  vertical?: boolean;
}

export const videoProviderLabels: Record<VideoProvider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  cloudflare: "Cloudflare Stream",
  instagram: "Instagram",
  tiktok: "TikTok",
  unknown: "Неизвестно",
};

/** Frame classes for an embedded player: wide for ordinary videos, upright and centred for vertical ones. */
export function videoFrameClass(parsed: ParsedVideo) {
  return parsed.vertical
    ? "mx-auto aspect-[9/16] w-full max-w-[340px]"
    : "aspect-video w-full";
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
    if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/live/")) {
      const id = url.pathname.split("/")[2];
      if (!id) return null;
      return { provider: "youtube", videoId: id, embedUrl: youtubeEmbedId(id), vertical: url.pathname.startsWith("/shorts/") };
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

  // Instagram: a public post, reel or IGTV video plays in Instagram's own embed page.
  if (host === "instagram.com" || host === "m.instagram.com") {
    const [kind, code] = url.pathname.split("/").filter(Boolean);
    if (!kind || !code || !["p", "reel", "reels", "tv"].includes(kind) || !/^[\w-]+$/.test(code)) return null;
    const path = kind === "reels" ? "reel" : kind;
    return {
      provider: "instagram",
      videoId: code,
      embedUrl: `https://www.instagram.com/${path}/${code}/embed`,
      vertical: path === "reel",
    };
  }

  // TikTok: only full links carry the video id; vt.tiktok.com short links need a redirect first.
  if (host === "tiktok.com" || host === "m.tiktok.com") {
    const match = url.pathname.match(/\/video\/(\d+)/);
    if (!match) return null;
    return { provider: "tiktok", videoId: match[1], embedUrl: `https://www.tiktok.com/player/v1/${match[1]}`, vertical: true };
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
