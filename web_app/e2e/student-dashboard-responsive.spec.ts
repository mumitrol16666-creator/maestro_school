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

test("«Сейчас» keeps the focus and league in the top row and leads to «Обучение»", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAsStudent(request, context);
  await page.goto("/dashboard");

  const focus = page.getByText(/^Сейчас · /).first();
  const league = page.getByRole("heading", { name: "Лидеры недели" });
  // Plan 2.1: tasks and the sector live on «Обучение»; «Сейчас» shows a short summary leading there.
  const tasks = page.getByTestId("dashboard-learning-summary");
  await expect(focus).toBeVisible();
  await expect(league).toBeVisible();
  await expect(tasks).toBeVisible();
  await expect(tasks.getByRole("link", { name: /Открыть обучение/ })).toHaveAttribute("href", "/learning");
  await expect(page.getByText("Процент не выставлен")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-coins-chip")).toHaveAttribute("href", "/rewards");
  await expect(page.getByTestId("dashboard-achievements-chip")).toHaveAttribute("href", "/settings#achievements");

  await page.getByTestId("dashboard-level-chip").click();
  const levelDialog = page.getByTestId("level-progress-dialog");
  await expect(levelDialog).toBeVisible();
  await expect(levelDialog.getByTestId("level-scale-row")).toHaveCount(10);
  await expect(levelDialog).toContainText("0–299 баллов");
  await expect(levelDialog).toContainText("от 12 000 баллов");
  await levelDialog.getByRole("button", { name: "Закрыть уровни" }).click();
  await expect(levelDialog).toHaveCount(0);

  const focusBox = await focus.boundingBox();
  const leagueBox = await league.boundingBox();
  const taskBox = await tasks.boundingBox();
  expect(focusBox).not.toBeNull();
  expect(leagueBox).not.toBeNull();
  expect(taskBox).not.toBeNull();
  expect(leagueBox!.x).toBeGreaterThan(focusBox!.x);
  expect(taskBox!.y).toBeGreaterThan(focusBox!.y);
});

test("on a phone «Сейчас» shows the focus, the league, then the way to «Обучение»", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsStudent(request, context);
  await page.goto("/dashboard");

  const focus = page.getByText(/^Сейчас · /).first();
  // Plan 2.1: tasks and the sector live on «Обучение»; «Сейчас» shows a short summary leading there.
  const tasks = page.getByTestId("dashboard-learning-summary");
  const league = page.getByRole("heading", { name: "Лидеры недели" });
  await expect(focus).toBeVisible();
  await expect(tasks).toBeVisible();
  await expect(league).toBeVisible();

  const focusBox = await focus.boundingBox();
  const taskBox = await tasks.boundingBox();
  const leagueBox = await league.boundingBox();
  expect(focusBox).not.toBeNull();
  expect(taskBox).not.toBeNull();
  expect(leagueBox).not.toBeNull();
  expect(leagueBox!.y).toBeGreaterThan(focusBox!.y);
  expect(taskBox!.y).toBeGreaterThan(leagueBox!.y);

  const overflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ));
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByText("баллов", { exact: true })).toBeVisible();
  await expect(page.getByText("Coins", { exact: true })).toBeVisible();
  await expect(page.getByText("достижений", { exact: true })).toBeVisible();
  await page.getByTestId("dashboard-points-chip").click();
  const levelDialog = page.getByTestId("level-progress-dialog");
  await expect(levelDialog).toBeVisible();
  await expect(levelDialog).toContainText("Баллы показывают постоянный результат обучения");
  const dialogOverflow = await levelDialog.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(dialogOverflow).toBeLessThanOrEqual(1);
  await levelDialog.getByRole("button", { name: "Закрыть уровни" }).click();
});

test("monthly plan opens from the dashboard on desktop and phone", async ({ page, request, context }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await signInAsStudent(request, context);

  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/dashboard");
    // The hero and the sector card may both lead to the sector.
    await page.getByRole("link", { name: "Открыть сектор", exact: true }).first().click();

    await expect(page).toHaveURL(/\/monthly-plan$/);
    await expect(page.getByRole("heading", { name: /^(Мой сектор( \d+)?|Сектор группы \d+|Мои сектора)$/ })).toBeVisible();
    await expect(page.getByRole("article")).not.toHaveCount(0);
    await expect(page.getByText("Application error", { exact: false })).toHaveCount(0);
    const overflow = await page.evaluate(() => (
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    ));
    expect(overflow).toBeLessThanOrEqual(1);
  }

  expect(pageErrors).toEqual([]);
});
