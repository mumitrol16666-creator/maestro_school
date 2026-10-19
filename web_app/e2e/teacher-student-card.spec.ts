import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

const PASSWORD = "QaMaestro2026!";

async function signInAsTeacher(request: APIRequestContext, context: BrowserContext) {
  const response = await request.post("/api/v1/auth/login", {
    data: { phone: "qa_teacher_1", password: PASSWORD, profile: "staff" },
  });
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, payload.data);
}

test("the student card shows the sector, activity, dynamics, tasks and dialog in one place", async ({ page, request, context }) => {
  await signInAsTeacher(request, context);
  await page.goto("/admin/my-students/student/QA-STUDENT-1");

  const card = page.getByTestId("student-workspace-card");
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { name: "Казыбаев Камбар" })).toBeVisible();
  await expect(card.getByTestId("workspace-sector").first()).toContainText(/Сектор \d+/);
  await expect(card.getByRole("link", { name: "Редактор сектора" })).toHaveAttribute("href", "/admin/my-students/student/QA-STUDENT-1/plan");

  await card.getByRole("button", { name: "Активность" }).click();
  await expect(page).toHaveURL(/tab=activity/);
  await expect(card.getByText("XP этой недели")).toBeVisible();
  await expect(card.getByText("Тесты", { exact: true })).toBeVisible();

  await card.getByRole("button", { name: "Динамика" }).click();
  await expect(card.getByText("Посещаемость", { exact: true })).toBeVisible();
  await expect(card.getByText(/Домашние задания за \d+ дней/)).toBeVisible();

  await card.getByRole("button", { name: "Задания" }).click();
  await expect(card.getByRole("link", { name: /Все задания/ })).toHaveAttribute("href", "/admin/my-students/student/QA-STUDENT-1/tasks");

  await card.getByRole("button", { name: "Диалог" }).click();
  await expect(card.getByRole("button", { name: "Ученику" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Родителю" })).toBeVisible();
});

test("the student card opens as a drawer from the lesson roster", async ({ page, request, context }) => {
  await signInAsTeacher(request, context);
  await page.goto("/admin/offline-lessons/QA-CLASS-IND-EDITABLE");

  await page.getByRole("button", { name: "Открыть карточку: Казыбаев Камбар" }).click();
  const drawer = page.getByTestId("student-workspace-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId("workspace-sector").first()).toContainText(/Сектор \d+/);
  await expect(drawer.getByRole("link", { name: "Открыть карточку" })).toHaveAttribute("href", "/admin/my-students/student/QA-STUDENT-1");

  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
});
