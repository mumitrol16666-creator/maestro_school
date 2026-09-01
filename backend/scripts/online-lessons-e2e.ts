/**
 * Full online-lessons flow verification.
 * Requires a running API, production seed and ADMIN_EMAIL / ADMIN_PASSWORD.
 *
 * Usage:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run e2e:online-lessons
 *   SMOKE_BASE_URL=https://maestro-school.duckdns.org ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run e2e:online-lessons
 */
export {};

import { createServer } from "node:http";
import { EconomicEpochStatus, PrismaClient } from "@prisma/client";
import { assertLocalE2eDatabase } from "./qa-database-guard.js";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:4000";
const API = `${BASE_URL}/api/v1`;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const INTEGRATION_SECRET = process.env.INTEGRATION_SERVICE_SECRET;
const CRM_STUB_PORT = Number(process.env.CRM_STUB_PORT ?? 4012);
const prisma = new PrismaClient();
let createdStudentId: string | null = null;

interface ApiResponse<T> {
  data?: T;
  error?: { message?: string };
}

async function request<T>(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; expectStatus?: number } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body) headers["Content-Type"] = "application/json";

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  const expected = options.expectStatus ?? 200;

  if (response.status !== expected) {
    throw new Error(
      `${method} ${path} → ${response.status} (expected ${expected}): ${payload.error?.message ?? JSON.stringify(payload)}`,
    );
  }
  if (payload.data === undefined && expected < 300) {
    throw new Error(`${method} ${path} → missing data`);
  }
  return payload.data as T;
}

async function login(identifier: string, password: string) {
  return (await request<{ token: string }>("POST", "/auth/login", {
    body: { phone: identifier, password, profile: "staff" },
  })).token;
}

