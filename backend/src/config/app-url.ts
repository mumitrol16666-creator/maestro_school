/**
 * Public address of the web application, for links that leave the app (Telegram). APP_PUBLIC_URL
 * wins; without it the first CORS_ORIGIN entry is the web app's own origin. Read on every call.
 */
export function appPublicUrl(source: NodeJS.ProcessEnv = process.env): string | null {
  const candidates = [
    source.APP_PUBLIC_URL,
    ...(source.CORS_ORIGIN ?? "").split(","),
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim().replace(/\/+$/, "");
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:" || url.protocol === "http:") return `${url.origin}${url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "")}`;
    } catch {
      // not a URL, try the next one
    }
  }
  return null;
}
