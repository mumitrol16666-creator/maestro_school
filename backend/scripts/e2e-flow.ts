/**
 * Full production-like learning flow verification.
 * Requires a running API, production seed and ADMIN_EMAIL / ADMIN_PASSWORD.
 */
export {};

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:4000";
const API = `${BASE_URL}/api/v1`;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

interface ApiResponse<T> {
  data?: T;
  error?: { code?: string; message?: string };
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
    throw new Error(`${method} ${path} → ${response.status} (expected ${expected}): ${payload.error?.message ?? JSON.stringify(payload)}`);
  }
  if (payload.data === undefined && expected < 300) {
    throw new Error(`${method} ${path} → missing data`);
  }
  return payload.data as T;
}

async function login(email: string, password: string) {
  return (await request<{ token: string }>("POST", "/auth/login", { body: { phone: email, password } })).token;
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function requestError(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; expectStatus: number },
) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body) headers["Content-Type"] = "application/json";
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as ApiResponse<never>;
  assert(
    response.status === options.expectStatus,
    `${method} ${path} → ${response.status} (expected ${options.expectStatus})`,
  );
  assert(Boolean(payload.error?.code), `${method} ${path} → missing error code`);
  return payload.error!;
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
  }

  const suffix = Date.now();
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const studentCredentials = {
    firstName: "E2E",
    lastName: "Student",
    login: `e2e_${suffix}`,
    email: `e2e-${suffix}@maestro.test`,
    phone: `+7700${String(suffix).slice(-7)}`,
    password: `student-${suffix}`,
  };
  const registration = await request<{ token: string; user: { role: string; email: string } }>(
    "POST",
    "/auth/register",
    { body: studentCredentials, expectStatus: 201 },
  );
  assert(registration.user.role === "student", "registration must always create a student");
  await request("POST", "/auth/register", { body: studentCredentials, expectStatus: 409 });
  const studentToken = registration.token;
  console.log("✓ Registration, duplicate email protection and student role");

  const direction = await request<{ id: string }>("POST", "/admin/directions", {
    token: adminToken,
    body: { title: `E2E Direction ${suffix}`, slug: `e2e-${suffix}`, description: "E2E direction" },
    expectStatus: 201,
  });
  await request("POST", `/admin/directions/${direction.id}/publish`, {
    token: adminToken,
    body: { isPublished: true },
  });

  const course = await request<{ id: string }>("POST", "/admin/courses", {
    token: adminToken,
    body: {
      directionId: direction.id,
      title: `E2E Course ${suffix}`,
      description: "**Production-like** course",
      difficultyLevel: "beginner",
      completionCoinsReward: 25,
      isPublished: false,
    },
    expectStatus: 201,
  });
  const module = await request<{ id: string }>("POST", "/admin/modules", {
    token: adminToken,
    body: { courseId: course.id, title: "Module 1", sortOrder: 1 },
    expectStatus: 201,
  });
  const lesson1 = await request<{ id: string }>("POST", "/admin/lessons", {
    token: adminToken,
    body: {
      moduleId: module.id,
      title: "Lesson 1",
      description: "**First** lesson",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      pointsReward: 50,
      sortOrder: 1,
      isPublished: false,
    },
    expectStatus: 201,
  });
  const lesson2 = await request<{ id: string }>("POST", "/admin/lessons", {
    token: adminToken,
    body: { moduleId: module.id, title: "Lesson 2", pointsReward: 75, sortOrder: 2, isPublished: false },
    expectStatus: 201,
  });
  await request("POST", "/admin/materials", {
    token: adminToken,
    body: { lessonId: lesson1.id, type: "pdf", title: "PDF", url: "https://example.com/e2e.pdf", sortOrder: 1 },
    expectStatus: 201,
  });
  const homework = await request<{ id: string }>("POST", "/admin/homeworks", {
    token: adminToken,
    body: { lessonId: lesson1.id, description: "**Record** the exercise" },
    expectStatus: 201,
  });

  await request("POST", `/courses/${course.id}/enroll`, { token: studentToken, expectStatus: 404 });
  await request("POST", `/admin/lessons/${lesson1.id}/publish`, { token: adminToken, body: { isPublished: true } });
  await request("POST", `/admin/lessons/${lesson2.id}/publish`, { token: adminToken, body: { isPublished: true } });
  await request("POST", `/admin/courses/${course.id}/publish`, { token: adminToken, body: { isPublished: true } });
  const secondaryCourse = await request<{ id: string }>("POST", "/admin/courses", {
    token: adminToken,
    body: {
      directionId: direction.id,
      title: `E2E Secondary Course ${suffix}`,
      description: "Used to verify current-course selection",
      difficultyLevel: "beginner",
      completionCoinsReward: 0,
      isPublished: false,
    },
    expectStatus: 201,
  });
  const secondaryModule = await request<{ id: string }>("POST", "/admin/modules", {
    token: adminToken,
    body: { courseId: secondaryCourse.id, title: "Test module", sortOrder: 1 },
    expectStatus: 201,
  });
  const testLesson = await request<{ id: string }>("POST", "/admin/lessons", {
    token: adminToken,
    body: {
      moduleId: secondaryModule.id,
      title: "Protected test lesson",
      pointsReward: 30,
      sortOrder: 1,
      isPublished: false,
    },
    expectStatus: 201,
  });
  await request("POST", "/admin/homeworks", {
    token: adminToken,
    body: {
      lessonId: testLesson.id,
      description: "Protected test homework",
      type: "test",
      passingScore: 70,
      testQuestions: [{
        id: "question-1",
        prompt: "Choose the correct answer",
        options: [
          { id: "option-a", text: "Correct" },
          { id: "option-b", text: "Incorrect" },
        ],
        correctOptionId: "option-a",
      }],
    },
    expectStatus: 201,
  });
  await request("POST", `/admin/lessons/${testLesson.id}/publish`, {
    token: adminToken,
    body: { isPublished: true },
  });
  await request("POST", `/admin/courses/${secondaryCourse.id}/publish`, {
    token: adminToken,
    body: { isPublished: true },
  });
  console.log("✓ CMS creates and publishes a real course; unpublished enrollment is blocked");

  const preview = await request<{
    enrollmentStatus: string | null;
    completionCoinsReward: number;
    modules: { lessons: Record<string, unknown>[] }[];
  }>("GET", `/courses/${course.id}`, { token: studentToken });
  assert(preview.enrollmentStatus === null, "course preview must not enroll student");
  assert(preview.completionCoinsReward === 25, "course detail must return completion Coins reward");
  assert(!("videoUrl" in preview.modules[0].lessons[0]), "course preview must not expose videoUrl");
  await request("GET", `/students/me/progress?courseId=${course.id}`, { token: studentToken, expectStatus: 403 });
  console.log("✓ Course preview does not create enrollment or expose protected content");

  const enrollment1 = await request<{ id: string; status: string }>("POST", `/courses/${course.id}/enroll`, { token: studentToken });
  const enrollment2 = await request<{ id: string; status: string }>("POST", `/courses/${course.id}/enroll`, { token: studentToken });
  assert(enrollment1.id === enrollment2.id, "repeated enrollment must be idempotent");
  await request("POST", `/courses/${secondaryCourse.id}/enroll`, { token: studentToken });

  const publicCourses = await request<{ id: string; completionCoinsReward: number }[]>("GET", "/courses", {
    token: studentToken,
  });
  assert(
    publicCourses.find((item) => item.id === course.id)?.completionCoinsReward === 25,
    "course list must return completion Coins reward",
  );

  const dashboardBeforeActivity = await request<{ currentCourse: { id: string } | null }>(
    "GET",
    "/students/me/dashboard",
    { token: studentToken },
  );
  assert(
    dashboardBeforeActivity.currentCourse?.id === secondaryCourse.id,
    "without lesson activity dashboard must select the latest enrollment",
  );

  const progressBefore = await request<{
    points: number;
    lessons: { lessonId: string; status: string }[];
  }>("GET", `/students/me/progress?courseId=${course.id}`, { token: studentToken });
  assert(progressBefore.lessons.find((item) => item.lessonId === lesson1.id)?.status === "available", "first lesson must be available");
  assert(progressBefore.lessons.find((item) => item.lessonId === lesson2.id)?.status === "locked", "second lesson must be locked");
  await request("GET", `/lessons/${lesson2.id}`, { token: studentToken, expectStatus: 403 });
  console.log("✓ Explicit idempotent enrollment and locked lesson protection");

  const lessonBeforeStart = await request<{
    videoUrl: string | null;
    materials: { type: string }[];
    homework: { id: string } | null;
  }>("GET", `/lessons/${lesson1.id}`, { token: studentToken });
  assert(lessonBeforeStart.videoUrl === null, "available lesson must keep video closed until start");
  assert(lessonBeforeStart.materials.length === 0, "available lesson must keep materials closed until start");
  assert(lessonBeforeStart.homework === null, "available lesson must keep homework closed until start");

  await request("POST", `/lessons/${lesson1.id}/start`, { token: studentToken });
  const lesson = await request<{
    videoUrl: string | null;
    materials: { type: string }[];
    homework: { id: string } | null;
  }>("GET", `/lessons/${lesson1.id}`, { token: studentToken });
  assert(Boolean(lesson.videoUrl), "started lesson must expose video");
  assert(lesson.materials.some((item) => item.type === "pdf"), "lesson PDF missing");
  assert(lesson.homework?.id === homework.id, "lesson homework missing");
  const homeworkCompletionError = await requestError("POST", `/lessons/${lesson1.id}/complete`, {
    token: studentToken,
    expectStatus: 409,
  });
  assert(homeworkCompletionError.code === "LESSON_REQUIRES_HOMEWORK", "homework lesson must reject self-completion");
  const dashboardAfterStart = await request<{ currentCourse: { id: string } | null }>(
    "GET",
    "/students/me/dashboard",
    { token: studentToken },
  );
  assert(
    dashboardAfterStart.currentCourse?.id === course.id,
    "dashboard must select the course with the latest explicit lesson activity",
  );
  const submission = await request<{ id: string; lessonProgress: string }>(
    "POST",
    `/homeworks/${homework.id}/submissions`,
    {
      token: studentToken,
      body: { comment: "E2E submission", attachmentUrl: "https://example.com/e2e.mp4", attachmentType: "video" },
      expectStatus: 201,
    },
  );
  assert(submission.lessonProgress === "submitted", "homework must move lesson to submitted");

  const review = await request<{ lessonStatus: string; pointsAwarded: boolean }>(
    "PATCH",
    `/homeworks/submissions/${submission.id}/review`,
    { token: adminToken, body: { action: "approve", reviewComment: "Approved" } },
  );
  assert(review.lessonStatus === "completed" && review.pointsAwarded, "review must complete lesson and award points");

  const progressAfter = await request<{ points: number; lessons: { lessonId: string; status: string }[] }>(
    "GET",
    `/students/me/progress?courseId=${course.id}`,
    { token: studentToken },
  );
  assert(progressAfter.points >= progressBefore.points + 50, "points were not awarded");
  assert(progressAfter.lessons.find((item) => item.lessonId === lesson2.id)?.status === "available", "next lesson was not unlocked");
  console.log("✓ Registration → enrollment → lesson → homework → review → points → next lesson");

  const availableCompletionError = await requestError("POST", `/lessons/${lesson2.id}/complete`, {
    token: studentToken,
    expectStatus: 409,
  });
  assert(availableCompletionError.code === "INVALID_LESSON_TRANSITION", "available lesson must not self-complete");

  const profileBeforeFinalLesson = await request<{ points: number; coins: number }>("GET", "/auth/me", {
    token: studentToken,
  });
  await request("POST", `/lessons/${lesson2.id}/start`, { token: studentToken });
  const completion = await request<{
    status: string;
    alreadyCompleted: boolean;
    courseCompleted: boolean;
  }>("POST", `/lessons/${lesson2.id}/complete`, { token: studentToken });
  assert(completion.status === "completed", "lesson without homework must become completed");
  assert(completion.alreadyCompleted === false, "first completion must not be marked idempotent");
  assert(completion.courseCompleted === true, "final lesson must complete the course");

  const repeatedCompletion = await request<{
    status: string;
    alreadyCompleted: boolean;
  }>("POST", `/lessons/${lesson2.id}/complete`, { token: studentToken });
  assert(repeatedCompletion.alreadyCompleted === true, "repeated completion must be idempotent");

  const profileAfterFinalLesson = await request<{ points: number; coins: number }>("GET", "/auth/me", {
    token: studentToken,
  });
  assert(
    profileAfterFinalLesson.points === profileBeforeFinalLesson.points + 75,
    "lesson without homework must award points exactly once",
  );
  assert(
    profileAfterFinalLesson.coins === profileBeforeFinalLesson.coins + 25,
    "course completion must award Coins exactly once",
  );

  const dashboardAfterCompletion = await request<{ currentCourse: { id: string } | null }>(
    "GET",
    "/students/me/dashboard",
    { token: studentToken },
  );
  assert(
    dashboardAfterCompletion.currentCourse?.id === secondaryCourse.id,
    "completed course must not remain the current active course",
  );

  await request("POST", `/lessons/${testLesson.id}/start`, { token: studentToken });
  const testCompletionError = await requestError("POST", `/lessons/${testLesson.id}/complete`, {
    token: studentToken,
    expectStatus: 409,
  });
  assert(testCompletionError.code === "LESSON_REQUIRES_HOMEWORK", "test lesson must reject self-completion");
  console.log("✓ No-homework completion → points once → course Coins once → current-course fallback");
}

main().catch((error) => {
  console.error("\nE2E FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
