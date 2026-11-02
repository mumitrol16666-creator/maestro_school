import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { startQaLessonForTeacher } from "./qa-start";

/**
 * 01.11 (Vladislav), lesson clean-up step 1: a group lesson marks attendance with one checkbox per
 * student (no «Опоздал», no «Другой статус»; not ticked = did not come, the admin decides the kind
 * of absence in CRM), and the admin «за преподавателя» has the same single «Отменить урок».
 */
const PASSWORD = "QaMaestro2026!";
const CRM_URL = process.env.QA_CRM_URL ?? "http://127.0.0.1:5002";
const QA_SECRET = process.env.QA_CONTROLLER_SECRET ?? "local-maestro-qa-controller-2026";
const yesterday = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const run = Date.now().toString(36).toUpperCase();

async function signIn(request: APIRequestContext, context: BrowserContext, phone: string) {
  const login = await request.post("/api/v1/auth/login", { data: { phone, password: PASSWORD, profile: "staff" } });
  expect(login.ok(), await login.text()).toBe(true);
  const session = (await login.json()).data as { token: string; user: unknown };
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, session);
  return session.token;
}

async function lesson(request: APIRequestContext, input: { group?: string; student?: string; name: string; startTime: string; endTime: string }) {
  const created = await request.post(`${CRM_URL}/api/qa/v1/lessons`, {
    headers: { "X-Maestro-QA-Secret": QA_SECRET },
    data: {
      scenarioId: `ATT-${input.name}-${run}`,
      classType: input.group ? "group" : "individual",
      ...(input.group ? { groupId: input.group } : { studentId: input.student }),
      teacherId: "QA-TEACHER-1",
      date: yesterday(),
      startTime: input.startTime,
      endTime: input.endTime,
      title: `Посещаемость ${input.name} ${run}`,
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  return (await created.json()).data.class.crmClassId as string;
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe.configure({ mode: "serial" });

test("a group lesson: one checkbox per student, an unticked student leaves as «Не пришёл»", async ({ page, request, context }, testInfo) => {
  const token = await signIn(request, context, "qa_teacher_1");
  const crmClassId = await lesson(request, { group: "QA-GROUP-1", name: "G", startTime: "19:00", endTime: "19:45" });
  await startQaLessonForTeacher(request, crmClassId);
  await page.goto(`/admin/offline-lessons/${crmClassId}`);

  const nav = page.getByTestId("lesson-step-nav");
  await nav.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByTestId("lesson-stepper")).toContainText("Шаг 2 из 5");
  const checkboxes = page.getByRole("checkbox", { name: /^Пришёл: / });
  await expect(checkboxes).toHaveCount(3);
  await expect(page.getByRole("combobox", { name: /Особый статус/ })).toHaveCount(0);
  await expect(page.getByText("Опоздал", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Не отмечен — не пришёл")).toBeVisible();
  // Nobody ticked: the lesson is not sent as an absence — the stepper asks for the ticks (or «Отменить урок»).
  await expect(page.getByTestId("lesson-stepper")).toContainText("Отметьте, кто пришёл");
  await expect(page.getByRole("button", { name: "Передать отметку об отсутствии" })).toHaveCount(0);
  await page.getByRole("button", { name: "Все присутствуют" }).click();
  await expect(page.getByTestId("lesson-stepper")).not.toContainText("Отметьте, кто пришёл");
  await checkboxes.nth(2).uncheck();
  await expect(page.getByText("Присутствовали 2/3")).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: testInfo.outputPath(`group-attendance-${testInfo.project.name}.png`), fullPage: false });

  await nav.getByRole("button", { name: "Далее" }).click();
  const homework = page.getByLabel(/Процент выполнения ДЗ/);
  for (let index = 0; index < await homework.count(); index += 1) await homework.nth(index).fill("100");
  await nav.getByRole("button", { name: "Далее" }).click();
  await page.getByPlaceholder("Какую песню или тему разбирали сегодня?").fill("Ансамбль");
  await page.getByPlaceholder("Что получилось, что разобрали, какой результат занятия?").fill("Сыграли вместе");
  await nav.getByRole("button", { name: "К предпросмотру" }).click();
  await page.getByRole("button", { name: "Отправить на проверку" }).click();
  const confirm = page.getByRole("dialog", { name: "Отправить урок на проверку?" });
  await expect(confirm).toContainText("Присутствовали");
  await expect(confirm.getByText("2", { exact: true })).toBeVisible();
  await expect(confirm.getByText("Опоздали", { exact: false })).toHaveCount(0);
  await confirm.getByRole("button", { name: "Отправить на проверку" }).click();
  await expect(page).toHaveURL(/\/admin\/offline-lessons$/);

  const roster = await request.get(`/api/v1/teachers/me/offline-lessons/${crmClassId}/students`, { headers: { Authorization: `Bearer ${token}` } });
  const students = (await roster.json()).data.students as Array<{ attendanceStatus: string }>;
  expect(students.map((student) => student.attendanceStatus).sort()).toEqual(["present", "present", "unexcused_absence"]);
});

test("the admin «за преподавателя» has the same single «Отменить урок», and it sends the absence", async ({ page, request, context }) => {
  const token = await signIn(request, context, "qa_admin");
  const crmClassId = await lesson(request, { student: "QA-STUDENT-2", name: "A", startTime: "20:00", endTime: "20:45" });
  await startQaLessonForTeacher(request, crmClassId);
  await page.goto(`/admin/offline-lessons/${crmClassId}`);

  await expect(page.getByText("Вы работаете за преподавателя")).toBeVisible();
  // One student: no attendance step, the student counts as present from the start.
  await expect(page.getByTestId("lesson-stepper")).toContainText("Шаг 1 из 4");
  await expect(page.getByTestId("lesson-auto-present")).toBeVisible();
  await expect(page.getByRole("button", { name: "Урок не состоялся" })).toHaveCount(0);
  await expect(page.getByText("Начали по ошибке или урок не состоялся?")).toBeVisible();
  await page.getByRole("button", { name: "Отменить урок" }).click();
  const dialog = page.getByRole("dialog", { name: "Отменить урок?" });
  await expect(dialog).toContainText("по умолчанию это прогул");
  await dialog.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page.getByText("Преподаватель отметил отсутствие ученика")).toBeVisible({ timeout: 15_000 });

  const card = await request.get(`/api/v1/admin/offline-lessons/${crmClassId}`, { headers: { Authorization: `Bearer ${token}` } });
  const lessonCard = (await card.json()).data as { status: string; teacherOutcomeHint: string | null };
  expect(lessonCard.status).toBe("pending_admin_review");
  expect(lessonCard.teacherOutcomeHint).toBe("no_submission");
  const roster = await request.get(`/api/v1/admin/offline-lessons/${crmClassId}/students`, { headers: { Authorization: `Bearer ${token}` } });
  const students = (await roster.json()).data.students as Array<{ attendanceStatus: string }>;
  expect(students.map((student) => student.attendanceStatus)).toEqual(["unexcused_absence"]);
});
