import { expect, test } from "@playwright/test";

const PASSWORD = "QaMaestro2026!";
const QA_TOPIC_ID = "20000000-0000-4000-8000-000000000002";
const INSTRUCTIONS = "E2E responsive: переходы под метроном";
const FORM_INSTRUCTIONS = "E2E responsive: форма ответа с материалами";

test("новое ДЗ не ломает телефонные размеры", async ({ page, request }) => {
  const teacherLogin = await request.post("/api/v1/auth/login", {
    data: { phone: "qa_teacher_1", password: PASSWORD, profile: "staff" },
  });
  expect(teacherLogin.ok()).toBe(true);
  const teacher = await teacherLogin.json();
  const create = await request.post("/api/v1/teachers/me/homework-assignments", {
    headers: { Authorization: `Bearer ${teacher.data.token}` },
    data: {
      topicId: QA_TOPIC_ID,
      instructions: FORM_INSTRUCTIONS,
      idempotencyKey: "e2e:homework-v2:responsive-form",
    },
  });
  test.skip(create.status() === 404, "Homework V2 is disabled");
  expect([200, 201]).toContain(create.status());

  await page.goto("/login");
  await page.getByRole("button", { name: "Ученик", exact: true }).click();
  await page.locator('input[autocomplete="username"]:visible').fill("qa_student_1");
  await page.locator('input[autocomplete="current-password"]:visible').fill(PASSWORD);
  await page.getByRole("button", { name: "Войти в кабинет" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/school-lessons?tab=homework");
  await expect(page.getByText(FORM_INSTRUCTIONS)).toBeVisible();
  const closeDialog = page.getByRole("button", { name: "Закрыть" });
  if (await closeDialog.isVisible().catch(() => false)) await closeDialog.click();

  const assignmentCard = page.locator("article", { hasText: FORM_INSTRUCTIONS });
  await expect(assignmentCard.getByRole("button", { name: "Я подготовил", exact: true })).toBeVisible();
  await assignmentCard.getByRole("button", { name: "Я подготовил", exact: true }).click();
  await expect(assignmentCard.getByPlaceholder("Сопроводительный комментарий")).toBeVisible();
  await expect(assignmentCard.getByRole("button", { name: "Прикрепить файлы" })).toBeVisible();
  await expect(assignmentCard.getByRole("button", { name: "Отправить преподавателю" })).toBeVisible();

  for (const width of [320, 375, 430, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByText(FORM_INSTRUCTIONS)).toBeVisible();
    const overflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(overflow.page, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(overflow.viewport);
  }
});

test("очередь и карточка проверки адаптивны", async ({ page, request }) => {
  const teacherLogin = await request.post("/api/v1/auth/login", {
    data: { phone: "qa_teacher_1", password: PASSWORD, profile: "staff" },
  });
  const studentLogin = await request.post("/api/v1/auth/login", {
    data: { phone: "qa_student_1", password: PASSWORD, profile: "student" },
  });
  expect(teacherLogin.ok()).toBe(true);
  expect(studentLogin.ok()).toBe(true);
  const teacher = await teacherLogin.json();
  const student = await studentLogin.json();
  const create = await request.post("/api/v1/teachers/me/homework-assignments", {
    headers: { Authorization: `Bearer ${teacher.data.token}` },
    data: {
      topicId: QA_TOPIC_ID,
      instructions: INSTRUCTIONS,
      idempotencyKey: "e2e:homework-v2:responsive",
    },
  });
  test.skip(create.status() === 404, "Homework V2 is disabled");
  expect([200, 201]).toContain(create.status());
  const assignment = await create.json();
  const recipientId = assignment.data.recipients.find(
    (recipient: { crmStudentId: string }) => recipient.crmStudentId === "QA-STUDENT-1",
  )?.id as string | undefined;
  expect(recipientId).toBeTruthy();
  const submit = await request.post(`/api/v1/homeworks/${assignment.data.id}/submissions`, {
    headers: { Authorization: `Bearer ${student.data.token}` },
    data: {
      submissionMode: "ready_for_lesson",
      idempotencyKey: "e2e:homework-v2:responsive-attempt",
    },
  });
  expect([200, 201]).toContain(submit.status());

  await page.goto("/login");
  await page.getByRole("button", { name: "Сотрудник", exact: true }).click();
  await page.locator('input[autocomplete="username"]:visible').fill("qa_teacher_1");
  await page.locator('input[autocomplete="current-password"]:visible').fill(PASSWORD);
  await page.getByRole("button", { name: "Войти в кабинет" }).click();
  await expect(page).toHaveURL(/\/admin\/(?:offline-lessons)?$/);
  await page.goto(`/admin/homework-review/${recipientId}`);
  const closeDialog = page.getByRole("button", { name: "Закрыть" });
  await closeDialog.click({ timeout: 2_000 }).catch(() => undefined);
  await expect(page.getByRole("heading", { name: /Казыбаев Камбар/ }).first()).toBeVisible();
  await expect(page.getByText(INSTRUCTIONS)).toBeVisible();
  await expect(page.getByRole("button", { name: "Принять", exact: true })).toBeVisible();

  for (const width of [320, 375, 430, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByText(INSTRUCTIONS)).toBeVisible();
    const overflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(overflow.page, `review horizontal overflow at ${width}px`).toBeLessThanOrEqual(overflow.viewport);
  }
});
