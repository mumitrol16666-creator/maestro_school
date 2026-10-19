/** A same-site path of an uploaded file (plan 1.12): served to signed-in users from the site itself. */
export const SAME_SITE_MEDIA_PATH = /^\/api\/v1\/media\/(images|pdf|files)\/[A-Za-z0-9._-]+(?:\?[^#\s]*)?$/;

export function isSameSiteMediaPath(value: string) {
  return SAME_SITE_MEDIA_PATH.test(value.trim());
}

/** Empty, an http(s) link, or a same-site media path. */
export function isSupportedMaterialUrl(value: string) {
  const input = value.trim();
  if (!input) return true;
  if (isSameSiteMediaPath(input)) return true;
  try {
    const url = new URL(input);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/** A required material link: http(s) or a same-site media path. */
export function isSupportedMaterialLink(value: string) {
  return value.trim().length > 0 && isSupportedMaterialUrl(value);
}
