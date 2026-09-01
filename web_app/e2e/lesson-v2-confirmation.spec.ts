import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const PASSWORD = "QaMaestro2026!";
const INDIVIDUAL_LESSON_ID = "QA-CLASS-IND-EDITABLE";
const GROUP_LESSON_ID = "QA-CLASS-GROUP-EDITABLE";

type TestSession = {
  token: string;
  user: Record<string, unknown>;
};

let adminSession: TestSession;
let teacherSession: TestSession;

async function loginSession(
  request: APIRequestContext,
  phone: string,
  profile: "staff" | "student",
) {
  const response = await request.post("/api/v1/auth/login", {
    data: { phone, password: PASSWORD, profile },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()).data as TestSession;
}

test.beforeAll(async ({ request }) => {
  adminSession = await loginSession(request, "qa_admin", "staff");
  teacherSession = await loginSession(request, "qa_teacher_1", "staff");
});

async function prepareEditableLesson(
  request: APIRequestContext,
  adminToken: string,
  crmClassId: string,
) {
  const headers = { Authorization: `Bearer ${adminToken}` };
  const clearedDraft = await request.delete(
    `/api/v1/admin/offline-lessons/${crmClassId}/draft`,
    { headers },
  );
  expect(clearedDraft.ok()).toBe(true);
  const cardResponse = await request.get(
    `/api/v1/admin/offline-lessons/${crmClassId}`,
    { headers },
  );
  expect(cardResponse.ok()).toBe(true);
  let status = (await cardResponse.json()).data.status as string;

  if (status === "completed") {
    const reopen = await request.post(
      `/api/v1/admin/offline-lessons/${crmClassId}/reopen`,
      {
        headers,
        data: { reason: "Локальная проверка единого урока" },
      },
    );
    expect(reopen.ok()).toBe(true);
    status = (await reopen.json()).data.status;
  }
  if (status === "pending_admin_review") {
    const returnToTeacher = await request.post(
      `/api/v1/admin/offline-lessons/${crmClassId}/return-to-teacher`,
      {
        headers,
        data: { reason: "Локальная проверка итогового окна" },
      },
    );
    expect(returnToTeacher.ok()).toBe(true);
    status = (await returnToTeacher.json()).data.status;
  }

  expect(["started", "not_filled"]).toContain(status);
}

async function loginTeacher(page: Page) {
  await page.goto("/login");
  await page.evaluate((session) => {
    window.localStorage.setItem("maestro_access_token", session.token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(session.user));
  }, teacherSession);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin/);
}

async function closeNotificationCenter(page: Page) {
  await page.getByRole("button", { name: "Закрыть" }).click({ timeout: 2_000 }).catch(() => undefined);
}

test("итог урока разделяет баллы темы и недельный XP", async ({ page, request }) => {
  await prepareEditableLesson(request, adminSession.token, INDIVIDUAL_LESSON_ID);
  await loginTeacher(page);
  await page.goto(`/admin/offline-lessons/${INDIVIDUAL_LESSON_ID}`);
  await closeNotificationCenter(page);

  await expect(page.getByRole("heading", { name: "Тема и проверка прошлого ДЗ" })).toBeVisible();
  await expect(page.getByText(/На проверке: 1/)).toBeVisible();
  await expect(page.getByText(/От 0 до 100 XP/i)).toHaveCount(0);

  await page.getByRole("button", { name: /Стабильный бой восьмыми/ }).click();
  await page.getByRole("button", { name: "100% · Освоено" }).click();
  await page.getByRole("button", { name: "Принять", exact: true }).click();
  await page.getByRole("button", { name: "Отправить на проверку" }).click();

  const dialog = page.getByRole("dialog", { name: "Отправить урок на проверку?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("45% → 100%", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/100 баллов/)).toBeVisible();
  await expect(dialog.getByText(/100 XP/)).toHaveCount(0);
  await expect(dialog.getByText("+20 XP после подтверждения урока", { exact: true })).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollTop)).toBe(0);

  for (const width of [320, 375, 430, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(dialog).toBeVisible();
    const overflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(overflow.page, `confirmation horizontal overflow at ${width}px`)
      .toBeLessThanOrEqual(overflow.viewport);
  }
});

test("групповой урок оставляет тему общей, а проверку ДЗ персональной", async ({ page, request }) => {
  await prepareEditableLesson(request, adminSession.token, GROUP_LESSON_ID);
  await loginTeacher(page);
  await page.goto(`/admin/offline-lessons/${GROUP_LESSON_ID}`);
  await closeNotificationCenter(page);

  await expect(page.getByRole("heading", { name: "Тема и проверка прошлого ДЗ" })).toHaveCount(1);
  await expect(page.getByText(/На проверке: 2/)).toBeVisible();

  const topicButton = page.getByRole("button", { name: /Единый ритм группы/ }).first();
  await topicButton.click();
  await page.getByRole("button", { name: "75%" }).click();

  const homeworkSection = page.getByText("Решение по ожидающему ДЗ").locator("..", { hasText: "Казыбаев Камбар" });
  const decisionRows = homeworkSection.locator("div.border-t.border-stone-200.py-4");
  await expect(decisionRows).toHaveCount(2);
  const kambarRow = decisionRows.filter({ hasText: "Казыбаев Камбар" });
  const alinaRow = decisionRows.filter({ hasText: "Серикова Алина" });
  await kambarRow.getByRole("button", { name: "Принять", exact: true }).click();
  await alinaRow.getByRole("button", { name: "На доработку", exact: true }).click();
  await alinaRow.getByPlaceholder("Что нужно исправить или доучить?").fill(
    "Повторить партию под метроном и показать ещё раз.",
  );

  await page.getByRole("button", { name: "Отправить на проверку" }).click();
  const dialog = page.getByRole("dialog", { name: "Отправить урок на проверку?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Принять: 1 · На доработку: 1", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/0% → 75%/)).toBeVisible();

  for (const width of [320, 375, 430, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(overflow.page, `group confirmation horizontal overflow at ${width}px`)
      .toBeLessThanOrEqual(overflow.viewport);
  }
});
