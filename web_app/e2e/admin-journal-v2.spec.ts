import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

const PASSWORD = "QaMaestro2026!";

async function loginSession(request: APIRequestContext, login: string) {
  const response = await request.post("/api/v1/auth/login", {
    data: { phone: login, password: PASSWORD, profile: "staff" },
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

test("admin journal is prioritized, filterable and keeps an immutable actor history", async ({ page, request, context }, testInfo) => {
  const session = await loginSession(request, "qa_admin");
  await installSession(context, session);
  await page.goto("/admin/journal");

  await expect(page.getByRole("heading", { name: "Журнал" })).toBeVisible();
  const entries = page.getByTestId("journal-entry");
  await expect(entries.first()).toBeVisible();
  expect(await entries.count()).toBeGreaterThanOrEqual(4);
  await expect(entries.first()).toContainText("Не удалось обновить посещаемость");
  await expect(page.getByText("Ответственный")).toHaveCount(0);
  await expect(page.getByText("assignee", { exact: false })).toHaveCount(0);

  await page.getByLabel("Тип записи").selectOption("parent_access");
  await expect(entries.first()).toBeVisible();
  await expect(entries.filter({ hasNotText: "Доступ родителя" })).toHaveCount(0);
  expect(await entries.count()).toBeGreaterThan(0);
  await expect(entries.first()).toContainText("Родительский доступ выдан");
  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  await expect(entries.first()).toBeVisible();
  expect(await entries.count()).toBeGreaterThanOrEqual(4);

  const critical = entries.filter({ hasText: "Не удалось обновить посещаемость" });
  await critical.getByRole("button", { expanded: false }).click();
  await expect(critical.getByTestId("journal-entry-details")).toContainText("Система");
  const status = critical.getByLabel("Статус");
  if (await status.inputValue() !== "resolved") {
    await status.selectOption("resolved");
    const resolution = `Проверили конфликт и подтвердили актуальную отметку в CRM · ${testInfo.project.name} · ${Date.now()}`;
    await critical.getByLabel("Решение или причина").fill(resolution);
    await critical.getByRole("button", { name: "Сохранить статус" }).click();
  }
  await expect(critical).toContainText("Решённые");

  await expect(critical.getByTestId("journal-entry-details")).toContainText("Администратор Анна");
  await expect(critical.getByTestId("journal-entry-details")).toContainText("Проверили конфликт");
});

test("teacher cannot read the admin journal by direct API or URL", async ({ page, request, context }) => {
  const session = await loginSession(request, "qa_teacher_1");
  const forbidden = await request.get("/api/v1/admin/journal", {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  expect(forbidden.status()).toBe(403);

  await installSession(context, session);
  await page.goto("/admin/journal");
  await expect(page.getByRole("heading", { name: "Не удалось загрузить данные" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Журнал" })).toHaveCount(0);
});

test("admin journal fits a 390px phone without horizontal overflow", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installSession(context, await loginSession(request, "qa_admin"));
  await page.goto("/admin/journal");

  await expect(page.getByRole("heading", { name: "Журнал" })).toBeVisible();
  await expect(page.getByTestId("journal-entry").first()).toBeVisible();
  const overflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ));
  expect(overflow).toBeLessThanOrEqual(1);
  const firstBox = await page.getByTestId("journal-entry").first().boundingBox();
  expect(firstBox).not.toBeNull();
  expect((firstBox?.x ?? 0) + (firstBox?.width ?? 0)).toBeLessThanOrEqual(391);
});
