import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { startQaLessonForTeacher } from "./qa-start";

/**
 * 01.11 (Vladislav), lesson clean-up step 2: a topic is renamed or removed right from the lesson,
 * the teacher sees the student's last homework checks before the lesson, the student card has
 * «История ДЗ» and «Секторы», a group strip is one line per student, and «Цель урока» /
 * «Продолжить тему» are gone; homework without a topic is allowed.
 */
const PASSWORD = "QaMaestro2026!";
const CRM_URL = process.env.QA_CRM_URL ?? "http://127.0.0.1:5002";
const QA_SECRET = process.env.QA_CONTROLLER_SECRET ?? "local-maestro-qa-controller-2026";
const yesterday = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const run = Date.now().toString(36).toUpperCase();

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

async function lesson(request: APIRequestContext, input: { group?: string; student?: string; name: string; startTime: string; endTime: string }) {
  const created = await request.post(`${CRM_URL}/api/qa/v1/lessons`, {
    headers: { "X-Maestro-QA-Secret": QA_SECRET },
    data: {
      scenarioId: `TOP-${input.name}-${run}`,
      classType: input.group ? "group" : "individual",
      ...(input.group ? { groupId: input.group } : { studentId: input.student }),
      teacherId: "QA-TEACHER-1",
      date: yesterday(),
      startTime: input.startTime,
      endTime: input.endTime,
      title: `Темы ${input.name} ${run}`,
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const crmClassId = (await created.json()).data.class.crmClassId as string;
  await startQaLessonForTeacher(request, crmClassId);
  return crmClassId;
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe.configure({ mode: "serial" });

test("a topic is renamed and removed from the lesson; last homework checks are on step 1; no goal field", async ({ page, request, context }, testInfo) => {
  await signIn(request, context);
  const crmClassId = await lesson(request, { student: "QA-STUDENT-1", name: "I", startTime: "16:00", endTime: "16:45" });
  await page.goto(`/admin/offline-lessons/${crmClassId}`);

  // Step 1: the student's last homework with the teacher's percent.
  await expect(page.getByTestId("lesson-recent-homework")).toBeVisible();
  await expect(page.getByTestId("lesson-recent-homework")).toContainText("Последние ДЗ");
  await expect(page.getByText(/Продолжить тему/)).toHaveCount(0);

  const nav = page.getByTestId("lesson-step-nav");
  await nav.getByRole("button", { name: "Далее" }).click();
  // A fresh topic from the quick form, so the QA sector keeps its own topics.
  await page.getByRole("button", { name: "+ Добавить тему в сектор" }).click();
  await page.getByPlaceholder(/Название темы/).fill(`Временная тема ${run}`);
  await page.getByRole("button", { name: "Сохранить тему в план" }).click();
  const chip = page.getByTestId("lesson-topic-option").filter({ hasText: `Временная тема ${run}` });
  await expect(chip).toHaveCount(1);

  // Rename from the topic menu.
  await page.getByRole("button", { name: `Действия с темой «Временная тема ${run}»` }).click();
  await page.getByTestId("lesson-topic-menu").getByRole("menuitem", { name: "Переименовать" }).click();
  const rename = page.getByTestId("lesson-topic-rename");
  await rename.getByLabel("Название темы").fill(`Новая тема ${run}`);
  await rename.getByLabel("Критерий освоения").fill("Играет без остановок");
  await rename.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByTestId("lesson-topic-option").filter({ hasText: `Новая тема ${run}` })).toHaveCount(1);
  await expect(page.getByTestId("lesson-topic-option").filter({ hasText: `Временная тема ${run}` })).toHaveCount(0);
  await noHorizontalScroll(page);
  await page.screenshot({ path: testInfo.outputPath(`topic-menu-${testInfo.project.name}.png`), fullPage: false });

  // Remove: a topic without progress leaves the sector.
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: `Действия с темой «Новая тема ${run}»` }).click();
  await page.getByTestId("lesson-topic-menu").getByRole("menuitem", { name: "Убрать из сектора" }).click();
  await expect(page.getByTestId("lesson-topic-option").filter({ hasText: `Новая тема ${run}` })).toHaveCount(0);
  // A topic with progress cannot be removed into nothing: the menu offers it, the confirm says it is deferred.
  await expect(page.getByTestId("lesson-topic-option").first()).toBeVisible();

  // Step 3: no «Цель урока»; homework without a topic is allowed.
  const homework = page.getByLabel(/Процент выполнения ДЗ/);
  for (let index = 0; index < await homework.count(); index += 1) await homework.nth(index).fill("100");
  await nav.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByText("Цель урока", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Фокус следующего урока")).toBeVisible();
  await page.getByPlaceholder("Что отработать дома до следующего урока?").fill("Повторить куплет");
  await expect(page.getByTestId("learning-homework-no-topic")).toBeVisible();
  await expect(page.getByText("Выберите тему перед отправкой")).toHaveCount(0);
  await page.getByPlaceholder("Какую песню или тему разбирали сегодня?").fill("Куплет");
  await page.getByPlaceholder("Что получилось, что разобрали, какой результат занятия?").fill("Разобрали куплет");
  await nav.getByRole("button", { name: "К предпросмотру" }).click();
  await expect(page.getByRole("button", { name: "Отправить на проверку" })).toBeEnabled();
});

test("the student card has «История ДЗ» and «Секторы»", async ({ page, request, context }, testInfo) => {
  await signIn(request, context);
  await page.goto("/admin/my-students/student/QA-STUDENT-1");
  const card = page.getByTestId("student-workspace-card");
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "История ДЗ" }).click();
  const history = page.getByTestId("homework-history");
  await expect(history).toContainText("Все домашние задания");
  await expect(history.getByRole("listitem").first()).toBeVisible();
  await card.getByRole("button", { name: "Секторы" }).click();
  const sectors = page.getByTestId("sectors-history");
  await expect(sectors).toContainText("Открытые");
  await expect(sectors).toContainText("Пройденные");
  await noHorizontalScroll(page);
  await page.screenshot({ path: testInfo.outputPath(`card-history-${testInfo.project.name}.png`), fullPage: false });
});

test("a group strip is one line per student and opens on request", async ({ page, request, context }, testInfo) => {
  await signIn(request, context);
  const crmClassId = await lesson(request, { group: "QA-GROUP-1", name: "G", startTime: "17:00", endTime: "17:45" });
  await page.goto(`/admin/offline-lessons/${crmClassId}`);
  const items = page.getByTestId("lesson-student-strip-item");
  await expect(items).toHaveCount(3);
  await expect(page.getByTestId("strip-row-summary")).toHaveCount(3);
  await expect(page.getByTestId("strip-league")).toHaveCount(0);
  await page.getByRole("button", { name: /^Подробнее: / }).first().click();
  await expect(page.getByTestId("strip-league")).toHaveCount(1);
  await expect(page.getByTestId("strip-row-summary")).toHaveCount(2);
  await noHorizontalScroll(page);
  await page.screenshot({ path: testInfo.outputPath(`group-strip-${testInfo.project.name}.png`), fullPage: false });
  // The group attendance row has no learning-result arrow in a V2 lesson.
  await page.getByTestId("lesson-step-nav").getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("button", { name: /^Учебный результат: / })).toHaveCount(0);
});
