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

async function signInAsAdmin(request: APIRequestContext, context: BrowserContext) {
  const response = await request.post("/api/v1/auth/login", {
    data: { phone: "qa_admin", password: PASSWORD, profile: "staff" },
  });
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, payload.data);
}

test("weekly XP shows only protected sources and exact limits", async ({ page, request, context }) => {
  await signInAsStudent(request, context);
  await page.goto("/league");

  await expect(page.getByRole("heading", { name: "Недельная лига" })).toBeVisible();
  await expect(page.getByText("Подтверждённый урок · первые 2 за неделю")).toBeVisible();
  await expect(page.getByText("Принятое ДЗ · до 3 на направление")).toBeVisible();
  await expect(page.getByText("Успешный тест · первые 2 за неделю")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Что сделать сейчас" })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Как заработать XP" })).toHaveCount(0);
  await expect(page.getByText("+15 / +10 XP").first()).toBeVisible();
  await expect(page.getByText("+20 / +10 XP").first()).toBeVisible();
  await expect(page.getByText("Тема из плана месяца")).toHaveCount(0);
  await expect(page.getByText("до +15 XP")).toHaveCount(0);
  await expect(page.getByText(/\d+\s*\/\s*80 XP/).first()).toBeVisible();
  await expect(page.getByText("Цель выполнена: +5 Coins")).toHaveCount(0);
  await expect(page.getByText(/15 \/ 10 \/ 7 Coins/)).toHaveCount(0);
  await expect(page.getByText("+20 XP · +50 Coins")).toBeVisible();
  await expect(page.getByText(/150 \/ 100 \/ 50 Coins/)).toBeVisible();
  await expect(page.getByTestId("weekly-streak")).toContainText(/\d+ недель подряд/);
  await expect(page.getByTestId("weekly-streak")).toContainText("4");
  const history = page.getByTestId("weekly-league-history");
  await expect(history).toBeVisible();
  await expect(history.getByRole("heading", { name: "История недель" })).toBeVisible();
  await expect(history).toContainText(/Итог сохранён|Первая завершённая неделя появится здесь/);
});

test("previous week shows a finalized snapshot or the explicit finalization window", async ({ page, request, context }) => {
  await signInAsStudent(request, context);
  await page.goto("/league");
  await page.getByRole("button", { name: "Прошлая" }).click();

  const finalized = page.getByText("Результат зафиксирован");
  const finalizing = page.getByText("Подведение итогов");
  await expect(finalized.or(finalizing)).toBeVisible();
  await expect(page.getByText(/\d+\s*\/\s*80 XP/).first()).toBeVisible();
  await expect(page.getByText("Coins за неделю", { exact: true })).toBeVisible();

  if (await finalizing.isVisible()) {
    await expect(page.getByText("Предварительный результат")).toBeVisible();
    await expect(page.getByText("текущее место")).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { name: "Итоги недели" })).toBeVisible();
    await expect(page.getByText("итоговое место")).toBeVisible();
  }
});

test("weekly league fits a phone and keeps actions in one column", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsStudent(request, context);
  await page.goto("/league");

  await expect(page.getByText("Подтверждённый урок · первые 2 за неделю")).toBeVisible();
  const overflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ));
  expect(overflow).toBeLessThanOrEqual(1);
  const actionText = page.getByText("Принятое ДЗ · до 3 на направление");
  const box = await actionText.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(391);
  await expect(page.getByTestId("weekly-league-history")).toBeVisible();
});

test("curator protects a week from the admin league without a duplicate action", async ({ page, request, context }) => {
  await signInAsAdmin(request, context);
  await page.goto("/admin/league");

  const studentCard = page.getByRole("article").filter({ hasText: "Максим Ахметов" });
  await expect(studentCard).toBeVisible();
  const protectButton = studentCard.getByRole("button", { name: "Защитить серию" });
  if (await protectButton.count()) {
    await protectButton.click();
    await studentCard.getByRole("combobox").selectOption("family");
    await studentCard.getByPlaceholder("Краткий комментарий").fill("Семейные обстоятельства, подтверждено куратором");
    await studentCard.getByRole("button", { name: "Подтвердить" }).click();
  }
  await expect(studentCard.getByText(/Неделя защищена/)).toBeVisible();
  await expect(protectButton).toHaveCount(0);
});
