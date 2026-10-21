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

async function startedLesson(request: APIRequestContext, token: string) {
  const date = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const created = await request.post(`${CRM_URL}/api/qa/v1/lessons`, {
    headers: { "X-Maestro-QA-Secret": QA_SECRET },
    data: {
      scenarioId: `TOPIC-BONUS-${Date.now().toString(36).toUpperCase()}`,
      classType: "individual",
      studentId: "QA-STUDENT-1",
      teacherId: "QA-TEACHER-1",
      date,
      startTime: "12:00",
      endTime: "13:00",
      title: "Урок с быстрой темой",
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

/** Plans 1.5 and 1.6: a quick topic goes into the published sector; «Итог» offers the week's bonus XP. */
test("the teacher adds a topic to the open sector and gives the week's bonus from the lesson", async ({ page, request, context }) => {
  const token = await signInAsTeacher(request, context);
  const crmClassId = await startedLesson(request, token);
  await page.goto(`/admin/offline-lessons/${crmClassId}`);

  const stepper = page.getByTestId("lesson-stepper");
  const nav = page.getByTestId("lesson-step-nav");
  // Plan 1.14: a started individual lesson has no attendance step — the student came.
  await nav.getByRole("button", { name: "Далее" }).click();
  await expect(stepper).toContainText("Шаг 2 из 4");

  const title = `Быстрая тема ${Date.now().toString(36)}`;
  await page.getByRole("button", { name: "+ Добавить тему в сектор" }).click();
  await expect(page.getByText(/Тема сразу добавится в опубликованный сектор/)).toBeVisible();
  await page.getByPlaceholder(/Название темы/).fill(title);
  await page.getByRole("button", { name: "Сохранить тему в план" }).click();
  await expect(page.getByText(title).first()).toBeVisible();

  const pendingHomework = page.getByLabel(/Процент выполнения ДЗ/);
  for (let index = 0; index < await pendingHomework.count(); index += 1) {
    await pendingHomework.nth(index).fill("100");
  }
  await nav.getByRole("button", { name: "Далее" }).click();
  await expect(stepper).toContainText("Шаг 3 из 4");

  const bonus = page.getByTestId("lesson-bonus-xp");
  await expect(bonus).toContainText("Бонус XP за урок");
  const form = bonus.getByTestId("bonus-xp-form").first();
  await expect(form).toContainText("Казыбаев Камбар");
  const giveButton = form.getByRole("button", { name: "Дать бонус" });
  if (await form.getByTestId("bonus-week-limit").isVisible()) {
    await expect(giveButton).toBeDisabled();
  } else {
    await giveButton.click();
    await form.getByRole("button", { name: "+1", exact: true }).click();
    await form.getByLabel("За что бонус").fill("Сам нашёл ошибку в ритме");
    await form.getByRole("button", { name: "Начислить +1 XP" }).click();
    await expect(form.getByRole("status")).toContainText("Начислено +1 XP");
    await expect(giveButton).toBeDisabled();
  }

  // After a reload the week's limit is read from the server.
  await page.reload();
  await nav.getByRole("button", { name: "Далее" }).click();
  await nav.getByRole("button", { name: "Далее" }).click();
  await expect(stepper).toContainText("Шаг 3 из 4");
  await expect(page.getByTestId("lesson-bonus-xp").getByTestId("bonus-week-limit")).toBeVisible();
});
