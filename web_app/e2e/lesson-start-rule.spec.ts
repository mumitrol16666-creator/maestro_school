import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

/**
 * 31.10 (Vladislav): a teacher does not start a new lesson while an earlier one ended without a
 * sent report — otherwise the topics start from old percents and the reports collide. A lesson
 * that follows a sent but not yet approved one continues the topics from that report.
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

async function lesson(request: APIRequestContext, name: string, startTime: string, endTime: string) {
  const created = await request.post(`${CRM_URL}/api/qa/v1/lessons`, {
    headers: { "X-Maestro-QA-Secret": QA_SECRET },
    data: {
      scenarioId: `START-${name}-${run}`,
      classType: "individual",
      studentId: "QA-STUDENT-1",
      teacherId: "QA-TEACHER-1",
      date: yesterday(),
      startTime,
      endTime,
      title: `Правило старта ${name} ${run}`,
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

test("an earlier lesson without a report blocks the start; once it is closed the next one starts and continues its topics", async ({ page, request, context }, testInfo) => {
  // Lessons of earlier QA runs stay open on the stand; the rule is checked on a clean schedule.
  const reset = await request.post(`${CRM_URL}/api/qa/v1/reset`, { headers: { "X-Maestro-QA-Secret": QA_SECRET } });
  expect(reset.ok(), await reset.text()).toBe(true);
  const token = await signIn(request, context);
  const auth = { Authorization: `Bearer ${token}` };

  const earlier = await lesson(request, "E", "21:00", "21:45");
  const blocked = await lesson(request, "T", "22:00", "22:45");
  const next = await lesson(request, "N", "23:00", "23:45");

  // The server refuses the start and names the lesson to finish first.
  const refused = await request.post(`/api/v1/teachers/me/offline-lessons/${blocked}/start`, { headers: auth, data: {} });
  expect(refused.status()).toBe(409);
  const refusal = await refused.json();
  expect(JSON.stringify(refusal)).toContain("PREVIOUS_LESSON_NOT_SUBMITTED");
  expect(JSON.stringify(refusal)).toContain(`Правило старта E ${run}`);

  // The start window says the same and links to the lesson; cancelling stays possible.
  await page.goto(`/admin/offline-lessons/${blocked}`);
  const notice = page.getByTestId("lesson-start-blockers").last();
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Сначала сдайте прошлый урок");
  await expect(notice).toContainText(`Правило старта E ${run}`);
  await expect(page.getByRole("button", { name: "Начать урок" }).last()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Отменить урок" })).toBeEnabled();
  await noHorizontalScroll(page);
  await page.screenshot({ path: testInfo.outputPath(`start-blocked-${testInfo.project.name}.png`), fullPage: false });

  // The earliest owed lesson itself is never blocked.
  await notice.getByRole("link", { name: /Открыть урок/ }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/offline-lessons/${earlier}$`));
  await expect(page.getByTestId("lesson-start-blockers")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Начать урок" }).last()).toBeEnabled();

  // It did not take place: «Отменить урок» closes it, and the next lesson starts.
  const cancelled = await request.post(`/api/v1/teachers/me/offline-lessons/${earlier}/cancel`, { headers: auth, data: {} });
  expect(cancelled.ok(), await cancelled.text()).toBe(true);
  const blockers = await request.get(`/api/v1/teachers/me/offline-lessons/${blocked}/start-blockers`, { headers: auth });
  expect((await blockers.json()).data.blockers).toEqual([]);

  await page.goto(`/admin/offline-lessons/${blocked}`);
  await expect(page.getByTestId("lesson-start-blockers")).toHaveCount(0);
  await page.getByRole("button", { name: "Начать урок" }).last().click();
  await expect(page.getByText("Урок начат", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto(`/admin/offline-lessons/${blocked}`);

  // The lesson moves a topic and is sent; the admin has not approved it yet.
  const nav = page.getByTestId("lesson-step-nav");
  await nav.getByRole("button", { name: "Далее" }).click();
  const topic = page.getByTestId("lesson-topic-option").and(page.locator(":enabled")).first();
  const topicTitle = (await topic.locator("span").first().innerText()).trim();
  await topic.click();
  const percentInput = page.getByLabel("Новый процент темы");
  const before = Number(await percentInput.inputValue());
  const after = before >= 90 ? before - 3 : before + 7;
  await percentInput.fill(String(after));
  const pendingHomework = page.getByLabel(/Процент выполнения ДЗ/);
  for (let index = 0; index < await pendingHomework.count(); index += 1) {
    await pendingHomework.nth(index).fill("100");
  }
  await nav.getByRole("button", { name: "Далее" }).click();
  await page.getByPlaceholder("Какую песню или тему разбирали сегодня?").fill(topicTitle);
  await page.getByPlaceholder("Что получилось, что разобрали, какой результат занятия?").fill("Разобрали тему по шагам");
  await nav.getByRole("button", { name: "К предпросмотру" }).click();
  await page.getByRole("button", { name: "Отправить на проверку" }).click();
  const confirm = page.getByRole("dialog", { name: "Отправить урок на проверку?" });
  await expect(confirm.getByText(`${before}% → ${after}%`, { exact: true })).toBeVisible();
  await confirm.getByRole("button", { name: "Отправить на проверку" }).click();
  // A sent lesson takes the teacher back to the schedule.
  await expect(page).toHaveURL(/\/admin\/offline-lessons$/);
  const sent = await request.get(`/api/v1/teachers/me/offline-lessons/${blocked}`, { headers: auth });
  expect((await sent.json()).data.status).toBe("pending_admin_review");

  // The next lesson starts and continues the topic from the sent report.
  const startedNext = await request.post(`/api/v1/teachers/me/offline-lessons/${next}/start`, { headers: auth, data: {} });
  expect(startedNext.ok(), await startedNext.text()).toBe(true);
  await page.goto(`/admin/offline-lessons/${next}`);
  await page.getByTestId("lesson-step-nav").getByRole("button", { name: "Далее" }).click();
  const continued = page.getByTestId("lesson-topic-option").filter({ hasText: topicTitle }).first();
  await expect(continued).toContainText(`${after}%`);
  await expect(continued).toContainText("ждёт подтверждения");
  await continued.click();
  await expect(page.getByTestId("topic-pending-from-lesson")).toContainText(`${after}% — по отчёту прошлого урока`);
  await expect(page.getByText(`Было ${after}%`)).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: testInfo.outputPath(`topic-continues-${testInfo.project.name}.png`), fullPage: false });

  // The teacher moves the topic in the next lesson; then the earlier report is withdrawn, so the
  // topic starts from its approved percent again and the draft's «было» is stale.
  await page.getByLabel("Новый процент темы").fill(String(after + 1));
  const withdrawn = await request.post(`/api/v1/teachers/me/offline-lessons/${blocked}/withdraw`, {
    headers: auth, data: { reason: "QA: проверка правила старта" },
  });
  expect(withdrawn.ok(), await withdrawn.text()).toBe(true);
  await page.reload();
  const stepNav = page.getByTestId("lesson-step-nav");
  await stepNav.getByRole("button", { name: "Далее" }).click();
  const changed = page.getByTestId("lesson-topic-option").filter({ hasText: topicTitle }).first();
  await expect(changed).toContainText("процент изменился");
  await changed.click();
  await expect(page.getByTestId("topic-start-changed")).toContainText(`начинается с ${before}%`);

  // Sending the stale draft is refused with the topic named.
  const homework = page.getByLabel(/Процент выполнения ДЗ/);
  for (let index = 0; index < await homework.count(); index += 1) await homework.nth(index).fill("100");
  await stepNav.getByRole("button", { name: "Далее" }).click();
  await page.getByPlaceholder("Какую песню или тему разбирали сегодня?").fill(topicTitle);
  await page.getByPlaceholder("Что получилось, что разобрали, какой результат занятия?").fill("Продолжили тему");
  await stepNav.getByRole("button", { name: "К предпросмотру" }).click();
  await page.getByRole("button", { name: "Отправить на проверку" }).click();
  const sendDialog = page.getByRole("dialog", { name: "Отправить урок на проверку?" });
  await sendDialog.getByRole("button", { name: "Отправить на проверку" }).click();
  await expect(sendDialog.getByRole("alert")).toContainText(`Процент темы «${topicTitle}» изменился: теперь ${before}%`);
  await sendDialog.getByRole("button", { name: /Закрыть|Отмена|Вернуться/ }).first().click();

  // «Начать с …» takes the new percent, and the lesson goes through.
  await page.getByTestId("lesson-stepper").getByRole("button", { name: /ДЗ и темы/ }).click();
  await page.getByTestId("lesson-topic-option").filter({ hasText: topicTitle }).first().click();
  await page.getByTestId("topic-start-changed").getByRole("button", { name: `Начать с ${before}%` }).click();
  await expect(page.getByText(`Было ${before}% · будет ${after + 1}%`)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`topic-start-changed-${testInfo.project.name}.png`), fullPage: false });
  await page.getByTestId("lesson-stepper").getByRole("button", { name: /отправка/i }).click();
  await page.getByRole("button", { name: "Отправить на проверку" }).click();
  await sendDialog.getByRole("button", { name: "Отправить на проверку" }).click();
  await expect(page).toHaveURL(/\/admin\/offline-lessons$/);

  // Leave the stand as it was: no topic of the QA student keeps a percent waiting for approval.
  const withdrawnNext = await request.post(`/api/v1/teachers/me/offline-lessons/${next}/withdraw`, {
    headers: auth, data: { reason: "QA: проверка правила старта" },
  });
  expect(withdrawnNext.ok(), await withdrawnNext.text()).toBe(true);
  for (const crmClassId of [blocked, next]) {
    const closed = await request.post(`/api/v1/teachers/me/offline-lessons/${crmClassId}/cancel`, { headers: auth, data: {} });
    expect(closed.ok(), await closed.text()).toBe(true);
  }
  const after2 = await request.get(`/api/v1/teachers/me/offline-lessons/${next}/students`, { headers: auth });
  const topics = ((await after2.json()).data.learningV2?.plans ?? [])
    .flatMap((plan: { topics: Array<{ title: string; pendingFromLesson?: unknown }> }) => plan.topics);
  expect(topics.filter((item: { pendingFromLesson?: unknown }) => item.pendingFromLesson)).toEqual([]);
});
