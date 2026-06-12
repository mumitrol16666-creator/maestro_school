/**
 * Full online-lessons flow verification.
 * Requires a running API, production seed and ADMIN_EMAIL / ADMIN_PASSWORD.
 *
 * Usage:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run e2e:online-lessons
 *   SMOKE_BASE_URL=https://maestro-school.duckdns.org ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run e2e:online-lessons
 */
export {};

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:4000";
const API = `${BASE_URL}/api/v1`;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

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

async function login(email: string, password: string) {
  return (await request<{ token: string }>("POST", "/auth/login", { body: { email, password } })).token;
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
  }

  const suffix = Date.now();
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);

  const studentCredentials = {
    firstName: "E2E",
    lastName: "Online",
    email: `e2e-ol-${suffix}@maestro.test`,
    password: `student-${suffix}`,
  };
  const registration = await request<{
    token: string;
    user: { role: string; points?: number; coins?: number };
  }>("POST", "/auth/register", { body: studentCredentials, expectStatus: 201 });
  const studentToken = registration.token;
  assert(registration.user.role === "student", "registration must create a student");
  assert(registration.user.points === 0, "new student must have 0 points");
  assert(registration.user.coins === 0, "new student must have 0 coins");
  console.log("✓ Student registered with points=0 and coins=0");

  const meBefore = await request<{ points?: number; coins?: number; permissions: string[] }>(
    "GET",
    "/auth/me",
    { token: studentToken },
  );
  assert(typeof meBefore.points === "number", "auth/me must return points");
  assert(typeof meBefore.coins === "number", "auth/me must return coins");
  assert(meBefore.permissions.includes("online_lessons.request"), "student must have online_lessons.request");
  console.log("✓ auth/me returns points and coins");

  const requestItem = await request<{ id: string; status: string }>(
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
      expectStatus: 201,
    },
  );
  assert(requestItem.status === "new", "new request must have status new");
  console.log("✓ Student created online lesson request");

  const ownList = await request<{ id: string }[]>("GET", "/online-lessons/requests", { token: studentToken });
  assert(ownList.some((item) => item.id === requestItem.id), "student must see own request");
  await request("GET", "/online-lessons/requests/00000000-0000-4000-8000-000000000099", {
    token: studentToken,
    expectStatus: 404,
  });
  console.log("✓ Student sees only own requests");

  const assigned = await request<{ id: string; status: string }>(
    "PATCH",
    `/admin/online-lesson-requests/${requestItem.id}/assign`,
    { token: adminToken },
  );
  assert(assigned.status === "assigned", "assign must set status assigned");
  console.log("✓ Admin assigned request");

  const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const scheduled = await request<{ id: string; status: string; zoomUrl: string | null }>(
    "PATCH",
    `/admin/online-lesson-requests/${requestItem.id}/schedule`,
    {
      token: adminToken,
      body: {
        scheduledAt: scheduledAt.toISOString(),
        zoomUrl: "https://zoom.us/j/e2e-test-meeting",
      },
    },
  );
  assert(scheduled.status === "scheduled", "schedule must set status scheduled");
  assert(Boolean(scheduled.zoomUrl), "zoom url must be saved");
  console.log("✓ Admin scheduled Zoom lesson");

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
        lessonPoints: 10,
        lessonCoins: 5,
        lessonCoinsReason: "Отличная работа на уроке",
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
  assert(completed.lessonPoints === 10, "lesson points must be saved");
  assert(completed.lessonCoins === 5, "lesson coins must be saved");
  assert(Boolean(completed.assignment?.id), "assignment must be created");
  console.log("✓ Admin completed lesson with points, coins and homework");

  const meAfterLesson = await request<{ points: number; coins: number }>("GET", "/auth/me", {
    token: studentToken,
  });
  assert(meAfterLesson.points >= meBefore.points! + 10, "points must increase after lesson");
  assert(meAfterLesson.coins >= meBefore.coins! + 5, "coins must increase after lesson");
  console.log("✓ Student balance updated after lesson completion");

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
        reviewPoints: 15,
        reviewCoins: 3,
        reviewCoinsReason: "Качественное выполнение ДЗ",
      },
    },
  );
  assert(reviewed.status === "approved", "review must approve submission");
  assert(reviewed.reviewPoints === 15, "review points must be saved");
  assert(reviewed.reviewCoins === 3, "review coins must be saved");
  console.log("✓ Admin reviewed homework with points and coins");

  const meFinal = await request<{ points: number; coins: number }>("GET", "/auth/me", {
    token: studentToken,
  });
  assert(meFinal.points >= meAfterLesson.points + 15, "points must increase after homework review");
  assert(meFinal.coins >= meAfterLesson.coins + 3, "coins must increase after homework review");
  console.log("✓ Final balances: points and coins both increased");

  const courses = await request<unknown[]>("GET", "/courses");
  assert(courses.length > 0, "existing courses must still be available");
  console.log("✓ Existing courses API still works");

  console.log("\nONLINE LESSONS E2E PASSED");
  console.log(`Student: ${studentCredentials.email}`);
  console.log(`Request: ${requestItem.id}`);
}

main().catch((error) => {
  console.error("\nONLINE LESSONS E2E FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
