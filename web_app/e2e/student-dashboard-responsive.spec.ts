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

test("student dashboard keeps one task state and desktop league in the top row", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAsStudent(request, context);
  await page.goto("/dashboard");

  const focus = page.getByText("Сейчас · план месяца", { exact: true });
  const league = page.getByRole("heading", { name: "Лидеры недели" });
  const tasks = page.getByText(/Сейчас всё сделано|Нужно сделать/).first();
  await expect(focus).toBeVisible();
  await expect(league).toBeVisible();
  await expect(tasks).toBeVisible();
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

test("student dashboard shows the task state before league on a phone", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsStudent(request, context);
  await page.goto("/dashboard");

  const focus = page.getByText("Сейчас · план месяца", { exact: true });
  const tasks = page.getByText(/Сейчас всё сделано|Нужно сделать/).first();
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
  expect(taskBox!.y).toBeGreaterThan(focusBox!.y);
  expect(leagueBox!.y).toBeGreaterThan(taskBox!.y);

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
    await page.getByRole("link", { name: "Открыть план", exact: true }).click();

    await expect(page).toHaveURL(/\/monthly-plan$/);
    await expect(page.getByRole("heading", { name: /План на/ })).toBeVisible();
    await expect(page.getByRole("article")).not.toHaveCount(0);
    await expect(page.getByText("Application error", { exact: false })).toHaveCount(0);
    const overflow = await page.evaluate(() => (
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    ));
    expect(overflow).toBeLessThanOrEqual(1);
  }

  expect(pageErrors).toEqual([]);
});
