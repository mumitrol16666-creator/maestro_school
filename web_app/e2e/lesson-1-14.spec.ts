import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

/**
 * Plan 1.14: the teacher's lesson — the student strip with every figure and «Статистика ученика»,
 * four steps for an individual lesson (starting it means the student came), phrases from the
 * lesson itself, own phrases, nothing hidden on «Итог и ДЗ», «Отменить урок» and a sector opened
 * from the lesson.
 */
const PASSWORD = "QaMaestro2026!";
const CRM_URL = process.env.QA_CRM_URL ?? "http://127.0.0.1:5002";
const QA_SECRET = process.env.QA_CONTROLLER_SECRET ?? "local-maestro-qa-controller-2026";
const yesterday = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function signIn(request: APIRequestContext, context: BrowserContext) {
  const login = await request.post("/api/v1/auth/login", { data: { phone: "qa_teacher_1", password: PASSWORD, profile: "staff" } });
  expect(login.ok(), await login.text()).toBe(true);
  const session = (await login.json()).data as { token: string; user: unknown };
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, session);
  return session.token;
}

async function lesson(request: APIRequestContext, token: string, input: { student?: string; group?: string; start: boolean; time: string }) {
  const run = `${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`;
  const created = await request.post(`${CRM_URL}/api/qa/v1/lessons`, {
    headers: { "X-Maestro-QA-Secret": QA_SECRET },
    data: {
      scenarioId: `L114-${run}`,
      classType: input.group ? "group" : "individual",
      ...(input.group ? { groupId: input.group } : { studentId: input.student }),
      teacherId: "QA-TEACHER-1",
      date: yesterday(),
      startTime: input.time,
      endTime: `${String(Number(input.time.slice(0, 2)) + 1).padStart(2, "0")}:${input.time.slice(3)}`,
      title: `Урок 1.14 ${run}`,
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const crmClassId = (await created.json()).data.class.crmClassId as string;
  if (input.start) {
    const started = await request.post(`/api/v1/teachers/me/offline-lessons/${crmClassId}/start`, { headers: { Authorization: `Bearer ${token}` }, data: {} });
    expect(started.ok(), await started.text()).toBe(true);
  }
  return crmClassId;
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe.configure({ mode: "serial" });

test("an individual lesson: strip, four steps, phrases from the lesson, nothing hidden", async ({ page, request, context }, testInfo) => {
  const token = await signIn(request, context);
  const crmClassId = await lesson(request, token, { student: "QA-STUDENT-1", start: true, time: "08:00" });
  await page.goto(`/admin/offline-lessons/${crmClassId}`);

  const strip = page.getByTestId("lesson-student-strip");
  await expect(strip).toContainText("Казыбаев Камбар");
  for (const label of ["Сектор", "Лига недели", "Серия", "Ступень", "Посещения"]) await expect(strip).toContainText(label);
  await expect(strip.getByTestId("strip-sector")).toContainText("%");
  await expect(strip).toContainText("LEVEL");
  await strip.getByRole("button", { name: "Статистика ученика: Казыбаев Камбар" }).click();
  await expect(page.getByTestId("student-workspace-drawer")).toBeVisible();
  await page.getByRole("button", { name: "Закрыть карточку" }).click();

  const stepper = page.getByTestId("lesson-stepper");
  await expect(stepper).toContainText("Шаг 1 из 4: Перед уроком");
  await expect(stepper.getByRole("button", { name: /Посещаемость/ })).toHaveCount(0);
  await expect(page.getByTestId("lesson-auto-present")).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: testInfo.outputPath("step-1.png"), fullPage: true });

  const nav = page.getByTestId("lesson-step-nav");
  await nav.getByRole("button", { name: "Далее" }).click();
  await expect(stepper).toContainText("Шаг 2 из 4: ДЗ и темы");
  const pendingHomework = page.getByLabel(/Процент выполнения ДЗ/);
  for (let index = 0; index < await pendingHomework.count(); index += 1) await pendingHomework.nth(index).fill("70");
  await page.getByRole("button", { name: /Чистые переходы аккордов/ }).first().click();
  await page.getByLabel("Новый процент темы").fill("30");

  await nav.getByRole("button", { name: "Далее" }).click();
  await expect(stepper).toContainText("Шаг 3 из 4: Итог и новое ДЗ");
  await expect(page.getByPlaceholder("Какую песню или тему разбирали сегодня?")).toHaveValue("Чистые переходы аккордов");
  const summaryHints = page.getByTestId("lesson-summary-hints");
  await expect(summaryHints).toContainText("Отработали «Чистые переходы аккордов»: 0 → 30 %");
  await expect(summaryHints).not.toContainText("распевки");
  await summaryHints.getByRole("button", { name: /Отработали «Чистые переходы аккордов»/ }).click();
  const summary = page.getByPlaceholder("Что получилось, что разобрали, какой результат занятия?");
  await expect(summary).toHaveValue("Отработали «Чистые переходы аккордов»: 0 → 30 %");
  if (await pendingHomework.count()) await expect(summaryHints).toContainText("Проверили домашнее задание: 70 %");

  // Nothing hidden: materials, goal, next focus and the admin comment are on the step already.
  const details = page.getByTestId("lesson-details");
  for (const label of ["Цель урока", "Фокус следующего урока", "Материалы и ссылки", "Комментарий для админа"]) {
    await expect(details.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByText(/Дополнительные детали/)).toHaveCount(0);

  await page.locator("#learning-homework-topic").selectOption({ label: "Чистые переходы аккордов" });
  const homeworkHints = page.getByTestId("lesson-homework-hints");
  await expect(homeworkHints).toContainText("«Чистые переходы аккордов»: Не менее восьми чистых переходов из десяти");
  await homeworkHints.getByRole("button", { name: /Не менее восьми чистых переходов/ }).click();
  await expect(page.getByPlaceholder("Что отработать дома до следующего урока?")).toHaveValue("«Чистые переходы аккордов»: Не менее восьми чистых переходов из десяти");

  // Own phrase: saved from the field, offered next time, removable.
  const ownText = `Мой итог ${Date.now().toString(36)}`;
  await summary.fill(ownText);
  await summaryHints.getByRole("button", { name: "Сохранить текст как мой шаблон" }).click();
  await expect(summaryHints.getByRole("button", { name: `+ ${ownText}` })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("step-3.png"), fullPage: true });
  await summaryHints.getByRole("button", { name: `Удалить шаблон: ${ownText}` }).click();
  await expect(summaryHints.getByRole("button", { name: `+ ${ownText}` })).toHaveCount(0);
  await noHorizontalScroll(page);

  await nav.getByRole("button", { name: "К предпросмотру" }).click();
  await expect(stepper).toContainText("Шаг 4 из 4");
  await expect(page.getByTestId("lesson-report-preview")).toContainText("1 был");
  await expect(page.getByRole("button", { name: "Отправить на проверку" })).toBeEnabled();
});

test("«Отменить урок» from the start window sends the student as absent to the admin", async ({ page, request, context }) => {
  const token = await signIn(request, context);
  const crmClassId = await lesson(request, token, { student: "QA-STUDENT-1", start: false, time: "06:00" });
  await page.goto(`/admin/offline-lessons/${crmClassId}`);
  await page.getByRole("button", { name: "Отменить урок" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Отменить урок?" });
  await expect(dialog).toContainText("по умолчанию это прогул");
  await expect(dialog.getByRole("button", { name: "Подтвердить" })).toBeEnabled();
  await dialog.getByLabel("Причина (необязательно)").fill("Ученик не пришёл и не предупредил");
  await dialog.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page.getByText("Преподаватель отметил отсутствие ученика")).toBeVisible({ timeout: 15_000 });

  const card = await request.get(`/api/v1/teachers/me/offline-lessons/${crmClassId}/students`, { headers: { Authorization: `Bearer ${token}` } });
  const students = (await card.json()).data.students as Array<{ attendanceStatus: string; teacherNote: string | null }>;
  expect(students[0].attendanceStatus).toBe("unexcused_absence");
  expect(students[0].teacherNote).toBe("Ученик не пришёл и не предупредил");
});

test("a group lesson keeps attendance as a step and shows every member in the strip", async ({ page, request, context }) => {
  const token = await signIn(request, context);
  const crmClassId = await lesson(request, token, { group: "QA-GROUP-1", start: true, time: "07:00" });
  await page.goto(`/admin/offline-lessons/${crmClassId}`);
  await expect(page.getByTestId("lesson-stepper")).toContainText("Шаг 1 из 5");
  await expect(page.getByTestId("lesson-student-strip-item")).toHaveCount(3);
  await expect(page.getByTestId("lesson-auto-present")).toHaveCount(0);
  await noHorizontalScroll(page);
});

test("without a sector the teacher opens one from the lesson", async ({ page, request, context }) => {
  const token = await signIn(request, context);
  const crmClassId = await lesson(request, token, { student: "QA-STUDENT-3", start: true, time: "05:00" });
  await page.goto(`/admin/offline-lessons/${crmClassId}`);
  await page.getByTestId("lesson-step-nav").getByRole("button", { name: "Далее" }).click();
  await expect(page.getByText("Сектор ещё не открыт")).toBeVisible();
  await page.getByRole("button", { name: "Открыть сектор" }).click();
  const drawer = page.getByTestId("lesson-sector-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText(/Открываем сектор|Сектор/);
  await drawer.getByRole("button", { name: "Закрыть сектор" }).click();
  await expect(drawer).toHaveCount(0);
});

test("an admin adds a school phrase and the teacher sees it in the lesson", async ({ page, request, browser }) => {
  const phrase = `Школьная фраза ${Date.now().toString(36)}`;
  const adminLogin = await request.post("/api/v1/auth/login", { data: { phone: "qa_admin", password: PASSWORD, profile: "staff" } });
  expect(adminLogin.ok(), await adminLogin.text()).toBe(true);
  const admin = (await adminLogin.json()).data as { token: string; user: unknown };
  const adminContext = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
  await adminContext.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, admin);
  const adminPage = await adminContext.newPage();
  await adminPage.goto("/admin/lesson-templates");
  await expect(adminPage.getByRole("heading", { name: "Шаблоны урока" })).toBeVisible();
  const homeworkBlock = adminPage.getByTestId("lesson-templates-homework");
  await homeworkBlock.getByLabel("Новая фраза: Домашнее задание").fill(phrase);
  await homeworkBlock.getByRole("button", { name: "Добавить" }).click();
  await expect(homeworkBlock.getByLabel(`Фраза: ${phrase}`)).toBeVisible();
  await adminContext.close();

  const teacherContext = page.context();
  const token = await signIn(request, teacherContext);
  const crmClassId = await lesson(request, token, { student: "QA-STUDENT-1", start: true, time: "04:00" });
  await page.goto(`/admin/offline-lessons/${crmClassId}`);
  const nav = page.getByTestId("lesson-step-nav");
  await nav.getByRole("button", { name: "Далее" }).click();
  await nav.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByTestId("lesson-homework-hints")).toContainText(phrase);

  const list = await request.get("/api/v1/admin/lesson-templates", { headers: { Authorization: `Bearer ${admin.token}` } });
  for (const item of (await list.json()).data as Array<{ id: string; text: string }>) {
    if (item.text === phrase) await request.delete(`/api/v1/admin/lesson-templates/${item.id}`, { headers: { Authorization: `Bearer ${admin.token}` } });
  }
});
