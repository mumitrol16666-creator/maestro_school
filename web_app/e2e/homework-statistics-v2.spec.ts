import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

const PASSWORD = "QaMaestro2026!";

async function loginSession(
  request: APIRequestContext,
  login: string,
  profile: "student" | "parent" | "staff",
) {
  const response = await request.post("/api/v1/auth/login", {
    data: { phone: login, password: PASSWORD, profile },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()).data as { token: string; user: unknown };
}

async function installSession(context: BrowserContext, session: { token: string; user: unknown }) {
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, session);
}

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test("admin sees exact V2 homework statistics and can open a student", async ({ page, request, context }) => {
  await installSession(context, await loginSession(request, "qa_admin", "staff"));
  await page.goto("/admin/statistics/homework");

  await expect(page.getByRole("heading", { name: "Статистика", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Домашние задания/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(/назначенные в выбранном месяце/i)).toBeVisible();
  await expect(page.getByText("Казыбаев Камбар")).toBeVisible();

  await page.getByRole("button", { name: /Казыбаев Камбар/ }).click();
  await expect(page.getByText("С первой проверки", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("teacher roster uses the same homework statuses", async ({ page, request, context }) => {
  await installSession(context, await loginSession(request, "qa_teacher_1", "staff"));
  await page.goto("/admin/my-students");

  await expect(page.getByRole("heading", { name: "Что происходит с ДЗ" })).toBeVisible();
  await expect(page.getByText("Казыбаев Камбар")).toBeVisible();
  await expect(page.getByText("Освоено ДЗ").first()).toBeVisible();
  await expect(page.getByText(/Ждут проверки:/).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("student sees only a compact personal result", async ({ page, request, context }) => {
  await installSession(context, await loginSession(request, "qa_student_1", "student"));
  await page.goto("/learning");

  await expect(page.getByRole("heading", { name: "Ваш результат" })).toBeVisible();
  await expect(page.getByRole("link", { name: /История ДЗ/ })).toBeVisible();
  await expect(page.getByText("Ждёт проверки")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("admin homework statistics fit 320px", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 320, height: 900 });

  await installSession(context, await loginSession(request, "qa_admin", "staff"));
  await page.goto("/admin/statistics/homework");
  await expect(page.getByRole("heading", { name: "Результаты ДЗ" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("homework statistics stay inside the allowed role scope", async ({ request }) => {
  const [student, teacher, parent] = await Promise.all([
    loginSession(request, "qa_student_1", "student"),
    loginSession(request, "qa_teacher_1", "staff"),
    loginSession(request, "qa_parent_1", "parent"),
  ]);

  const studentToAdmin = await request.get("/api/v1/admin/homework-statistics?month=2026-08", {
    headers: { Authorization: `Bearer ${student.token}` },
  });
  const teacherToAdmin = await request.get("/api/v1/admin/homework-statistics?month=2026-08", {
    headers: { Authorization: `Bearer ${teacher.token}` },
  });
  const parentToStudent = await request.get("/api/v1/students/me/homework-statistics?month=2026-08", {
    headers: { Authorization: `Bearer ${parent.token}` },
  });

  expect(studentToAdmin.status()).toBe(403);
  expect(teacherToAdmin.status()).toBe(403);
  expect(parentToStudent.status()).toBe(403);
});
