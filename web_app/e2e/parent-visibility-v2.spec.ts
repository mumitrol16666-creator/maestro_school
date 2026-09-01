import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

const PASSWORD = "QaMaestro2026!";
const STUDENT_ID = "10000000-0000-4000-8000-000000000021";

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

async function dismissStudentEntryAlerts(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 3_000 }).catch(() => undefined);
  if (await dialog.isVisible()) {
    await dialog.getByRole("button", { name: "Закрыть" }).click();
  }
}

test("parent sees the compact CRM-backed family skeleton", async ({ page, request, context }) => {
  await installSession(context, await loginSession(request, "qa_parent_1", "parent"));
  await page.goto("/family");

  await expect(page.getByRole("heading", { name: "Главное об обучении" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Казыбаев Камбар" })).toBeVisible();
  await expect(page.getByText("Баланс", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Расписание" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Учебный план" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Достижения" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Новости школы" })).toBeVisible();
  await expect(page.getByText("Домашняя работа")).toHaveCount(0);
  await expect(page.getByText("Итоги уроков")).toHaveCount(0);
});

test("student can request but cannot directly apply parent visibility", async ({ page, request, context }) => {
  const session = await loginSession(request, "qa_student_1", "student");
  await installSession(context, session);
  await page.goto("/settings");
  await dismissStudentEntryAlerts(page);
  await page.getByRole("button", { name: "Данные", exact: true }).click();

  const card = page.getByTestId("parent-visibility-student");
  await expect(card.getByRole("heading", { name: "Что видят родители" })).toBeVisible();
  await expect(card.getByRole("checkbox")).toHaveCount(4);
  await expect(card.getByRole("button", { name: "Изменений нет" })).toBeDisabled();
  await card.getByRole("checkbox", { name: "Баланс" }).uncheck();
  await expect(card.getByRole("button", { name: "Отправить запрос" })).toBeVisible();

  const forbidden = await request.patch(`/api/v1/admin/students/${STUDENT_ID}/parent-visibility`, {
    headers: { Authorization: `Bearer ${session.token}` },
    data: {
      visibility: { showSchedule: false, showBalance: false, showPlanProgress: false, showAchievements: false },
      reason: "Недопустимое прямое изменение",
    },
  });
  expect(forbidden.status()).toBe(403);
});

test("admin sees one shared policy and parent news audiences", async ({ page, request, context }) => {
  await installSession(context, await loginSession(request, "qa_admin", "staff"));
  await page.goto(`/admin/students/${STUDENT_ID}`);

  const access = page.getByTestId("parent-visibility-admin");
  await expect(access.getByRole("heading", { name: "Что видно семье" })).toBeVisible();
  await expect(access.getByText("Одна настройка для всех родителей", { exact: false })).toBeVisible();
  await expect(access.getByRole("checkbox")).toHaveCount(4);

  await page.goto("/admin/news");
  await expect(page.getByRole("checkbox", { name: "Ученикам" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Родителям" })).not.toBeChecked();
});

test("family skeleton has no horizontal overflow on a 390px phone", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installSession(context, await loginSession(request, "qa_parent_1", "parent"));
  await page.goto("/family");

  await expect(page.getByRole("heading", { name: "Главное об обучении" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Расписание" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
