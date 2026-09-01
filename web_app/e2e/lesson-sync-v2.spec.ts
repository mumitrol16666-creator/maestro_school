import { expect, test, type APIRequestContext, type Page, type Route } from "@playwright/test";

const PASSWORD = "QaMaestro2026!";
const LESSON_ID = "QA-CLASS-IND-UPCOMING";
const DRAFT_LESSON_ID = "QA-CLASS-IND-EDITABLE";

type TestSession = {
  token: string;
  user: Record<string, unknown>;
};

let adminSession: TestSession;
let teacherSession: TestSession;

async function loginSession(request: APIRequestContext, phone: string) {
  const response = await request.post("/api/v1/auth/login", {
    data: { phone, password: PASSWORD, profile: "staff" },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()).data as TestSession;
}

async function loginAdmin(page: Page) {
  await page.goto("/login");
  await page.evaluate((session) => {
    window.localStorage.setItem("maestro_access_token", session.token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(session.user));
  }, adminSession);
}

async function loginTeacher(page: Page) {
  await page.goto("/login");
  await page.evaluate((session) => {
    window.localStorage.setItem("maestro_access_token", session.token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(session.user));
  }, teacherSession);
}

async function mockClassIntegration(
  route: Route,
  state: "pending_sync" | "conflict",
) {
  const response = await route.fetch();
  const body = await response.json();
  body.data.integration = {
    state,
    source: "local_projection",
    pendingCount: state === "pending_sync" ? 1 : 0,
    conflictCount: state === "conflict" ? 1 : 0,
    attempts: 2,
    lastError: state === "pending_sync"
      ? "CRM временно недоступна"
      : "Посещаемость CRM отличается от локальной отметки",
    lastSyncedAt: null,
    report: {
      status: state,
      currentVersion: 1,
      confirmedVersion: null,
      crmConfirmedAt: null,
    },
  };
  await route.fulfill({ response, json: body });
}

async function expectNoHorizontalOverflow(page: Page) {
  for (const width of [320, 375, 430, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(dimensions.page, `lesson sync page overflow at ${width}px`)
      .toBeLessThanOrEqual(dimensions.viewport);
  }
}

async function prepareEditableLesson(request: APIRequestContext) {
  const headers = { Authorization: `Bearer ${adminSession.token}` };
  const clearedDraft = await request.delete(
    `/api/v1/admin/offline-lessons/${DRAFT_LESSON_ID}/draft`,
    { headers },
  );
  expect(clearedDraft.ok()).toBe(true);
  const cardResponse = await request.get(
    `/api/v1/admin/offline-lessons/${DRAFT_LESSON_ID}`,
    { headers },
  );
  expect(cardResponse.ok()).toBe(true);
  let status = (await cardResponse.json()).data.status as string;
  if (status === "completed") {
    const reopen = await request.post(
      `/api/v1/admin/offline-lessons/${DRAFT_LESSON_ID}/reopen`,
      { headers, data: { reason: "Локальная проверка серверного черновика" } },
    );
    expect(reopen.ok()).toBe(true);
    status = (await reopen.json()).data.status;
  }
  if (status === "pending_admin_review") {
    const returned = await request.post(
      `/api/v1/admin/offline-lessons/${DRAFT_LESSON_ID}/return-to-teacher`,
      { headers, data: { reason: "Локальная проверка серверного черновика" } },
    );
    expect(returned.ok()).toBe(true);
    status = (await returned.json()).data.status;
  }
  expect(["started", "not_filled"]).toContain(status);
}

test.beforeAll(async ({ request }) => {
  [adminSession, teacherSession] = await Promise.all([
    loginSession(request, "qa_admin"),
    loginSession(request, "qa_teacher_1"),
  ]);
});

test("pending_sync честно блокирует подтверждение и остаётся адаптивным", async ({ page }) => {
  await loginAdmin(page);
  await page.route(
    `**/api/v1/admin/offline-lessons/${LESSON_ID}`,
    (route) => mockClassIntegration(route, "pending_sync"),
  );
  await page.route("**/api/v1/admin/crm-sync-journal?crmClassId=*", (route) => route.fulfill({
    json: {
      data: {
        events: [{
          id: "00000000-0000-4000-8000-000000000101",
          eventType: "teacher_attendance",
          status: "failed",
          attempts: 2,
          lastError: "CRM временно недоступна",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }],
        conflicts: [],
      },
    },
  }));

  await page.goto(`/admin/offline-lessons/${LESSON_ID}`);
  await expect(page.getByText("Данные сохранены и будут отправлены в расписание"))
    .toBeVisible();
  await expect(page.getByText(/списание, зарплата и недельный XP не начисляются/i))
    .toBeVisible();
  await expect(page.getByText("Посещаемость от преподавателя")).toBeVisible();
  await expect(page.getByText(/Не отправлено · Попыток отправки: 2/)).toBeVisible();
  await expect(page.getByText("teacher_attendance")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /подтвердить урок/i })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("конфликт показывает куратору оба варианта решения без переполнения", async ({ page }) => {
  await loginAdmin(page);
  await page.route(
    `**/api/v1/admin/offline-lessons/${LESSON_ID}`,
    (route) => mockClassIntegration(route, "conflict"),
  );
  await page.route("**/api/v1/admin/crm-sync-journal?crmClassId=*", (route) => route.fulfill({
    json: {
      data: {
        events: [],
        conflicts: [{
          id: "00000000-0000-4000-8000-000000000102",
          outboxEventId: null,
          kind: "attendance_mismatch",
          status: "open",
          errorMessage: "CRM: присутствовал, Maestro: опоздал",
          createdAt: new Date().toISOString(),
        }],
      },
    },
  }));

  await page.goto(`/admin/offline-lessons/${LESSON_ID}`);
  await expect(page.getByText("Расписание не приняло данные урока")).toBeVisible();
  await expect(page.getByRole("button", { name: "Отправить снова" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Принять расписание" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("серверный черновик сохраняется даже без браузерного хранилища", async ({ page, request }) => {
  await prepareEditableLesson(request);
  await loginTeacher(page);
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key.startsWith("maestro:offline-lesson-report:v1:")) {
        throw new DOMException("Storage blocked", "SecurityError");
      }
      return originalSetItem.call(this, key, value);
    };
  });

  await page.goto(`/admin/offline-lessons/${DRAFT_LESSON_ID}`);
  const draftResponse = page.waitForResponse((response) => (
    response.request().method() === "PUT"
    && response.url().endsWith(`/api/v1/teachers/me/offline-lessons/${DRAFT_LESSON_ID}/draft`)
  ));
  await page.getByLabel("Тема урока").fill(`DEV-04B server draft ${Date.now()}`);
  expect((await draftResponse).ok()).toBe(true);
  await expect(page.getByText(/Черновик сохранён автоматически/)).toBeVisible();
});
