/**
 * Plan 1.12: uploaded files are served from the site itself to signed-in users, with a media cookie
 * the browser sends on same-site requests only. Older links were saved with the host (often http://)
 * and links coming from CRM still are, so turn any media link into a same-site path.
 */
export function sameSiteMediaUrl(url: string): string;
export function sameSiteMediaUrl(url: string | null | undefined): string | null | undefined;
export function sameSiteMediaUrl(url: string | null | undefined) {
  if (!url) return url;
  const trimmed = url.trim();
  const match = /^https?:\/\/[^/]+(\/api\/v1\/media\/(?:images|pdf|files)\/[^?#\s]+(?:\?[^#\s]*)?)$/i.exec(trimmed);
  return match ? match[1] : trimmed;
}