async function integrationRequest<T>(path: string, body: unknown): Promise<T> {
  if (!INTEGRATION_SECRET) throw new Error("INTEGRATION_SERVICE_SECRET is required");
  const response = await fetch(`${BASE_URL}/api/integration/v1${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${INTEGRATION_SECRET}`,
      "X-Integration-System": "crm",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  if (!response.ok || payload.data === undefined) {
    throw new Error(`CRM projection ${path} → ${response.status}: ${payload.error?.message ?? JSON.stringify(payload)}`);
  }
  return payload.data;
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function enrollStudentInActiveEpoch(studentId: string, suffix: number) {
  const epoch = await prisma.economicEpoch.findFirst({
    where: { status: EconomicEpochStatus.active },
  });
  if (!epoch) return;

  await prisma.$transaction(async (tx) => {
    await tx.economicEpochParticipant.upsert({
      where: { epochId_studentId: { epochId: epoch.id, studentId } },
      create: {
        epochId: epoch.id,
        studentId,
        openingPoints: epoch.openingPoints,
        openingWeeklyXp: epoch.openingWeeklyXp,
        openingCoins: epoch.openingCoins,
        openingLevel: 1,
        legacyPointsSnapshot: 0,
        legacyWeeklyXpSnapshot: 0,
        legacyCoinsSnapshot: 0,
        sourceKey: `e2e:online-lessons:${suffix}:epoch:${studentId}`,
        activatedAt: new Date(),
      },
      update: {},
    });
    await tx.studentCoinBalance.upsert({
      where: { studentId },
      create: { studentId, balance: epoch.openingCoins, economicEpochId: epoch.id },
      update: { balance: epoch.openingCoins, economicEpochId: epoch.id },
    });
  });
}

async function cleanupFixtures() {
  assertLocalE2eDatabase();
  if (createdStudentId) {
    await prisma.user.deleteMany({ where: { id: createdStudentId } });
  }
}

function startCrmStub() {
  const server = createServer((req, res) => {
    const url = req.url ?? "";
    res.setHeader("Content-Type", "application/json");

    if (req.method === "POST" && url === "/api/integration/v1/users/sync-from-app") {
      res.end(JSON.stringify({
        success: true,
        data: {
          status: "linked",
          crmStudentId: `CRM-E2E-${Date.now()}`,
          appUserId: "e2e-app-user",
          created: true,
        },
      }));
      return;
    }

    if (req.method === "POST" && url === "/api/integration/v1/bookings/online-lesson") {
      res.end(JSON.stringify({
        success: true,
        data: {
          crmBookingId: `CRM-BOOKING-${Date.now()}`,
          externalSourceId: "e2e-online-lesson",
          status: "new",
        },
      }));
      return;
    }

    const statusMatch = url.match(/^\/api\/integration\/v1\/bookings\/([^/]+)\/app-status$/);
    if (req.method === "POST" && statusMatch) {
      res.end(JSON.stringify({
        success: true,
        data: {
          crmBookingId: `CRM-BOOKING-${decodeURIComponent(statusMatch[1])}`,
          appStatus: "synced",
        },
      }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ success: false, error: "CRM E2E route not found" }));
  });

  return new Promise<ReturnType<typeof createServer>>((resolve) => {
    server.listen(CRM_STUB_PORT, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  assertLocalE2eDatabase();
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
  }

  const suffix = Date.now();
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);

  const studentCredentials = {
    firstName: "E2E",
    lastName: "Online",
    login: `e2e_ol_${String(suffix).slice(-8)}`,
    email: `e2e-ol-${suffix}@maestro.test`,
    phone: `+7702${String(suffix).slice(-7)}`,
    password: `student-${suffix}`,
  };
  const registration = await request<{
    token: string;
    user: { id: string; role: string; points?: number; coins?: number };
  }>("POST", "/auth/register", { body: studentCredentials, expectStatus: 201 });
  createdStudentId = registration.user.id;
  const studentToken = registration.token;
  assert(registration.user.role === "student", "registration must create a student");
  assert(registration.user.points === 0, "new student must have 0 points");
  assert(registration.user.coins === 0, "new student must have 0 coins");
  console.log("✓ Student registered with points=0 and coins=0");
  await enrollStudentInActiveEpoch(registration.user.id, suffix);

  const meBefore = await request<{ points?: number; coins?: number; permissions: string[] }>(
    "GET",
    "/auth/me",
    { token: studentToken },
  );
  assert(typeof meBefore.points === "number", "auth/me must return points");
  assert(typeof meBefore.coins === "number", "auth/me must return coins");
  assert(meBefore.permissions.includes("online_lessons.request"), "student must have online_lessons.request");
  console.log("✓ auth/me returns points and coins");

  await request(
    "POST",
    "/online-lessons/requests",
    {
      token: studentToken,
      body: {
        directionTitle: `E2E Гитара ${suffix}`,
        level: "начальный",
        preferredTime: "вечер будни",
        comment: "E2E online lesson request",
      },
      expectStatus: 409,
    },
  );
  console.log("✓ App creation is blocked because CRM is the source of truth");

  const [linkedTeacher, direction] = await Promise.all([
    prisma.user.findFirst({
      where: {
        crmTeacherId: { not: null },
        isActive: true,
        deletedAt: null,
        role: { slug: "teacher" },
      },
      select: { id: true, crmTeacherId: true },
    }),
    prisma.direction.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true },
    }),
  ]);
  assert(Boolean(linkedTeacher?.crmTeacherId), "online lesson flow requires a CRM-linked teacher");
  assert(Boolean(direction), "online lesson flow requires a projected direction");
  const requestItem = await prisma.onlineLessonRequest.create({
    data: {
      studentId: registration.user.id,
      directionId: direction!.id,
      directionTitle: direction!.title,
      level: "начальный",
      preferredTime: "CRM projection fixture",
      comment: "E2E CRM-managed online lesson",
      status: "new",
    },
    select: { id: true, status: true },
  });
  assert(requestItem.status === "new", "CRM projection fixture must start as new");

  const ownList = await request<{ id: string }[]>("GET", "/online-lessons/requests", { token: studentToken });
  assert(ownList.some((item) => item.id === requestItem.id), "student must see own request");
  await request("GET", "/online-lessons/requests/00000000-0000-4000-8000-000000000099", {
    token: studentToken,
    expectStatus: 404,
  });
  console.log("✓ Student sees only own requests");

  const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const scheduled = await integrationRequest<{ id: string; status: string; zoomUrl: string | null }>(
    `/online-lessons/${requestItem.id}/sync`,
    {
      action: "schedule",
      crmTeacherId: linkedTeacher!.crmTeacherId,
      scheduledAt: scheduledAt.toISOString(),
      meetingUrl: "https://zoom.us/j/e2e-test-meeting",
    },
  );
  assert(scheduled.status === "scheduled", "schedule must set status scheduled");
  assert(Boolean(scheduled.zoomUrl), "zoom url must be saved");
  console.log("✓ CRM scheduled the online lesson and supplied the meeting URL");

  const completed = await request<{
    id: string;
    status: string;
    lessonPoints: number;
    lessonCoins: number;
    assignment: { id: string } | null;
  }>(
    "POST",
    `/admin/online-lesson-requests/${requestItem.id}/complete`,
    {
      token: adminToken,
      body: {
        coveredTopics: "Аккорды Am, Dm",
        whatWorked: "Ритм держится стабильно",
        whatToImprove: "Переходы между аккордами",
        completionComment: "E2E completion",
        lessonPoints: 0,
        lessonCoins: 0,
        createAssignment: true,
        assignment: {
          title: `E2E ДЗ ${suffix}`,
          description: "Запишите упражнение и отправьте ссылку",
          submissionFormat: "text",
          pointsReward: 0,
        },
      },
    },
  );
  assert(completed.status === "completed", "complete must set status completed");
  assert(completed.lessonPoints === 0, "manual lesson points must stay disabled");
  assert(completed.lessonCoins === 0, "manual lesson coins must stay disabled");
  assert(Boolean(completed.assignment?.id), "assignment must be created");
  console.log("✓ Admin completed lesson with policy rewards and homework");

  const meAfterLesson = await request<{ points: number; coins: number }>("GET", "/auth/me", {
    token: studentToken,
  });
  assert(meAfterLesson.points === meBefore.points, "lesson attendance must not add permanent points");
  assert(meAfterLesson.coins === meBefore.coins! + 50, "lesson attendance must add 50 Coins");
  console.log("✓ Attendance added weekly rewards without permanent points");

  const studentView = await request<{
    status: string;
    zoomUrl: string | null;
    assignment: { id: string; submissionFormat: string } | null;
  }>("GET", `/online-lessons/requests/${requestItem.id}`, { token: studentToken });
  assert(studentView.status === "completed", "student must see completed status");
  assert(Boolean(studentView.zoomUrl), "student must see zoom url");
  assert(studentView.assignment?.submissionFormat === "text", "student must see assignment");
  console.log("✓ Student sees completed lesson and homework");

  const submission = await request<{ id: string; status: string }>(
    "POST",
    `/online-lessons/requests/${requestItem.id}/submissions`,
    {
      token: studentToken,
      body: { comment: "E2E homework answer text" },
      expectStatus: 201,
    },
  );
  assert(submission.status === "submitted", "submission must be submitted");
  console.log("✓ Student submitted homework");

  const reviewed = await request<{ status: string; reviewPoints: number | null; reviewCoins: number }>(
    "PATCH",
    `/admin/online-lesson-submissions/${submission.id}/review`,
    {
      token: adminToken,
      body: {
        action: "approve",
        reviewComment: "Принято",
        reviewPoints: 0,
        reviewCoins: 0,
      },
    },
  );
  assert(reviewed.status === "approved", "review must approve submission");
  assert(reviewed.reviewPoints === 0, "manual homework points must stay disabled");
  assert(reviewed.reviewCoins === 0, "manual homework coins must stay disabled");
  console.log("✓ Admin reviewed homework under the V2 reward policy");

  const meFinal = await request<{ points: number; coins: number }>("GET", "/auth/me", {
    token: studentToken,
  });
  assert(meFinal.points === meAfterLesson.points, "homework review must not add permanent points");
  assert(meFinal.coins === meAfterLesson.coins, "homework review must not add manual coins");
  const league = await request<{ currentStudent: { xp: number } | null }>(
    "GET",
    "/students/me/weekly-league",
    { token: studentToken },
  );
  assert((league.currentStudent?.xp ?? 0) >= 35, "lesson and accepted homework must add weekly XP");
  console.log("✓ Final economy: 0 manual Points, +50 Coins and at least 35 weekly XP");

  const courses = await request<unknown[]>("GET", "/courses");
  assert(Array.isArray(courses), "courses endpoint must return a list");
  console.log("✓ Courses API still returns a valid list");

  console.log("\nONLINE LESSONS E2E PASSED");
  console.log(`Student: ${studentCredentials.email}`);
  console.log(`Request: ${requestItem.id}`);
}

async function run() {
  const crmStub = await startCrmStub();
  try {
    await main();
  } finally {
    try {
      await new Promise<void>((resolve, reject) => {
        crmStub.close((error) => error ? reject(error) : resolve());
      });
    } finally {
      await cleanupFixtures();
    }
  }
}

run()
  .catch((error) => {
    console.error("\nONLINE LESSONS E2E FAILED:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
