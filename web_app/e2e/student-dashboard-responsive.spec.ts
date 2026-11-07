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

test("«Сейчас» opens with «Сегодня», shows two figures and leads to «Обучение» and the league", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAsStudent(request, context);
  await page.goto("/dashboard");

  // Plan 5.1: «Сегодня» opens the home.
  const focus = page.getByTestId("student-today");
  // Plan 2.1: tasks and the sector live on «Обучение»; «Сейчас» shows a short summary leading there.
  const tasks = page.getByTestId("dashboard-learning-summary");
  await expect(focus).toBeVisible();
  await expect(tasks).toBeVisible();
  await expect(tasks.getByRole("link", { name: /Открыть обучение/ })).toHaveAttribute("href", "/learning");
  await expect(page.getByText("Процент не выставлен")).toHaveCount(0);
  // Decision 24.10: Coins and achievements are not on the home; decision 02.11: XP and the place
  // in the league are only on «Лига» — the home keeps LEVEL and the days in a row.
  await expect(page.getByTestId("dashboard-coins-chip")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-achievements-chip")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-points-chip")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-level-chip")).toBeVisible();
  await expect(page.getByTestId("dashboard-streak")).toBeVisible();
  await expect(page.getByText("Лидеры недели")).toHaveCount(0);
  await expect(page.getByText("Coins")).toHaveCount(0);
  await expect(page.getByText(/\bXP\b/)).toHaveCount(0);
  await expect(page.getByTestId("today-cta")).toBeVisible();

  await page.getByTestId("dashboard-level-chip").click();
  const levelDialog = page.getByTestId("level-progress-dialog");
  await expect(levelDialog).toBeVisible();
  await expect(levelDialog.getByTestId("level-scale-row")).toHaveCount(10);
  await expect(levelDialog).toContainText("0–299 баллов");
  await expect(levelDialog).toContainText("от 12 000 баллов");
  await levelDialog.getByRole("button", { name: "Закрыть уровни" }).click();
  await expect(levelDialog).toHaveCount(0);

  const focusBox = await focus.boundingBox();
  const taskBox = await tasks.boundingBox();
  expect(focusBox).not.toBeNull();
  expect(taskBox).not.toBeNull();
  expect(taskBox!.y).toBeGreaterThan(focusBox!.y);

  // В-1: one line to the league without numbers.
  const leagueLink = page.getByTestId("dashboard-league-link");
  await expect(leagueLink).toHaveAttribute("href", "/league");
  expect((await leagueLink.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test("on a phone «Сегодня» with its gold button fits the first screen, then banners and the way to «Обучение»", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsStudent(request, context);
  await page.goto("/dashboard");

  const focus = page.getByTestId("student-today");
  // Plan 2.1: tasks and the sector live on «Обучение»; «Сейчас» shows a short summary leading there.
  const tasks = page.getByTestId("dashboard-learning-summary");
  const leagueLink = page.getByTestId("dashboard-league-link");
  await expect(focus).toBeVisible();
  await expect(tasks).toBeVisible();
  await expect(leagueLink).toBeVisible();

  // В-1: the card and its gold button are whole above the bottom navigation, banners or not.
  const cta = await page.getByTestId("today-cta").boundingBox();
  const navigation = await page.getByTestId("student-mobile-navigation").boundingBox();
  expect(cta).not.toBeNull();
  expect(navigation).not.toBeNull();
  expect(cta!.y + cta!.height).toBeLessThanOrEqual(navigation!.y);

  // В-1: banners are compact (one open), below the card and above the learning summary.
  const banners = page.getByTestId("student-banner");
  expect(await banners.count()).toBeLessThanOrEqual(1);
  if (await banners.count()) {
    const bannerBox = await banners.first().boundingBox();
    expect(bannerBox!.height).toBeLessThanOrEqual(90);
    expect(bannerBox!.y).toBeGreaterThan(cta!.y);
  }

  const focusBox = await focus.boundingBox();
  const taskBox = await tasks.boundingBox();
  const leagueBox = await leagueLink.boundingBox();
  expect(focusBox).not.toBeNull();
  expect(taskBox).not.toBeNull();
  expect(leagueBox).not.toBeNull();
  expect(taskBox!.y).toBeGreaterThan(focusBox!.y);
  expect(leagueBox!.y).toBeGreaterThan(taskBox!.y);

  const overflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ));
  expect(overflow).toBeLessThanOrEqual(1);
  // В-31: two figures — LEVEL with the bar and the days in a row; no XP, place or Coins on the home.
  await expect(page.getByTestId("dashboard-level-chip")).toBeVisible();
  await expect(page.getByTestId("dashboard-streak")).toBeVisible();
  await expect(page.getByTestId("dashboard-points-chip")).toHaveCount(0);
  await expect(page.getByText("Coins")).toHaveCount(0);
  await expect(page.getByText(/\bXP\b/)).toHaveCount(0);
  await expect(page.getByText(/Твоё место/)).toHaveCount(0);
  await page.getByTestId("dashboard-level-chip").click();
  const levelDialog = page.getByTestId("level-progress-dialog");
  await expect(levelDialog).toBeVisible();
  await expect(levelDialog).toContainText("Баллы показывают постоянный результат обучения");
  const dialogOverflow = await levelDialog.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(dialogOverflow).toBeLessThanOrEqual(1);
  await levelDialog.getByRole("button", { name: "Закрыть уровни" }).click();
});

test("the league keeps the XP and the place that left the home", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsStudent(request, context);
  await page.goto("/dashboard");
  await page.getByTestId("dashboard-league-link").click();
  await expect(page).toHaveURL(/\/league$/);
  await expect(page.getByText(/XP/).first()).toBeVisible();
  await expect(page.getByText(/позиция|место/i).first()).toBeVisible();
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
    // Plan 5.1: one «Открыть сектор» on the home, in the learning summary.
    await expect(page.getByRole("link", { name: "Открыть сектор", exact: true })).toHaveCount(1);
    await page.getByRole("link", { name: "Открыть сектор", exact: true }).click();

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
