import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

const PASSWORD = "QaMaestro2026!";

async function signInAsStudent(request: APIRequestContext, context: BrowserContext) {
  const response = await request.post("/api/v1/auth/login", {
    data: { phone: "qa_student_1", password: PASSWORD, profile: "student" },
  });
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, payload.data);
}

test.beforeEach(async ({ request, context }) => {
  await signInAsStudent(request, context);
});

test("student entry stays uninterrupted and notifications open on demand", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard");

  await expect(page.getByRole("dialog", { name: "Пока вас не было" })).toHaveCount(0);
  await page.getByRole("button", { name: /Уведомления/ }).click();

  const dialog = page.getByRole("dialog", { name: /новых|Всё просмотрено/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("time").first()).toBeVisible();
  await expect(dialog.getByText(/Открыть|Проверить|Посмотреть|Отметить/).first()).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /Уведомления/ })).toBeFocused();
});

test("notification center is a bottom sheet without horizontal overflow on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Уведомления/ }).click();

  const dialog = page.getByRole("dialog", { name: /новых|Всё просмотрено/ });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs((box!.y + box!.height) - 800)).toBeLessThanOrEqual(2);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(361);

  const overflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ));
  expect(overflow).toBeLessThanOrEqual(1);
});

test("notification action opens the exact homework screen", async ({ page }) => {
  const target = "/school-lessons?tab=homework&lesson=QA-CLASS-IND-PREVIOUS";
  await page.route(/\/api\/v1\/students\/me\/notifications\?limit=\d+$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [{
          id: "qa-homework-notification",
          type: "homework_assigned",
          title: "Новое домашнее задание",
          body: "Преподаватель добавил задание к уроку.",
          url: target,
          readAt: null,
          createdAt: new Date().toISOString(),
        }],
      }),
    });
  });
  await page.route("**/api/v1/students/me/notifications/qa-homework-notification/read", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {} }) });
  });

  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Уведомления/ }).click();
  const notification = page.getByRole("button", {
    name: /Преподаватель добавил задание к уроку/,
  });
  await expect(notification).toContainText("Открыть задание");
  await notification.click();

  await expect(page).toHaveURL(new RegExp("/school-lessons\\?tab=homework&lesson=QA-CLASS-IND-PREVIOUS$"));
  await expect(page.getByRole("dialog", { name: /новых|Всё просмотрено/ })).toHaveCount(0);
});
