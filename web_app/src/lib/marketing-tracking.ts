const CLIENT_STORAGE_KEY = "maestro_marketing_client_id";
const SESSION_STORAGE_KEY = "maestro_marketing_session_id";
const ATTRIBUTION_STORAGE_KEY = "maestro_marketing_attribution";
const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "fbclid",
  "ttclid",
  "yclid",
] as const;

type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];

export interface MarketingContext {
  clientId: string;
  sessionId: string;
  attribution: Record<string, unknown>;
  landingUrl: string;
  referrerUrl: string | null;
}

const crmMarketingApiUrl = () => {
  const localHost = typeof window !== "undefined"
    && ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const fallback = localHost ? "http://localhost:5001" : "https://app-maestro-school.duckdns.org";
  return (process.env.NEXT_PUBLIC_CRM_API_URL ?? fallback).replace(/\/$/, "");
};

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function readStorage(storage: Storage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {
    // Disabled storage must not block a booking.
  }
}

function readStoredAttribution(): Record<string, unknown> {
  const value = readStorage(window.localStorage, ATTRIBUTION_STORAGE_KEY);
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function currentAttribution(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  return ATTRIBUTION_KEYS.reduce<Record<string, string>>((result, key: AttributionKey) => {
    const value = params.get(key)?.trim();
    if (value) result[key] = value.slice(0, 220);
    return result;
  }, {});
}

export function getMarketingContext(): MarketingContext | null {
  if (typeof window === "undefined") return null;

  let clientId = readStorage(window.localStorage, CLIENT_STORAGE_KEY);
  if (!clientId) {
    clientId = createId("client");
    writeStorage(window.localStorage, CLIENT_STORAGE_KEY, clientId);
  }

  let sessionId = readStorage(window.sessionStorage, SESSION_STORAGE_KEY);
  if (!sessionId) {
    sessionId = createId("session");
    writeStorage(window.sessionStorage, SESSION_STORAGE_KEY, sessionId);
  }

  const stored = readStoredAttribution();
  const current = currentAttribution();
  const firstTouch = stored.firstTouch && typeof stored.firstTouch === "object"
    ? stored.firstTouch as Record<string, string>
    : {};
  const lastTouch = {
    ...((stored.lastTouch as Record<string, string> | undefined) ?? {}),
    ...current,
  };
  const attribution = {
    ...lastTouch,
    firstTouch: Object.keys(firstTouch).length ? firstTouch : current,
    lastTouch,
  };
  if (Object.keys(current).length || Object.keys(stored).length) {
    writeStorage(window.localStorage, ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
  }

  return {
    clientId,
    sessionId,
    attribution,
    landingUrl: window.location.href,
    referrerUrl: document.referrer || null,
  };
}

export function trackMarketingEvent(eventName: string, payload: Record<string, unknown> = {}) {
  const context = getMarketingContext();
  if (!context) return;

  const body = {
    eventName,
    clientId: context.clientId,
    sessionId: context.sessionId,
    attribution: context.attribution,
    pageUrl: window.location.href,
    referrer: document.referrer || null,
    payload,
    ...(payload.bookingId ? { bookingId: String(payload.bookingId) } : {}),
  };

  void fetch(`${crmMarketingApiUrl()}/api/marketing/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
}
