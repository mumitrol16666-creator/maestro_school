import { expect, test } from "@playwright/test";

/**
 * Stage 3: the parent's family page — payment with the membership, attendance of confirmed
 * lessons, the month's results instead of streak milestones, and a notice link that opens the
 * lesson it is about.
 */
const PASSWORD = "QaMaestro2026!";

test("a parent sees payment, visits and results, and a notice opens its lesson", async ({ page, request, context }) => {
  const login = await request.post("/api/v1/auth/login", { data: { phone: "qa_parent_1", password: PASSWORD, profile: "parent" } });
  expect(login.ok(), await login.text()).toBe(true);
  const session = (await login.json()).data as { token: string; user: unknown };
  const headers = { Authorization: `Bearer ${session.token}` };
  const children = (await (await request.get("/api/v1/parents/me/children", { headers })).json()).data as Array<{ id: string }>;
  const childId = children[0]!.id;
  const overview = (await (await request.get(`/api/v1/parents/me/children/${childId}/offline-summary`, { headers })).json()).data;
  expect(JSON.stringify(overview)).not.toContain("homework");
  const visit = (overview.summary.visits as Array<{ crmClassId: string | null }>).find((item) => item.crmClassId);

  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, session);
  await page.goto(`/family?student=${childId}`);

  const payment = page.getByTestId("family-payment");
  await expect(payment).toContainText("Оплата");
  await expect(payment.getByTestId("family-membership").first()).toBeVisible();
  await expect(page.getByTestId("family-visits")).toContainText("Посещения");
  await expect(page.getByTestId("family-results")).toContainText("Результаты");
  await expect(page.getByRole("heading", { name: "Достижения" })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  test.skip(!visit, "У ученика QA нет прошедших уроков");
  await page.goto(`/family?student=${childId}&notice=report&event=${visit!.crmClassId}`);
  await expect(page.getByTestId("family-notice")).toContainText("Отчёт по уроку");
  const row = page.locator(`#visit-${visit!.crmClassId}`);
  await expect(row).toHaveClass(/ring-gold/);
  await expect(row).toBeInViewport();
});
