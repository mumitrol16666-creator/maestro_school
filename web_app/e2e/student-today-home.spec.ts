import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

/**
 * Plan 5.1–5.3: the student's home opens with «Сегодня» (the nearest lesson and the task to it),
 * banners show what is new, the long screens fold: history to two weeks with pending lessons in
 * one line, the league under «Подробнее», tests by section.
 */
const PASSWORD = "QaMaestro2026!";

async function signIn(request: APIRequestContext, context: BrowserContext) {
  const login = await request.post("/api/v1/auth/login", { data: { phone: "qa_student_1", password: PASSWORD, profile: "student" } });
  expect(login.ok(), await login.text()).toBe(true);
  const session = (await login.json()).data as { token: string; user: unknown };
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, session);
  return session.token;
}

test("the home opens with «Сегодня», a banner for a new homework, and no Coins", async ({ page, request, context }) => {
  await signIn(request, context);
  // The QA data keeps an unread «new homework» notification for qa_student_1 (seeded by SQL on the stand).
  await page.goto("/dashboard");
  const seeded = (await page.getByTestId("student-banner").filter({ hasText: "Переходы Am–E к четвергу" }).count()) > 0;
  const today = page.getByTestId("student-today");
  await expect(today).toBeVisible();
  await expect(today.getByTestId("today-lesson")).toBeVisible();
  await expect(today.getByTestId("today-cta")).toBeVisible();
  await expect(page.getByTestId("dashboard-coins-chip")).toHaveCount(0);
  await expect(page.getByText("Coins", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Открыть сектор", exact: true })).toHaveCount(1);

  if (seeded) {
    const banner = page.getByTestId("student-banner").filter({ hasText: "Переходы Am–E к четвергу" });
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: /Открыть задание/ }).click();
    await expect(page).toHaveURL(/\/tasks$/);
    await page.goto("/dashboard");
    await expect(page.getByTestId("student-banner").filter({ hasText: "Переходы Am–E к четвергу" })).toHaveCount(0);
  }
});

test("history shows two weeks with pending lessons folded; the league and tests fold", async ({ page, request, context }) => {
  await signIn(request, context);
  await page.goto("/school-lessons?tab=history");
  await expect(page.getByRole("combobox", { name: "Месяц истории" })).toHaveValue("auto");
  const pending = page.getByTestId("history-pending-toggle");
  if (await pending.count()) {
    await expect(pending).toContainText(/ждёт итогов|ждут итогов/);
    await expect(page.getByText("Итоги готовятся")).toHaveCount(0);
    await pending.click();
    await expect(page.getByText("Итоги готовятся").first()).toBeVisible();
  }
  const more = page.getByTestId("history-show-more");
  if (await more.count()) {
    await more.click();
    await expect(page.getByRole("combobox", { name: "Месяц истории" })).toHaveValue("all");
  }

  await page.goto("/league");
  const details = page.getByTestId("league-details");
  await expect(details).toBeVisible();
  await expect(page.getByText("Coins за неделю")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Топ недели|Итоги недели/ })).toBeHidden();
  await details.locator("> summary").click();
  await expect(page.getByRole("heading", { name: /Топ недели|Итоги недели/ })).toBeVisible();

  await page.goto("/tests");
  const sections = page.locator("details[data-testid^='tests-section-']");
  await expect(sections.first()).toBeVisible();
  expect(await sections.evaluateAll((nodes) => nodes.filter((node) => (node as HTMLDetailsElement).open).length)).toBe(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
