import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

const PASSWORD = "QaMaestro2026!";
const CRM_URL = process.env.QA_CRM_URL ?? "http://127.0.0.1:5002";
const QA_SECRET = process.env.QA_CONTROLLER_SECRET ?? "local-maestro-qa-controller-2026";

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
  return payload.data.token as string;
}

/** A started individual lesson of yesterday, created through the CRM QA controller. */
async function startedLesson(request: APIRequestContext, token: string) {
  const date = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const created = await request.post(`${CRM_URL}/api/qa/v1/lessons`, {
    headers: { "X-Maestro-QA-Secret": QA_SECRET },
    data: {
      scenarioId: `STEPS-${Date.now().toString(36).toUpperCase()}`,
      classType: "individual",
      studentId: "QA-STUDENT-1",
      teacherId: "QA-TEACHER-1",
      date,
      startTime: "10:00",
      endTime: "11:00",
      title: "Урок по шагам",
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const crmClassId = (await created.json()).data.class.crmClassId as string;
  const started = await request.post(`/api/v1/teachers/me/offline-lessons/${crmClassId}/start`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {},
  });
  expect(started.ok(), await started.text()).toBe(true);
  return crmClassId;
}

test("the teacher fills a learning lesson in five steps and sees the preview before sending", async ({ page, request, context }) => {
  const token = await signInAsTeacher(request, context);
  const crmClassId = await startedLesson(request, token);
  await page.goto(`/admin/offline-lessons/${crmClassId}`);

  const stepper = page.getByTestId("lesson-stepper");
  await expect(stepper).toBeVisible();
  await expect(stepper).toContainText("Шаг 1 из 5");
  await expect(page.getByTestId("lesson-context-step")).toContainText("Казыбаев Камбар");
  await expect(page.getByRole("button", { name: "Открыть карточку: Казыбаев Камбар" })).toBeVisible();

  const nav = page.getByTestId("lesson-step-nav");
  await nav.getByRole("button", { name: "Далее" }).click();
  await expect(stepper).toContainText("Шаг 2 из 5");
  await expect(stepper).toContainText("Не отмечено: 1");
  await page.getByRole("radio", { name: "Присутствовал" }).or(page.getByText("Присутствовал", { exact: true })).first().click();
  await expect(stepper).not.toContainText("Не отмечено");

  await nav.getByRole("button", { name: "Далее" }).click();
  await expect(stepper).toContainText("Шаг 3 из 5");
  await expect(page.getByText("Прогресс тем", { exact: true })).toBeVisible();

  await nav.getByRole("button", { name: "Далее" }).click();
  await expect(stepper).toContainText("Шаг 4 из 5");
  await page.getByPlaceholder("Какую песню или тему разбирали сегодня?").fill("Бой шестёркой");
  await page.getByPlaceholder("Что получилось, что разобрали, какой результат занятия?").fill("Разобрали бой шестёркой");

  await nav.getByRole("button", { name: "К предпросмотру" }).click();
  await expect(stepper).toContainText("Шаг 5 из 5");
  const preview = page.getByTestId("lesson-report-preview");
  await expect(preview).toContainText("1 был");
  await expect(preview).toContainText("Бой шестёркой");
  await expect(preview).toContainText("без домашнего задания");
  await expect(page.getByRole("button", { name: "Отправить на проверку" })).toBeEnabled();

  // Earlier steps stay reachable from the stepper itself.
  await stepper.getByRole("button", { name: /Посещаемость/ }).click();
  await expect(stepper).toContainText("Шаг 2 из 5");
});
