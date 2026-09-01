import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

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

async function openAdminNavigation(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    await page.getByRole("button", { name: "Открыть меню" }).click();
  }
  return page.getByRole("navigation", { name: "Основная навигация администратора" });
}

test("admin navigation contains the six workspace sections", async ({ page, request, context }) => {
  await installSession(context, await loginSession(request, "qa_admin", "staff"));
  await page.goto("/admin");

  const navigation = await openAdminNavigation(page);
  await expect(navigation.getByRole("link")).toHaveCount(6);
  await expect(navigation.getByRole("link", { name: "Обзор", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: /Учебный контроль/ })).toBeVisible();
  await expect(navigation.getByRole("link", { name: /Коммуникации/ })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Люди", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Журнал", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Статистика", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Направления", exact: true })).toHaveCount(0);
});

test("legacy deep links keep the correct workspace section active", async ({ page, request, context }) => {
  await installSession(context, await loginSession(request, "qa_admin", "staff"));

  const cases = [
    ["/admin/homework-review", "Учебный контроль"],
    ["/admin/news", "Коммуникации"],
    ["/admin/students", "Люди"],
    ["/admin/journal", "Журнал"],
    ["/admin/statistics", "Статистика"],
  ] as const;

  for (const [path, section] of cases) {
    await page.goto(path);
    const navigation = await openAdminNavigation(page);
    await expect(navigation.getByRole("link", { name: new RegExp(section) })).toHaveAttribute("aria-current", "page");
    if ((page.viewportSize()?.width ?? 1280) < 1024) {
      await page.getByRole("complementary").getByRole("button", { name: "Закрыть меню" }).click();
    }
  }
});

test("workspace hubs expose existing screens without duplicating them", async ({ page, request, context }) => {
  await installSession(context, await loginSession(request, "qa_admin", "staff"));
  await page.goto("/admin/learning");

  await expect(page.getByRole("heading", { name: "Учебный контроль", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Уроки Единое расписание занятий/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Проверка домашних заданий/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Направления/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Недельная лига/ })).toBeVisible();

  await page.goto("/admin/communications");
  if ((page.viewportSize()?.width ?? 1280) >= 768) {
    await expect(page.getByRole("heading", { name: "Коммуникации", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Диалоги/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Новости школы/ })).toBeVisible();
  } else {
    await expect(page.getByRole("complementary").getByPlaceholder("Поиск")).toBeVisible();
  }

  await page.goto("/admin/people");
  await expect(page.getByRole("heading", { name: "Люди", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Ученики и семьи/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Учётные записи и роли/ })).toBeVisible();
});

test("CRM directions are read-only and the workspace fits the phone", async ({ page, request, context }) => {
  const session = await loginSession(request, "qa_admin", "staff");
  await installSession(context, session);
  await page.goto("/admin/directions");

  await expect(page.getByText("Где изменить направления")).toBeVisible();
  await expect(page.getByText("Ожидает сверки")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Создать|Сохранить/ })).toHaveCount(0);

  const projection = await request.get("/api/v1/admin/directions?limit=100", {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  expect(projection.ok()).toBe(true);
  const projectedDirections = (await projection.json()).data as Array<{ crmDirectionId: string | null }>;
  expect(projectedDirections.length).toBeGreaterThan(0);
  expect(projectedDirections.every((direction) => Boolean(direction.crmDirectionId))).toBe(true);

  const rejected = await request.post("/api/v1/admin/directions", {
    headers: { Authorization: `Bearer ${session.token}` },
    data: { title: "Нельзя создать", slug: "must-not-create" },
  });
  expect(rejected.status()).toBe(409);
  expect((await rejected.json()).error?.code).toBe("CRM_DIRECTION_SOURCE_OF_TRUTH");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/learning");
  await expect(page.getByRole("heading", { name: "Учебный контроль", exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("teacher keeps the existing workspace and cannot open admin group hubs", async ({ page, request, context }) => {
  await installSession(context, await loginSession(request, "qa_teacher_1", "staff"));
  await page.goto("/admin");

  await expect(page.getByTestId("admin-workspace-navigation")).toHaveCount(0);
  await page.goto("/admin/learning");
  await expect(page).toHaveURL(/\/admin\/offline-lessons$/);
  await expect(page.getByRole("heading", { name: /Уроки в школе|Мои уроки|Офлайн-уроки/ })).toBeVisible();
});
