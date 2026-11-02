/**
 * В-18: what the student shell knows about the connection. Three sources:
 * the browser (`navigator.onLine`), the API client (a request did not reach the server)
 * and the school data (CRM is down, so the schedule is the last copy the server kept).
 */
export type SchoolFreshness = { stale: boolean; unavailable: boolean; snapshotAt: string | null };

export type ConnectionStatus = {
  /** The device has no network, or the Maestro server did not answer the last request. */
  offline: boolean;
  /** A screen is showing an answer kept in memory because the request did not go through. */
  servedSaved: boolean;
  /** While offline: when the data on screen was received (the oldest saved answer shown, else the last answer). */
  savedAt: number | null;
  school: SchoolFreshness;
};

const NO_SCHOOL_ISSUE: SchoolFreshness = { stale: false, unavailable: false, snapshotAt: null };

let browserOffline = false;
let apiUnreachable = false;
let servedSaved = false;
let servedSavedAt: number | null = null;
let lastAnswerAt: number | null = null;
let school: SchoolFreshness = NO_SCHOOL_ISSUE;
let snapshot: ConnectionStatus = { offline: false, servedSaved: false, savedAt: null, school };
const listeners = new Set<() => void>();
let browserListenersAttached = false;

function publish() {
  const offline = browserOffline || apiUnreachable;
  const next: ConnectionStatus = {
    offline,
    servedSaved: offline && servedSaved,
    savedAt: offline ? servedSavedAt ?? lastAnswerAt : null,
    school,
  };
  if (
    next.offline === snapshot.offline
    && next.servedSaved === snapshot.servedSaved
    && next.savedAt === snapshot.savedAt
    && next.school === snapshot.school
  ) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

function onBrowserOnline() {
  browserOffline = false;
  // The next request decides whether the server is back; until then trust the browser.
  apiUnreachable = false;
  servedSaved = false;
  servedSavedAt = null;
  publish();
}

function onBrowserOffline() {
  browserOffline = true;
  publish();
}

export function subscribeConnectionStatus(listener: () => void) {
  if (!browserListenersAttached && typeof window !== "undefined") {
    browserListenersAttached = true;
    browserOffline = !window.navigator.onLine;
    window.addEventListener("online", onBrowserOnline);
    window.addEventListener("offline", onBrowserOffline);
    publish();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getConnectionStatus() {
  return snapshot;
}

export function reportApiReachable() {
  lastAnswerAt = Date.now();
  if (!apiUnreachable && !servedSaved) return;
  apiUnreachable = false;
  servedSaved = false;
  servedSavedAt = null;
  publish();
}

/** `servedSavedAt`: a saved answer received at that moment was shown instead of a live one. */
export function reportApiUnreachable(options: { servedSavedAt?: number } = {}) {
  apiUnreachable = true;
  if (options.servedSavedAt != null) {
    servedSaved = true;
    servedSavedAt = servedSavedAt == null ? options.servedSavedAt : Math.min(servedSavedAt, options.servedSavedAt);
  }
  publish();
}

/** Called with the school part of `/students/me/home` or `/students/me/offline-summary`. */
export function reportSchoolFreshness(summary: { crmStale?: boolean; crmSnapshotAt?: string | null } | null | undefined) {
  if (!summary) return;
  const stale = Boolean(summary.crmStale);
  const snapshotAt = stale ? summary.crmSnapshotAt ?? null : null;
  if (school.stale === stale && !school.unavailable && school.snapshotAt === snapshotAt) return;
  school = stale ? { stale, unavailable: false, snapshotAt } : NO_SCHOOL_ISSUE;
  publish();
}

/** The school data could not be read at all because CRM did not answer. */
export function reportSchoolUnavailable() {
  if (school.unavailable) return;
  school = { stale: false, unavailable: true, snapshotAt: null };
  publish();
}

export function isCrmUnavailableCode(code: string | null | undefined) {
  return code === "CRM_UNAVAILABLE" || code === "CRM_TIMEOUT";
}
