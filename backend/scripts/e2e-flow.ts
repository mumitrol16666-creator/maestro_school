/**
 * Full learning flow verification (API level).
 * Covers: admin CMS create → student see → unlock → materials → homework → review → points → unlock next.
 *
 * Usage: npm run e2e
 * Requires: running API + seeded DB (at least one direction from seed).
 */
const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:4000";
const API = `${BASE_URL}/api/v1`;

const STUDENT = { email: "student@maestro.local", password: "student123" };
const ADMIN = { email: "admin@maestro.local", password: "admin123" };

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

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const json = (await res.json().catch(() => ({}))) as ApiResponse<T>;
  const expected = options.expectStatus ?? 200;

  if (res.status !== expected) {
    throw new Error(
      `${method} ${path} → ${res.status} (expected ${expected}): ${json.error?.message ?? JSON.stringify(json)}`,
    );
  }
  if (json.data === undefined && expected < 300) {
    throw new Error(`${method} ${path} → missing data`);
  }
  return json.data as T;
}

async function login(email: string, password: string) {
  const data = await request<{ token: string }>("POST", "/auth/login", {
    body: { email, password },
  });
  return data.token;
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("Maestro E2E flow verification\n");

  const adminToken = await login(ADMIN.email, ADMIN.password);
  const studentToken = await login(STUDENT.email, STUDENT.password);
  console.log("✓ Auth (admin + student)");

  // Use existing direction from seed
  const directions = await request<{ id: string; slug: string }[]>("GET", "/directions");
  assert(directions.length > 0, "no published directions");
  const directionId = directions[0].id;

  // 1. Admin creates course
  const suffix = Date.now();
  const course = await request<{ id: string; title: string; isPublished: boolean }>(
    "POST",
    "/admin/courses",
    {
      token: adminToken,
      body: {
        directionId,
        title: `E2E Курс ${suffix}`,
        description: "Проверка полного цикла обучения",
        difficultyLevel: "beginner",
        isPublished: false,
      },
      expectStatus: 201,
    },
  );
  console.log(`✓ Admin creates course (${course.id})`);

  const module = await request<{ id: string }>("POST", "/admin/modules", {
    token: adminToken,
    body: { courseId: course.id, title: "Модуль 1", sortOrder: 1 },
    expectStatus: 201,
  });

  const lesson1 = await request<{ id: string; videoUrl: string | null }>("POST", "/admin/lessons", {
    token: adminToken,
    body: {
      moduleId: module.id,
      title: "Урок 1 E2E",
      description: "Первый урок",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      pointsReward: 50,
      sortOrder: 1,
      isPublished: false,
    },
    expectStatus: 201,
  });

  const lesson2 = await request<{ id: string }>("POST", "/admin/lessons", {
    token: adminToken,
    body: {
      moduleId: module.id,
      title: "Урок 2 E2E",
      description: "Второй урок",
      pointsReward: 75,
      sortOrder: 2,
      isPublished: false,
    },
    expectStatus: 201,
  });

  const material = await request<{ id: string; url: string; type: string }>(
    "POST",
    "/admin/materials",
    {
      token: adminToken,
      body: {
        lessonId: lesson1.id,
        type: "pdf",
        title: "PDF памятка E2E",
        url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        sortOrder: 1,
      },
      expectStatus: 201,
    },
  );

  const homework = await request<{ id: string }>("POST", "/admin/homeworks", {
    token: adminToken,
    body: { lessonId: lesson1.id, description: "Запишите видео с упражнением" },
    expectStatus: 201,
  });

  // Publish chain
  await request("POST", `/admin/lessons/${lesson1.id}/publish`, {
    token: adminToken,
    body: { isPublished: true },
  });
  await request("POST", `/admin/lessons/${lesson2.id}/publish`, {
    token: adminToken,
    body: { isPublished: true },
  });
  await request("POST", `/admin/courses/${course.id}/publish`, {
    token: adminToken,
    body: { isPublished: true },
  });
  console.log("✓ Admin publishes course, lessons, adds PDF + homework");

  // 2. Student sees course
  const studentCourses = await request<{ id: string; title: string }[]>("GET", "/courses", {
    token: studentToken,
  });
  assert(studentCourses.some((c) => c.id === course.id), "student does not see published course");
  console.log("✓ Student sees published course in catalog");

  // Auto-enroll via progress (same as opening /courses/:id in UI)
  const progressBefore = await request<{
    enrollments: { courseId: string }[];
    lessons: { lessonId: string; status: string }[];
    points: number;
  }>("GET", `/students/me/progress?courseId=${course.id}`, { token: studentToken });

  assert(
    progressBefore.enrollments.some((e) => e.courseId === course.id),
    "student not enrolled after progress fetch",
  );
  console.log("✓ Student auto-enrolled on course access");

  const l1 = progressBefore.lessons.find((l) => l.lessonId === lesson1.id);
  const l2 = progressBefore.lessons.find((l) => l.lessonId === lesson2.id);
  assert(l1?.status === "available", `lesson 1 should be available, got ${l1?.status}`);
  assert(l2?.status === "locked", `lesson 2 should be locked, got ${l2?.status}`);
  console.log("✓ Lesson unlock rules (L1 available, L2 locked)");

  // 3. Lesson detail — video + PDF in API
  const lessonDetail = await request<{
    videoUrl: string | null;
    materials: { id: string; type: string; url: string }[];
    homework: { id: string } | null;
  }>("GET", `/lessons/${lesson1.id}`, { token: studentToken });

  assert(!!lessonDetail.videoUrl, "videoUrl missing in lesson API");
  assert(lessonDetail.materials.some((m) => m.type === "pdf"), "PDF material missing");
  assert(lessonDetail.homework?.id === homework.id, "homework missing on lesson");
  console.log("✓ Lesson API returns videoUrl + PDF material + homework");
  console.log(`  ℹ Frontend video player: placeholder only (videoUrl=${lessonDetail.videoUrl})`);
  console.log(`  ℹ PDF opens via link: ${material.url}`);

  // 4. Start lesson + submit homework
  await request("POST", `/lessons/${lesson1.id}/start`, { token: studentToken });
  const submission = await request<{ id: string; lessonProgress: string }>(
    "POST",
    `/homeworks/${homework.id}/submissions`,
    {
      token: studentToken,
      body: {
        comment: "E2E submission",
        attachmentUrl: "https://example.com/e2e-hw.mp4",
      },
      expectStatus: 201,
    },
  );
  assert(submission.lessonProgress === "submitted", "lesson not submitted");
  console.log("✓ Student submits homework");

  const pointsBefore = progressBefore.points;

  // 5. Admin approves
  const review = await request<{
    lessonStatus: string;
    pointsAwarded: boolean;
  }>("PATCH", `/homeworks/submissions/${submission.id}/review`, {
    token: adminToken,
    body: { action: "approve", reviewNote: "E2E approved" },
  });
  assert(review.lessonStatus === "completed", "lesson not completed after approve");
  assert(review.pointsAwarded === true, "points not awarded");
  console.log("✓ Admin approves homework (API — no admin UI yet)");

  // 6. Points + next lesson
  const progressAfter = await request<{
    points: number;
    lessons: { lessonId: string; status: string }[];
  }>("GET", `/students/me/progress?courseId=${course.id}`, { token: studentToken });

  assert(progressAfter.points >= pointsBefore + 50, `points not increased (${pointsBefore} → ${progressAfter.points})`);

  const l1after = progressAfter.lessons.find((l) => l.lessonId === lesson1.id);
  const l2after = progressAfter.lessons.find((l) => l.lessonId === lesson2.id);
  assert(l1after?.status === "completed", `lesson 1 not completed (${l1after?.status})`);
  assert(l2after?.status === "available", `lesson 2 not unlocked (${l2after?.status})`);

  console.log(`✓ Points awarded (+50, total ${progressAfter.points})`);
  console.log("✓ Next lesson unlocked (lesson 2 → available)");

  console.log("\nAll E2E flow checks passed.");
}

main().catch((err) => {
  console.error("\nE2E FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
