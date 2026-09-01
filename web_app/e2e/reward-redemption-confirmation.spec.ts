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
  return payload.data as { token: string; user: Record<string, unknown> };
}

test("reward exchange shows the resulting balance and a clear completion state", async ({
  page,
  request,
  context,
}) => {
  const session = await signInAsStudent(request, context);
  const overviewResponse = await request.get("/api/v1/students/me/rewards", {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  expect(overviewResponse.ok()).toBe(true);
  const overview = (await overviewResponse.json()).data;
  const rewardData = overview.catalog.find(
    (item: { title: string }) => item.title === "Выбрать песню для разбора",
  );
  expect(rewardData).toBeTruthy();
  const balanceBefore = Number(overview.coins);
  const balanceAfter = balanceBefore - Number(rewardData.costCoins);

  await page.route("**/api/v1/rewards/*/redeem", async (route) => {
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ data: {} }) });
  });

  await page.goto("/rewards");
  const reward = page.getByRole("article").filter({ hasText: "Выбрать песню для разбора" });
  await reward.getByRole("button", { name: "Получить награду" }).click();

  const confirmation = page.getByRole("dialog", { name: "Выбрать песню для разбора" });
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByText("Сейчас", { exact: true })).toBeVisible();
  await expect(confirmation.getByText("После заявки", { exact: true })).toBeVisible();
  await expect(confirmation.getByText(`${balanceBefore.toLocaleString("ru-RU")} Coins`, { exact: true })).toBeVisible();
  await expect(confirmation.getByText(`${balanceAfter.toLocaleString("ru-RU")} Coins`, { exact: true })).toBeVisible();

  await confirmation.getByRole("button", { name: `Обменять ${rewardData.costCoins} Coins` }).click();
  const success = page.getByRole("dialog", { name: "Заявка отправлена" });
  await expect(success).toBeVisible();
  await expect(success).toContainText(
    `Списано ${rewardData.costCoins} Coins, доступный баланс — ${balanceAfter} Coins`,
  );
  await success.getByRole("button", { name: "Вернуться к наградам" }).click();
  await expect(success).toBeHidden();
});

test("Coins guide explains every current earning rule", async ({ page, request, context }) => {
  await signInAsStudent(request, context);
  await page.goto("/rewards");

  await page.getByRole("button", { name: "Как получить Coins" }).click();
  const guide = page.getByTestId("coins-guide-dialog");
  await expect(guide).toBeVisible();
  await expect(guide.getByTestId("coin-source")).toHaveCount(6);
  await expect(guide).toContainText("Подтверждённое занятие");
  await expect(guide).toContainText("+50 Coins");
  await expect(guide).toContainText("80 XP");
  await expect(guide).toContainText("+150 / 100 / 50");
  await expect(guide).toContainText("4, 8, 12, 24 и 52 недели");
  await expect(guide).toContainText("до +100 Coins");
  await expect(guide).toContainText("+1–1 000 Coins");
  await expect(guide).toContainText("За отправку ДЗ или прохождение теста Coins напрямую не начисляются");

  const dimensions = await guide.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);

  await guide.getByRole("button", { name: "Понятно" }).click();
  await expect(guide).toBeHidden();
});
