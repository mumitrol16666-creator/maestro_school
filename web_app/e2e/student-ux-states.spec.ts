import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

/**
 * Document 20, package 3: placeholders while a screen loads (В-15), the app's own error and
 * «нет такой страницы» screens (В-17), the «Нет связи» strip, a session that survives a network
 * failure and the saved home younger than 12 hours (В-18), confirmations after a save (В-22).
 */
const PASSWORD = "QaMaestro2026!";
const HOUR = 60 * 60 * 1000;

type Session = { token: string; user: { id: string } };

async function studentSession(request: APIRequestContext): Promise<Session> {
  const login = await request.post("/api/v1/auth/login", { data: { phone: "qa_student_1", password: PASSWORD, profile: "student" } });
  expect(login.ok(), await login.text()).toBe(true);
  return (await login.json()).data as Session;
}

async function signIn(context: BrowserContext, session: Session) {
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, session);
}

async function homeAnswer(request: APIRequestContext, session: Session) {
  const response = await request.get("/api/v1/students/me/home", { headers: { Authorization: `Bearer ${session.token}` } });
  expect(response.ok()).toBe(true);
  return (await response.json()).data as unknown;
}

async function keepSavedHome(context: BrowserContext, session: Session, home: unknown, ageMs: number) {
  await context.addInitScript(({ userId, snapshot }) => {
    window.localStorage.setItem(`maestro_home_snapshot:${userId}`, JSON.stringify(snapshot));
  }, { userId: session.user.id, snapshot: { savedAt: Date.now() - ageMs, home } });
}

async function serverUnreachable(page: Page) {
  await page.route("**/api/v1/**", (route) => route.abort("internetdisconnected"));
}

test("an unknown address is the app's own Russian page with two ways out", async ({ page, request, context }) => {
  await page.goto("/net-takogo-adresa");
  await expect(page.getByRole("heading", { name: "Такой страницы нет" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Повторить" })).toBeVisible();
  await expect(page.getByRole("link", { name: "На главную" })).toHaveAttribute("href", "/login");
  await expect(page.getByText("This page could not be found")).toHaveCount(0);

  await signIn(context, await studentSession(request));
  await page.goto("/net-takogo-adresa");
  await expect(page.getByRole("heading", { name: "Такой страницы нет" })).toBeVisible();
  await expect(page.getByRole("link", { name: "На главную" })).toHaveAttribute("href", "/dashboard");
  // The student keeps the app around the page: the header with the notifications bell.
  await expect(page.locator("header")).toBeVisible();
});

test("a slow screen shows placeholders in place of the cards, not the dark scene", async ({ page, request, context }) => {
  await signIn(context, await studentSession(request));
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/v1/students/me/home", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/dashboard");
  await expect(page.getByTestId("screen-skeleton")).toBeVisible();
  await expect(page.locator(".maestro-loading-stage")).toHaveCount(0);
  release();
  await expect(page.getByTestId("dashboard-learning-summary")).toBeVisible();
  await expect(page.getByTestId("screen-skeleton")).toHaveCount(0);
});

test("a failed read shows the Russian error screen, never the server's English", async ({ page, request, context }) => {
  await signIn(context, await studentSession(request));
  let fail = true;
  await page.route("**/api/v1/students/me/home", (route) => (fail
    ? route.fulfill({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: "Internal server error" } } })
    : route.continue()));
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Что-то пошло не так" })).toBeVisible();
  await expect(page.getByText("Internal server error")).toHaveCount(0);
  // On the home screen itself «На главную» would lead nowhere, so only «Повторить» is offered.
  await expect(page.getByTestId("app-error-screen").getByRole("link", { name: "На главную" })).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Повторить" }).click();
  await expect(page.getByTestId("dashboard-learning-summary")).toBeVisible();
});

test("without network the strip appears and the loaded screen stays", async ({ page, request, context }) => {
  await signIn(context, await studentSession(request));
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-learning-summary")).toBeVisible();
  await context.setOffline(true);
  // Nothing saved is shown yet: the screen is the one already loaded, so no time in the strip.
  await expect(page.getByTestId("connection-banner")).toHaveText("Нет связи");
  await expect(page.getByTestId("dashboard-learning-summary")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByTestId("connection-banner")).toHaveCount(0);
});

test("a server failure at start keeps the session (З-14)", async ({ page, request, context }) => {
  await signIn(context, await studentSession(request));
  await serverUnreachable(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Нет связи" })).toBeVisible();
  await expect(page.getByTestId("connection-banner")).toContainText("Нет связи");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("the saved home opens without network only while it is younger than 12 hours", async ({ page, request, context, browser }) => {
  const session = await studentSession(request);
  const home = await homeAnswer(request, session);
  await signIn(context, session);
  await keepSavedHome(context, session, home, HOUR);
  await serverUnreachable(page);
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-learning-summary")).toBeVisible();
  await expect(page.getByTestId("connection-banner")).toContainText("Нет связи. Показываем сохранённое на");

  const stale = await browser.newContext();
  await signIn(stale, session);
  await keepSavedHome(stale, session, home, 13 * HOUR);
  const stalePage = await stale.newPage();
  await serverUnreachable(stalePage);
  await stalePage.goto("/dashboard");
  await expect(stalePage.getByRole("heading", { name: "Нет связи" })).toBeVisible();
  await expect(stalePage.getByTestId("dashboard-learning-summary")).toHaveCount(0);
  await stale.close();
});

test("the CRM copy of the schedule is named in the strip", async ({ page, request, context }) => {
  await signIn(context, await studentSession(request));
  const snapshotAt = new Date(Date.now() - 2 * HOUR).toISOString();
  await page.route("**/api/v1/students/me/home", async (route) => {
    const response = await route.fetch();
    const body = await response.json() as { data: { school: Record<string, unknown> | null } };
    body.data.school = { ...(body.data.school ?? {}), crmStale: true, crmSnapshotAt: snapshotAt };
    await route.fulfill({ response, json: body });
  });
  await page.goto("/dashboard");
  await expect(page.getByTestId("connection-banner")).toContainText("Нет связи со школой. Расписание на");
});

test("a profile save is confirmed by a toast; sign-out erases the saved home", async ({ page, request, context }) => {
  const session = await studentSession(request);
  await signIn(context, session);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Данные" }).click();
  await page.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(page.getByTestId("app-toast")).toContainText("Профиль сохранён");

  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-learning-summary")).toBeVisible();
  const savedKey = `maestro_home_snapshot:${session.user.id}`;
  expect(await page.evaluate((key) => window.localStorage.getItem(key) !== null, savedKey)).toBe(true);
  await page.locator("header button[aria-haspopup='menu']").click();
  await page.getByRole("menuitem", { name: /Выйти из кабинета/ }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(await page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.startsWith("maestro_home_snapshot:")))).toEqual([]);
});
