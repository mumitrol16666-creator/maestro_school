import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

/**
 * Plan 5.4: the parent sees the week in one card, a sentence to say to the child, how learning
 * works (foldable), a calm balance and five visits with the unconfirmed folded.
 * Plan 5.6: the student marks «позанимался» on the home and sets the reminder in settings.
 */
const PASSWORD = "QaMaestro2026!";

async function signIn(request: APIRequestContext, context: BrowserContext, phone: string, profile: "parent" | "student") {
  const login = await request.post("/api/v1/auth/login", { data: { phone, password: PASSWORD, profile } });
  expect(login.ok(), await login.text()).toBe(true);
  const session = (await login.json()).data as { token: string; user: unknown };
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, session);
  return session.token;
}

test("the parent sees the week, how learning works, a calm balance and folded visits", async ({ page, request, context }) => {
  await signIn(request, context, "qa_parent_1", "parent");
  await page.goto("/family");
  await expect(page.getByTestId("family-week-digest")).toBeVisible();
  await expect(page.getByTestId("family-support-tip")).toContainText("Как помочь сегодня");

  const explainer = page.getByTestId("family-explainer");
  await expect(explainer).toContainText("Сектор");
  await explainer.locator("summary").click();
  await page.reload();
  await expect.poll(() => page.getByTestId("family-explainer").evaluate((node) => (node as HTMLDetailsElement).open)).toBe(false);

  const balance = page.getByTestId("family-balance");
  if (await balance.count()) await expect(balance).toContainText(/К оплате|Оплачено полностью|Внесено сверх/);

  const visits = page.getByTestId("family-visits");
  await expect(visits).toBeVisible();
  const pending = page.getByTestId("family-visits-pending");
  if (await pending.count()) {
    await expect(page.getByText("Ждёт подтверждения школой")).toHaveCount(0);
    await pending.click();
    await expect(page.getByText("Ждёт подтверждения школой").first()).toBeVisible();
  }
  expect(await page.getByTestId("family-visit").count()).toBeLessThanOrEqual(5 + (await page.getByText("Ждёт подтверждения школой").count()));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the student marks today's practice on the home and sets the reminder in settings", async ({ page, request, context }) => {
  const token = await signIn(request, context, "qa_student_1", "student");
  await page.goto("/dashboard");
  const checkin = page.getByTestId("practice-checkin");
  await expect(checkin).toBeVisible();
  const button = checkin.getByRole("button", { name: "Позанимался сегодня" });
  if (await button.count()) {
    await button.click();
    await expect(checkin).not.toContainText("Позанимался сегодня");
  }
  await expect(checkin.getByTestId("practice-streak")).toContainText(/Дней подряд: \d+/);

  await page.goto("/settings");
  await page.getByRole("button", { name: "Настройки" }).click();
  const card = page.getByTestId("practice-reminder-card");
  await expect(card).toBeVisible();
  const toggle = card.getByLabel("Напоминать заниматься");
  if (!(await toggle.isChecked())) await toggle.check();
  const time = card.getByLabel("Время напоминания");
  // A value different from the saved one, so the save really happens on every run.
  const nextTime = (await time.inputValue()) === "19:30" ? "19:45" : "19:30";
  await time.fill(nextTime);
  const reminderSaved = () => page.waitForResponse((response) => response.url().includes("/students/me/practice/reminder") && response.request().method() === "PUT");
  const timeSaved = reminderSaved();
  await time.dispatchEvent("change");
  expect((await timeSaved).ok()).toBe(true);
  await expect(page.getByTestId("app-toast")).toContainText("Напоминание сохранено");
  const daySaved = reminderSaved();
  await card.getByRole("button", { name: "Вс" }).click();
  expect((await daySaved).ok()).toBe(true);
  await expect(page.getByTestId("app-toast")).toContainText("Напоминание сохранено");

  const saved = await request.get("/api/v1/students/me/practice", { headers: { Authorization: `Bearer ${token}` } });
  const data = (await saved.json()).data as { checkedInToday: boolean; reminder: { enabled: boolean; time: string; days: number[] } };
  expect(data.checkedInToday).toBe(true);
  expect(data.reminder.enabled).toBe(true);
  expect(data.reminder.time).toBe(nextTime);
});
