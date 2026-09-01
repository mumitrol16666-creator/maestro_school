import { expect, test, type BrowserContext, type APIRequestContext } from "@playwright/test";

const PASSWORD = "QaMaestro2026!";

async function signInAsStudent(
  request: APIRequestContext,
  context: BrowserContext,
  login = "qa_student_1",
) {
  const response = await request.post("/api/v1/auth/login", {
    data: { phone: login, password: PASSWORD, profile: "student" },
  });
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, payload.data);
  return payload.data as { token: string; user: Record<string, unknown> };
}

test("LEVEL uses the current epoch and replaces the legacy rank", async ({ page, request, context }) => {
  const session = await signInAsStudent(request, context);
  const economyResponse = await request.get("/api/v1/students/me/economy-profile", {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  expect(economyResponse.ok()).toBe(true);
  const economyData = (await economyResponse.json()).data;
  expect(economyData.level).not.toBeNull();

  let economyRequests = 0;
  await page.route("**/api/v1/students/me/economy-profile", async (route) => {
    economyRequests += 1;
    if (economyRequests === 1) {
      await route.abort("connectionfailed");
      return;
    }
    await route.continue();
  });
  await page.goto("/settings");

  const level = page.getByTestId("level-summary");
  await expect(level).toBeVisible();
  expect(economyRequests).toBeGreaterThanOrEqual(2);
  expect(economyRequests).toBeLessThanOrEqual(3);
  await expect(level.getByRole("heading", { name: economyData.level.level.title })).toBeVisible();
  await expect(level).toContainText(`${economyData.points.toLocaleString("ru-RU")} баллов`);
  if (economyData.level.next) {
    await expect(level).toContainText(
      `${economyData.level.pointsToNext.toLocaleString("ru-RU")} баллов до ${economyData.level.next.title}`,
    );
  }
  await expect(page.getByText("Первые струны")).toHaveCount(0);
  await level.getByRole("button", { name: "Все уровни" }).click();
  const levelDialog = page.getByTestId("level-progress-dialog");
  await expect(levelDialog.getByTestId("level-scale-row")).toHaveCount(10);
  await expect(levelDialog).toContainText("Недельный XP считается отдельно");
  await levelDialog.getByRole("button", { name: "Закрыть уровни" }).click();
  const economy = page.getByTestId("economy-profile-summary");
  await expect(economy).toBeVisible();
  await expect(economy).toContainText("Серия и медали");
  await expect(economy).toContainText("текущая серия");
  await expect(economy).toContainText("0 / 5");
  await expect(page.getByTestId("profile-achievements")).toBeVisible();
  await expect(page.getByText("Публичная карточка")).toHaveCount(0);
  const profileSummaryBox = await page.getByTestId("student-profile-summary").boundingBox();
  expect(profileSummaryBox).not.toBeNull();
  expect(profileSummaryBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(600);

  await page.goto("/rewards");
  await expect(page.getByRole("heading", { name: "Магазин", exact: true })).toBeVisible();
  await expect(page.getByTestId("level-summary")).toHaveCount(0);

  await page.goto("/progress");
  await expect(page.getByRole("heading", { name: "История обучения" })).toBeVisible();
  await expect(page.getByTestId("learning-points-history")).toBeVisible();
  await expect(page.getByTestId("level-summary")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Достижения" })).toHaveCount(0);
});

test("top Points is separate from weekly XP and preserves tied positions", async ({ page, request, context }) => {
  await signInAsStudent(request, context);
  await page.route("**/api/v1/students/me/points-leaderboard", async (route) => {
    const level = {
      level: 4,
      code: "level_4",
      title: "LEVEL 4",
      minPoints: 1_500,
      tone: "emerald",
      emblem: "hexagon",
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          enabled: true,
          economicEpoch: { code: "qa-ui", startsAt: "2026-08-01T00:00:00.000Z" },
          updatedAt: new Date().toISOString(),
          participantCount: 3,
          allBalancesEqual: false,
          standings: [
            { position: 1, displayName: "Камбар К.", points: 1_600, level, isCurrentStudent: true },
            { position: 1, displayName: "Алина С.", points: 1_600, level, isCurrentStudent: false },
            {
              position: 3,
              displayName: "Максим А.",
              points: 300,
              level: { ...level, level: 2, code: "level_2", title: "LEVEL 2", minPoints: 300, tone: "silver", emblem: "square" },
              isCurrentStudent: false,
            },
          ],
          currentStudent: { position: 1, displayName: "Камбар К.", points: 1_600, level, isCurrentStudent: true },
        },
      }),
    });
  });
  await page.goto("/league");

  const leaderboard = page.getByTestId("points-leaderboard");
  await expect(leaderboard).toBeVisible();
  await expect(leaderboard.getByRole("heading", { name: "Топ по баллам" })).toBeVisible();
  await expect(leaderboard).toContainText("не выдаёт недельные призы");

  const rows = leaderboard.getByTestId("points-leaderboard-row");
  await expect(rows.nth(2)).toBeVisible();
  expect(await rows.count()).toBeGreaterThanOrEqual(3);
  await expect(rows.nth(0)).toContainText("1");
  await expect(rows.nth(0)).toContainText("1 600 баллов");
  await expect(rows.nth(1)).toContainText("1");
  await expect(rows.nth(1)).toContainText("1 600 баллов");
  await expect(rows.nth(2)).toContainText("3");
  await expect(rows.nth(2)).toContainText("300 баллов");

  const weeklySection = page.getByRole("heading", { name: "Топ недели" }).locator("..", { hasText: "Топ недели" });
  await expect(weeklySection).not.toContainText("баллов");
});

test("LEVEL and top Points fit a phone viewport", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsStudent(request, context);
  await page.goto("/league");

  const leaderboard = page.getByTestId("points-leaderboard");
  await expect(leaderboard).toBeVisible();
  const box = await leaderboard.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(391);
  const horizontalOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ));
  expect(horizontalOverflow).toBeLessThanOrEqual(1);

  await page.goto("/settings");
  await expect(page.getByTestId("level-summary")).toBeVisible();
  await expect(page.getByTestId("economy-profile-summary")).toBeVisible();
  const settingsOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ));
  expect(settingsOverflow).toBeLessThanOrEqual(1);
});

test("profile separates progress, personal data and account settings on a phone", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsStudent(request, context);
  await page.goto("/settings");

  await expect(page.getByTestId("profile-section-overview")).toBeVisible();
  await expect(page.getByTestId("level-summary")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Профиль ученика" })).toHaveCount(0);

  await page.getByRole("button", { name: "Данные", exact: true }).click();
  await expect(page.getByTestId("profile-section-data")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Профиль ученика" })).toBeVisible();
  await expect(page.getByTestId("level-summary")).toHaveCount(0);

  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByTestId("profile-section-settings")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Maestro на телефоне" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Сменить пароль" })).toBeVisible();

  const overflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ));
  expect(overflow).toBeLessThanOrEqual(1);
});
