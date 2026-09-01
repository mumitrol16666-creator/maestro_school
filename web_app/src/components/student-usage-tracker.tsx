"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { sendAppUsageEvent, type AppUsageClientEvent } from "@/lib/app-usage-api";

const SESSION_ID_KEY = "maestro_usage_session_id";
const SESSION_SENT_KEY = "maestro_usage_session_sent";

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sessionId() {
  const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
  if (existing) return existing;
  const created = newId();
  window.sessionStorage.setItem(SESSION_ID_KEY, created);
  return created;
}

function track(eventType: AppUsageClientEvent, path: string | null, session: string) {
  void sendAppUsageEvent({
    eventKey: `usage:${newId()}`,
    eventType,
    path,
    sessionId: session,
  }).catch(() => undefined);
}

export function StudentUsageTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const session = sessionId();
    if (!window.sessionStorage.getItem(SESSION_SENT_KEY)) {
      window.sessionStorage.setItem(SESSION_SENT_KEY, "1");
      track("session_started", pathname, session);
    }

    const viewKey = `maestro_usage_view:${pathname}`;
    const lastSentAt = Number(window.sessionStorage.getItem(viewKey) ?? 0);
    if (Date.now() - lastSentAt < 15_000) return;
    window.sessionStorage.setItem(viewKey, String(Date.now()));
    track("page_view", pathname, session);
  }, [pathname]);

  return null;
}
