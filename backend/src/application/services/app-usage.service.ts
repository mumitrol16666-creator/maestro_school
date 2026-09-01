import { randomUUID } from "node:crypto";
import { prisma } from "../../infrastructure/database/prisma.js";

export const APP_USAGE_EVENT_TYPES = ["login", "session_started", "page_view"] as const;
export type AppUsageEventType = typeof APP_USAGE_EVENT_TYPES[number];

export const APP_USAGE_SECTIONS = [
  "dashboard",
  "learning",
  "homework",
  "monthly_plan",
  "courses",
  "tests",
  "schedule",
  "league",
  "messages",
  "shop",
  "news",
  "profile",
  "account",
  "other",
] as const;
export type AppUsageSection = typeof APP_USAGE_SECTIONS[number];

export function appUsageSection(path?: string | null): AppUsageSection {
  if (!path) return "account";
  if (path === "/dashboard") return "dashboard";
  if (path === "/learning") return "learning";
  if (path.startsWith("/tasks") || path.startsWith("/lessons/")) return "homework";
  if (path.startsWith("/monthly-plan")) return "monthly_plan";
  if (path.startsWith("/courses")) return "courses";
  if (path.startsWith("/tests")) return "tests";
  if (path.startsWith("/school-lessons") || path.startsWith("/online-lessons")) return "schedule";
  if (path.startsWith("/league")) return "league";
  if (path.startsWith("/messages")) return "messages";
  if (path.startsWith("/rewards")) return "shop";
  if (path.startsWith("/board")) return "news";
  if (path.startsWith("/settings") || path.startsWith("/progress")) return "profile";
  return "other";
}

function normalizedPath(path?: string | null) {
  const value = path?.trim();
  if (!value || !value.startsWith("/")) return null;
  return value.slice(0, 500);
}

export async function recordAppUsageEvent(params: {
  eventKey: string;
  userId: string;
  eventType: AppUsageEventType;
  path?: string | null;
  sessionId?: string | null;
}) {
  const path = normalizedPath(params.path);
  const event = await prisma.appUsageEvent.upsert({
    where: { eventKey: params.eventKey },
    create: {
      eventKey: params.eventKey,
      userId: params.userId,
      eventType: params.eventType,
      section: appUsageSection(path),
      path,
      sessionId: params.sessionId?.trim().slice(0, 80) || null,
    },
    update: {},
    select: { id: true, occurredAt: true },
  });
  return event;
}

export async function recordStudentLogin(userId: string, source: "password" | "sso" | "registration") {
  return recordAppUsageEvent({
    eventKey: `student-login:${source}:${randomUUID()}`,
    userId,
    eventType: "login",
  });
}
