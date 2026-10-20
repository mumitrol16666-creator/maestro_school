import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

/**
 * Stage 2: «Сейчас» and «Обучение» read one `/students/me/home` (the header shares it), a
 * proposal goes to the teacher from «Обучение», and theory tests are tasks of their own source.
 */
const PASSWORD = "QaMaestro2026!";
const QA_DB = process.env.QA_PLATFORM_DB ?? "maestro_regression";

// A student keeps at most 10 open proposals; the run removes its own afterwards.
test.afterAll(() => {
  execFileSync("psql", ["-h", "localhost", "-U", "vladislav", "-d", QA_DB, "-At", "-c",
    "delete from learning_sector_proposals where text like 'QA: хочу разобрать%'"]);
});

test("one home read; a proposal from «Обучение»; theory tests in the task list", async ({ page, request, context }) => {
  const login = await request.post("/api/v1/auth/login", { data: { phone: "qa_student_1", password: PASSWORD, profile: "student" } });
  expect(login.ok(), await login.text()).toBe(true);
  const session = (await login.json()).data as { token: string; user: unknown };
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, session);

  const reads: string[] = [];
  page.on("request", (item) => {
    const path = new URL(item.url()).pathname;
    if (path.startsWith("/api/v1/students/me/")) reads.push(path.replace("/api/v1", ""));
  });
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-learning-summary")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(reads.filter((path) => path === "/students/me/home")).toHaveLength(1);
  expect(reads.some((path) => ["/students/me/offline-summary", "/students/me/tasks", "/students/me/monthly-plans"].includes(path))).toBe(false);

  await page.getByTestId("dashboard-learning-summary").getByRole("link", { name: /Открыть обучение/ }).click();
  await expect(page).toHaveURL(/\/learning$/);
  await expect(page.getByRole("heading", { name: "Обучение", exact: true })).toBeVisible();
  await expect(page.getByTestId("learning-sector-card")).toBeVisible();

  const proposal = `QA: хочу разобрать «Группа крови» · ${Date.now()}`;
  await page.getByRole("button", { name: "Песня", exact: true }).click();
  await page.getByPlaceholder(/Например: «Кукла колдуна»/).fill(proposal);
  await page.getByRole("button", { name: /Отправить преподавателю/ }).click();
  await expect(page.getByText("Отправлено", { exact: true })).toBeVisible();
  await expect(page.getByText(proposal)).toBeVisible();
  await expect(page.getByText("Ждёт ответа преподавателя").first()).toBeVisible();

  await page.goto("/tasks?source=theory&view=action");
  const cards = page.getByTestId("task-results").getByTestId("task-card");
  await expect(cards.first()).toBeVisible();
  await expect(cards.first()).toContainText("Тест по теории");
  await cards.first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/tests\//);

  await page.goto("/tests");
  await expect(page.getByRole("heading", { name: "Тесты по теории" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
