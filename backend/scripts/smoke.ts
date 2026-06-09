/**
 * Maestro backend smoke test — requires running API + seeded database.
 * Usage: npm run smoke
 */
import { SEED_IDS } from "../prisma/seed-achievements.js";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:4000";
const API = `${BASE_URL}/api/v1`;

const STUDENT = { email: "student@maestro.local", password: "student123" };
const ADMIN = { email: "admin@maestro.local", password: "admin123" };

interface ApiResponse<T> {
  data?: T;
  error?: { code: string; message: string };
}

async function request<T>(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok) {
    throw new Error(
      `${method} ${path} → ${res.status}: ${json.error?.message ?? JSON.stringify(json)}`,
    );
  }
  if (json.data === undefined) {
    throw new Error(`${method} ${path} → missing data field`);
  }
  return json.data;
}

async function login(email: string, password: string): Promise<string> {
  const data = await request<{ token: string }>("POST", "/auth/login", {
    body: { email, password },
  });
  if (!data.token) throw new Error("Login response missing token");
  return data.token;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function main() {
  console.log("Maestro smoke test");
  console.log(`Target: ${BASE_URL}\n`);

  // 1. Health
  const healthRes = await fetch(`${BASE_URL}/health`);
  const health = (await healthRes.json()) as { status: string; service: string };
  assert(healthRes.ok, "health status not ok");
  assert(health.status === "ok", "health.status !== ok");
  console.log("✓ GET /health");

  // 2. Student login
  const studentToken = await login(STUDENT.email, STUDENT.password);
  console.log("✓ POST /auth/login (student)");

  // 3. Dashboard
  const dashboard = await request<{
    points: number;
    progressPercent: number;
    nextAvailableLesson: { id: string; status: string } | null;
  }>("GET", "/students/me/dashboard", { token: studentToken });
  assert(dashboard.points >= 0, "dashboard.points invalid");
  console.log(`✓ GET /students/me/dashboard (points=${dashboard.points})`);

  const pointsBefore = dashboard.points;

  // 4. Progress
  const progress = await request<{ lessons: unknown[]; points: number }>(
    "GET",
    "/students/me/progress",
    { token: studentToken },
  );
  assert(Array.isArray(progress.lessons), "progress.lessons not array");
  console.log("✓ GET /students/me/progress");

  // 5. Courses
  const courses = await request<unknown[]>("GET", "/courses");
  assert(courses.length > 0, "no courses returned");
  console.log("✓ GET /courses");

  const course = await request<{ id: string }>("GET", `/courses/${SEED_IDS.course}`);
  assert(course.id === SEED_IDS.course, "course detail id mismatch");
  console.log("✓ GET /courses/:id");

  // Directions & news
  await request("GET", "/directions");
  console.log("✓ GET /directions");

  await request("GET", "/news");
  console.log("✓ GET /news");

  // Lesson detail
  await request("GET", `/lessons/${SEED_IDS.lessons.l3}`);
  console.log("✓ GET /lessons/:id");

  // 6. Start available lesson (lesson 3)
  const startResult = await request<{ status: string }>(
    "POST",
    `/lessons/${SEED_IDS.lessons.l3}/start`,
    { token: studentToken },
  );
  assert(startResult.status === "in_progress", "lesson 3 not in_progress after start");
  console.log("✓ POST /lessons/:lessonId/start");

  // 7. Submit homework for lesson 3
  const submission = await request<{ id: string; lessonProgress: string }>(
    "POST",
    `/homeworks/${SEED_IDS.homeworks.h3}/submissions`,
    {
      token: studentToken,
      body: {
        comment: "Smoke test submission",
        attachmentUrl: "https://example.com/smoke-test.mp4",
      },
    },
  );
  assert(submission.lessonProgress === "submitted", "lesson not submitted after homework");
  console.log("✓ POST /homeworks/:homeworkId/submissions");

  // 8. Admin login
  const adminToken = await login(ADMIN.email, ADMIN.password);
  console.log("✓ POST /auth/login (admin)");

  await request("GET", "/auth/me", { token: adminToken });
  console.log("✓ GET /auth/me (admin)");

  // 9. Approve submission
  const review = await request<{
    lessonStatus: string;
    pointsAwarded: boolean;
    submission: { status: string };
  }>("PATCH", `/homeworks/submissions/${submission.id}/review`, {
    token: adminToken,
    body: { action: "approve", reviewNote: "Smoke test approved" },
  });
  assert(review.lessonStatus === "completed", "lesson not completed after approve");
  assert(review.pointsAwarded === true, "points not awarded");
  console.log("✓ PATCH /homeworks/submissions/:id/review (approve)");

  // 10. Points increased
  const dashboardAfter = await request<{ points: number }>(
    "GET",
    "/students/me/dashboard",
    { token: studentToken },
  );
  assert(
    dashboardAfter.points > pointsBefore,
    `points did not increase (${pointsBefore} → ${dashboardAfter.points})`,
  );
  console.log(`✓ Points increased (${pointsBefore} → ${dashboardAfter.points})`);

  // 11. Next lesson unlocked (lesson 4)
  const progressAfter = await request<{
    lessons: { lessonId: string; status: string }[];
  }>("GET", `/students/me/progress?courseId=${SEED_IDS.course}`, {
    token: studentToken,
  });

  const lesson4 = progressAfter.lessons.find((l) => l.lessonId === SEED_IDS.lessons.l4);
  assert(lesson4?.status === "available", `lesson 4 not available (got ${lesson4?.status})`);
  console.log("✓ Next lesson unlocked (lesson 4 → available)");

  console.log("\nAll smoke checks passed.");
}

main().catch((err) => {
  console.error("\nSmoke test FAILED:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
