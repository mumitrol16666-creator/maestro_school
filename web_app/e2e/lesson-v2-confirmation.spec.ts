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

  const clearedTeacherDraft = await request.delete(
    `/api/v1/teachers/me/offline-lessons/${crmClassId}/draft`,
    { headers: { Authorization: `Bearer ${teacherSession.token}` } },
  );
  expect(clearedTeacherDraft.ok()).toBe(true);
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
  await page.getByPlaceholder("Что отработать дома до следующего урока?").fill("");
  await page.getByRole("button", { name: "Принять", exact: true }).click();
  await page.getByRole("button", { name: "Отправить на проверку" }).click();

  const dialog = page.getByRole("dialog", { name: "Отправить урок на проверку?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("45% → 100%", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/100 баллов/)).toBeVisible();
  await expect(dialog.getByText(/100 XP/)).toHaveCount(0);
  await expect(dialog.getByText("+20 XP после подтверждения урока", { exact: true })).toBeVisible();
  await expect(dialog.getByTestId("plan-completion-reward-preview")).toHaveCount(0);
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

test("один отчёт сохраняет независимый прогресс нескольких тем", async ({ page, request }) => {
  await prepareEditableLesson(request, adminSession.token, INDIVIDUAL_LESSON_ID);
  await loginTeacher(page);
  await page.goto(`/admin/offline-lessons/${INDIVIDUAL_LESSON_ID}`);
  await closeNotificationCenter(page);

  const firstTopic = page.getByRole("button", { name: /Стабильный бой восьмыми/ });
  const secondTopic = page.getByRole("button", { name: /Чистые переходы аккордов/ });
  const progressInput = page.getByRole("spinbutton", { name: "Новый процент темы" });

  await firstTopic.click();
  await progressInput.fill("64");
  await expect(firstTopic).toContainText("45% → 64%");

  await secondTopic.click();
  await progressInput.fill("75");
  await expect(secondTopic).toContainText("0% → 75%");
  await expect(page.getByLabel("Тема урока")).toHaveValue("Стабильный бой восьмыми");

  const homeworkText = "Повторить переходы аккордов под метроном";
  await page.getByPlaceholder("Что отработать дома до следующего урока?").fill(homeworkText);
  const homeworkTopicSelect = page.getByLabel("Тема нового домашнего задания");
  await expect(homeworkTopicSelect).toHaveValue("");
  await expect(homeworkTopicSelect).toHaveAttribute("aria-invalid", "true");

  await firstTopic.click();
  await expect(progressInput).toHaveValue("64");
  await expect(page.getByText(/Черновик сохранён автоматически/)).toBeVisible();

  await page.reload();
  await closeNotificationCenter(page);
  await page.getByRole("button", { name: /Стабильный бой восьмыми/ }).click();
  await expect(page.getByRole("spinbutton", { name: "Новый процент темы" })).toHaveValue("64");
  await page.getByRole("button", { name: /Чистые переходы аккордов/ }).click();
  await expect(page.getByRole("spinbutton", { name: "Новый процент темы" })).toHaveValue("75");
  await expect(page.getByLabel("Тема нового домашнего задания")).toHaveValue("");

  const homeworkTopicOption = page.getByLabel("Тема нового домашнего задания")
    .locator("option")
    .filter({ hasText: "Чистые переходы аккордов" });
  const homeworkTopicId = await homeworkTopicOption.getAttribute("value");
  expect(homeworkTopicId).toBeTruthy();
  await page.getByLabel("Тема нового домашнего задания").selectOption(homeworkTopicId!);

  await page.getByRole("button", { name: "Принять", exact: true }).click();
  await page.getByRole("button", { name: "Отправить на проверку" }).click();

  const dialog = page.getByRole("dialog", { name: "Отправить урок на проверку?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("45% → 64%", { exact: true })).toBeVisible();
  await expect(dialog.getByText("0% → 75%", { exact: true })).toBeVisible();
  const newHomeworkPreview = dialog.getByText("Новое ДЗ", { exact: true }).locator("..");
  await expect(newHomeworkPreview.getByText("Чистые переходы аккордов", { exact: true })).toBeVisible();
  await expect(newHomeworkPreview.getByText(homeworkText, { exact: true })).toBeVisible();

  const submitResponsePromise = page.waitForResponse((incoming) => (
    incoming.request().method() === "POST"
    && incoming.url().endsWith(`/api/v1/teachers/me/offline-lessons/${INDIVIDUAL_LESSON_ID}/submit`)
  ));
  const teacherDraftDeletePromise = page.waitForResponse((incoming) => (
    incoming.request().method() === "DELETE"
    && incoming.url().endsWith(`/api/v1/teachers/me/offline-lessons/${INDIVIDUAL_LESSON_ID}/draft`)
  ));
  await dialog.getByRole("button", { name: "Отправить на проверку" }).click();
  const submitResponse = await submitResponsePromise;
  expect(submitResponse.ok()).toBe(true);
  expect((await teacherDraftDeletePromise).ok()).toBe(true);
  const submitted = submitResponse.request().postDataJSON() as {
    learningResultsV2?: {
      homeworkAssignment?: { topicId: string; instructions: string };
      topicUpdates: Array<{
        topicId: string;
        expectedPercent: number | null;
        toPercent: number;
      }>;
    };
  };
  expect(submitted.learningResultsV2?.topicUpdates).toEqual([
    expect.objectContaining({ expectedPercent: 45, toPercent: 64 }),
    expect.objectContaining({ expectedPercent: 0, toPercent: 75 }),
  ]);
  expect(submitted.learningResultsV2?.homeworkAssignment).toEqual({
    topicId: homeworkTopicId,
    instructions: homeworkText,
  });

  const teacherDraftHeaders = { Authorization: `Bearer ${teacherSession.token}` };
  const clearedTeacherDraft = await request.delete(
    `/api/v1/teachers/me/offline-lessons/${INDIVIDUAL_LESSON_ID}/draft`,
    { headers: teacherDraftHeaders },
  );
  expect(clearedTeacherDraft.ok()).toBe(true);
  const staleTeacherDraft = await request.put(
    `/api/v1/teachers/me/offline-lessons/${INDIVIDUAL_LESSON_ID}/draft`,
    {
      headers: teacherDraftHeaders,
      data: {
        expectedRevision: 0,
        payload: {
          form: {
            learningV2ReportVersion: null,
            learningV2Draft: {
              topicId: submitted.learningResultsV2?.topicUpdates[0]?.topicId,
              expectedPercent: 45,
              toPercent: 64,
              topicComment: "",
              homeworkDecisions: {},
            },
          },
        },
      },
    },
  );
  expect(staleTeacherDraft.ok()).toBe(true);

  const legacyAdminDraft = await request.put(
    `/api/v1/admin/offline-lessons/${INDIVIDUAL_LESSON_ID}/draft`,
    {
      headers: { Authorization: `Bearer ${adminSession.token}` },
      data: {
        expectedRevision: 0,
        payload: {
          form: {
            learningV2Draft: {
              topicId: submitted.learningResultsV2?.topicUpdates[0]?.topicId,
              expectedPercent: 45,
              toPercent: 64,
              topicComment: "",
              homeworkDecisions: {},
            },
          },
        },
      },
    },
  );
  expect(legacyAdminDraft.ok()).toBe(true);

  await page.route(
    `**/api/v1/admin/offline-lessons/${INDIVIDUAL_LESSON_ID}/students`,
    async (route) => {
      const response = await route.fetch();
      const body = await response.json() as {
        data?: {
          learningV2?: {
            plans?: Array<{ topics?: Array<{ id: string }> }>;
          };
        };
      };
      for (const plan of body.data?.learningV2?.plans ?? []) {
        plan.topics = plan.topics?.filter((topic) => topic.id !== homeworkTopicId);
      }
      await route.fulfill({
        response,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );

  await page.evaluate((session) => {
    window.localStorage.setItem("maestro_access_token", session.token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(session.user));
  }, adminSession);
  await page.goto(`/admin/offline-lessons/${INDIVIDUAL_LESSON_ID}`);
  await closeNotificationCenter(page);

  await page.getByRole("button", { name: /Стабильный бой восьмыми/ }).click();
  await expect(page.getByRole("spinbutton", { name: "Новый процент темы" })).toHaveValue("64");
  await expect(page.getByRole("button", { name: /Чистые переходы аккордов/ })).toHaveCount(0);
  await expect(page.getByLabel("Тема нового домашнего задания")).toHaveValue(homeworkTopicId!);
  await expect(page.getByLabel("Тема нового домашнего задания").locator(
    `option[value="${homeworkTopicId}"]`,
  )).toHaveText("Тема из отправленного отчёта");

  await page.route(
    `**/api/v1/admin/offline-lessons/${INDIVIDUAL_LESSON_ID}/approve`,
    async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {} }) });
    },
  );
  const approveResponsePromise = page.waitForResponse((incoming) => (
    incoming.request().method() === "POST"
    && incoming.url().endsWith(`/api/v1/admin/offline-lessons/${INDIVIDUAL_LESSON_ID}/approve`)
  ));
  await page.getByRole("button", { name: "Подтвердить урок" }).click();
  const approveResponse = await approveResponsePromise;
  expect(approveResponse.ok()).toBe(true);
  await expect(page.getByText("Урок подтверждён", { exact: true })).toBeVisible();
  const approved = approveResponse.request().postDataJSON() as {
    learningResultsV2?: {
      homeworkAssignment?: { topicId: string; instructions: string };
      topicUpdates: Array<{ expectedPercent: number | null; toPercent: number }>;
    };
  };
  expect(approved.learningResultsV2?.topicUpdates).toEqual([
    expect.objectContaining({ expectedPercent: 45, toPercent: 64 }),
    expect.objectContaining({ expectedPercent: 0, toPercent: 75 }),
  ]);
  expect(approved.learningResultsV2?.homeworkAssignment).toEqual({
    topicId: homeworkTopicId,
    instructions: homeworkText,
  });

  const returned = await request.post(
    `/api/v1/admin/offline-lessons/${INDIVIDUAL_LESSON_ID}/return-to-teacher`,
    {
      headers: { Authorization: `Bearer ${adminSession.token}` },
      data: { reason: "Завершение локальной multi-topic проверки" },
    },
  );
  expect(returned.ok()).toBe(true);

  await page.evaluate((session) => {
    window.localStorage.setItem("maestro_access_token", session.token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(session.user));
  }, teacherSession);
  await page.goto(`/admin/offline-lessons/${INDIVIDUAL_LESSON_ID}`);
  await closeNotificationCenter(page);
  await page.getByRole("button", { name: /Стабильный бой восьмыми/ }).click();
  await expect(page.getByRole("spinbutton", { name: "Новый процент темы" })).toHaveValue("64");
  await page.getByRole("button", { name: /Чистые переходы аккордов/ }).click();
  await expect(page.getByRole("spinbutton", { name: "Новый процент темы" })).toHaveValue("75");
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
  await page.getByRole("button", { name: "100% · Освоено" }).click();
  await page.getByPlaceholder("Что отработать дома до следующего урока?").fill("");

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
  await expect(dialog.getByText(/0% → 100%/)).toBeVisible();
  await expect(dialog.getByTestId("plan-completion-reward-preview")).toContainText(
    "+250 учебных баллов",
  );

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
