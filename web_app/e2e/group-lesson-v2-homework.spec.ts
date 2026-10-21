import { expect, test } from "@playwright/test";

/**
 * A V2 group lesson checks the previous homework with a percent on the topics step only; the old
 * CRM group check (Выполнено / Частично / Нет) is not shown on the attendance step any more.
 */
const PASSWORD = "QaMaestro2026!";
const CRM_URL = process.env.QA_CRM_URL ?? "http://127.0.0.1:5002";
const QA_SECRET = process.env.QA_CONTROLLER_SECRET ?? "local-maestro-qa-controller-2026";

test("a V2 group lesson has no old done / partly / not homework check", async ({ page, request, context }) => {
  const login = await request.post("/api/v1/auth/login", { data: { phone: "qa_teacher_1", password: PASSWORD, profile: "staff" } });
  expect(login.ok(), await login.text()).toBe(true);
  const session = (await login.json()).data as { token: string; user: unknown };
  const date = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const created = await request.post(`${CRM_URL}/api/qa/v1/lessons`, {
    headers: { "X-Maestro-QA-Secret": QA_SECRET },
    data: { scenarioId: `GROUP-HW-${Date.now().toString(36).toUpperCase()}`, classType: "group", groupId: "QA-GROUP-1", teacherId: "QA-TEACHER-1", date, startTime: "18:00", endTime: "19:00", title: `Ансамбль ${Date.now().toString(36)}` },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const crmClassId = (await created.json()).data.class.crmClassId as string;
  const started = await request.post(`/api/v1/teachers/me/offline-lessons/${crmClassId}/start`, { headers: { Authorization: `Bearer ${session.token}` }, data: {} });
  expect(started.ok(), await started.text()).toBe(true);

  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, session);
  await page.goto(`/admin/offline-lessons/${crmClassId}`);
  const nav = page.getByTestId("lesson-step-nav");
  await nav.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByTestId("lesson-stepper")).toContainText("Шаг 2 из 5");
  await expect(page.getByRole("heading", { name: "Посещаемость группы" })).toBeVisible();
  await expect(page.getByText("Домашнее задание проверяется на шаге «ДЗ и темы».")).toBeVisible();
  await expect(page.getByText("На прошлых групповых уроках домашнее задание не найдено.")).toHaveCount(0);
  await expect(page.getByRole("group", { name: /Проверка ДЗ для/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Частично", exact: true })).toHaveCount(0);
});
