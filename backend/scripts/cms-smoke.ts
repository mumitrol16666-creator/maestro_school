const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:4000";
const API = `${BASE_URL}/api/v1`;

async function request<T>(method: string, path: string, token?: string, body?: unknown, expected = 200): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json() as { data: T; error?: { message: string } };
  if (response.status !== expected) throw new Error(`${method} ${path}: expected ${expected}, got ${response.status}: ${json.error?.message}`);
  return json.data;
}

async function login(email: string, password: string) {
  return (await request<{ token: string }>("POST", "/auth/login", undefined, { email, password })).token;
}

async function main() {
  const suffix = Date.now();
  const admin = await login("admin@maestro.local", "admin123");
  const student = await login("student@maestro.local", "student123");

  await request("GET", "/admin/directions", student, undefined, 403);
  console.log("✓ Student receives 403");

  const direction = await request<{ id: string }>("POST", "/admin/directions", admin, {
    title: `Smoke Direction ${suffix}`, slug: `smoke-${suffix}`, description: "CMS smoke",
  }, 201);
  const course = await request<{ id: string }>("POST", "/admin/courses", admin, {
    directionId: direction.id, title: `Smoke Course ${suffix}`, description: "CMS smoke", difficultyLevel: "beginner",
  }, 201);
  const module = await request<{ id: string }>("POST", "/admin/modules", admin, {
    courseId: course.id, title: "Module 1", sortOrder: 1,
  }, 201);
  const lesson = await request<{ id: string }>("POST", "/admin/lessons", admin, {
    moduleId: module.id, title: "Lesson 1", description: "CMS smoke lesson", pointsReward: 10, sortOrder: 1, videoUrl: "https://youtu.be/example",
  }, 201);
  await request("POST", "/admin/materials", admin, {
    lessonId: lesson.id, title: "PDF", type: "pdf", url: "https://example.com/material.pdf", sortOrder: 1,
  }, 201);
  await request("POST", "/admin/homeworks", admin, { lessonId: lesson.id, description: "Practice lesson" }, 201);
  await request("POST", `/admin/lessons/${lesson.id}/publish`, admin, { isPublished: true });
  await request("POST", `/admin/directions/${direction.id}/publish`, admin, { isPublished: true });
  await request("POST", `/admin/courses/${course.id}/publish`, admin, { isPublished: true });
  await request("POST", "/admin/news", admin, { title: `Smoke News ${suffix}`, content: "**CMS** smoke", isPublished: true }, 201);

  const publicCourse = await request<{ id: string }>("GET", `/courses/${course.id}`, student);
  if (publicCourse.id !== course.id) throw new Error("Published course is not visible in student catalog");
  console.log("✓ Full CMS content path and student visibility");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
