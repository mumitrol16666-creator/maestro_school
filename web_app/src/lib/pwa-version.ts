export const APP_CACHE_VERSION = process.env.NEXT_PUBLIC_RELEASE_SHA?.trim() || "dev";
export const SERVICE_WORKER_URL = `/sw.js?v=${encodeURIComponent(APP_CACHE_VERSION)}`;
