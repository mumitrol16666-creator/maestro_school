import { apiRequest } from "@/lib/api-client";

export type AppUsageClientEvent = "session_started" | "page_view";

export function sendAppUsageEvent(body: {
  eventKey: string;
  eventType: AppUsageClientEvent;
  path?: string | null;
  sessionId: string;
}) {
  return apiRequest<{ id: string; occurredAt: string }>("/usage/events", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
