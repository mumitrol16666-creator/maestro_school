import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { startQaLessonForTeacher } from "./qa-start";

/**
 * Document 23 §8 (decision 03.11): the trial lesson in four steps on the methodology's diagnostics —
 * «Перед уроком», «Диагностика» (four blocks with a level, «получилось / поработаем / дома»),
 * «Рекомендация» (start step and the plan for three months), «Отправка». A started trial means the
 * lead came: there is no attendance step and no «Итог посещения». CRM keeps the report as v3.
 * Needs published program steps on the stand (scripts/seed-guitar-steps.ts --publish).
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

async function trialLesson(request: APIRequestContext, direction = "Гитара") {
  const run = `${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`;
  const minute = String(Math.floor(Math.random() * 25)).padStart(2, "0");
  const created = await request.post(`${CRM_URL}/api/qa/v1/lessons`, {
    headers: { "X-Maestro-QA-Secret": QA_SECRET },
    data: {
      scenarioId: `TRIAL-${run}`,
      classType: "trial",
      teacherId: "QA-TEACHER-1",
      date: yesterday(),
      startTime: `05:${minute}`,
      endTime: `05:${String(Number(minute) + 30).padStart(2, "0")}`,
      title: `Пробный урок — QA Лид ${run}`,
      direction,
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

test("a trial lesson goes four steps on the methodology's diagnostics and reaches CRM as v3", async ({ page, request, context }) => {
  const token = await signIn(request, context);
  const crmClassId = await trialLesson(request);
  await page.goto(`/admin/offline-lessons/${crmClassId}`);

  const stepper = page.getByTestId("lesson-stepper");
  await expect(stepper).toContainText("Шаг 1 из 4: Перед уроком");
  await expect(page.getByText("Итог посещения")).toHaveCount(0);
  await expect(page.getByText("По каждому ученику")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Присутствовал" })).toHaveCount(0);
  await noHorizontalScroll(page);

  const before = page.getByTestId("trial-step-before");
  await expect(before).toContainText("Лид QA");
  await expect(before).toContainText("+77000009999");
  await before.getByRole("button", { name: "Со взрослым" }).click();
  await page.getByLabel("Опыт до пробного").selectOption("none");
  await page.getByLabel("Цель и любимая песня").fill("Сыграть «Кукушку»");
  await page.getByRole("button", { name: /Далее/ }).click();

  await expect(stepper).toContainText("Диагностика");
  await expect(stepper).toContainText("Отметьте, как получилось");
  for (const [key, level] of [["instrument", "Сам"], ["hearingPulse", "С подсказкой"], ["movement", "Пока не получилось"], ["learnability", "Сам"]] as const) {
    const block = page.getByTestId(`trial-block-${key}`);
    await block.getByRole("button", { name: level, exact: true }).click();
    await expect(block.getByRole("button", { name: level, exact: true })).toHaveAttribute("aria-pressed", "true");
    await block.getByRole("textbox").fill(`что делали: ${key}`);
  }
  await page.getByLabel(/Получилось/).fill("Чистый звук на открытой струне");
  await page.getByLabel(/Поработаем/).fill("Левая рука быстро устаёт");
  await page.getByLabel(/Дома —/).fill("Пять минут в день: звук со счётом");
  await noHorizontalScroll(page);
  await page.getByRole("button", { name: /Далее/ }).click();

  await expect(stepper).toContainText("Рекомендация");
  await expect(stepper).toContainText("Выберите ступень");
  await page.getByTestId("trial-recommendation").getByRole("button", { name: /Ступень 1/ }).first().click();
  const plan = page.getByTestId("trial-plan");
  await expect(plan).toContainText("План на три месяца");
  await expect(plan.locator("li")).toHaveCount(3);
  await page.getByLabel("Формат").selectOption("individual");
  await page.getByLabel("Частота").selectOption("2_per_week");
  await noHorizontalScroll(page);
  await page.getByRole("button", { name: /К предпросмотру/ }).click();

  const preview = page.getByTestId("trial-preview");
  await expect(preview).toContainText("С подсказкой");
  await expect(preview).toContainText("Ступень 1");
  const submit = page.getByRole("button", { name: "Отправить на проверку" }).first();
  await expect(submit).toBeEnabled();
  await submit.click();
  const confirm = page.getByRole("dialog").getByRole("button", { name: "Отправить на проверку" });
  if (await confirm.count()) await confirm.click();

  await expect.poll(async () => {
    const response = await request.get(`/api/v1/teachers/me/offline-lessons/${crmClassId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok()) return null;
    const lesson = (await response.json()).data as { status?: string; trialReport?: { version?: number; diagnostics?: Record<string, { level?: string }> } };
    return `${lesson.status}|${lesson.trialReport?.version}|${lesson.trialReport?.diagnostics?.movement?.level}`;
  }, { timeout: 20_000 }).toBe("pending_admin_review|3|not_yet");
});

test("a lead whose direction has no program steps is sent without a plan, not with another direction's", async ({ page, request, context }) => {
  await signIn(request, context);
  const crmClassId = await trialLesson(request, "Вокал");
  await page.goto(`/admin/offline-lessons/${crmClassId}`);
  await page.getByRole("button", { name: /Далее/ }).click();
  for (const key of ["instrument", "hearingPulse", "movement", "learnability"]) {
    await page.getByTestId(`trial-block-${key}`).getByRole("button", { name: "С подсказкой", exact: true }).click();
  }
  await page.getByLabel(/Получилось/).fill("Чисто спела две ноты");
  await page.getByLabel(/Поработаем/).fill("Дыхание");
  await page.getByLabel(/Дома —/).fill("Пять минут распевки");
  await page.getByRole("button", { name: /Далее/ }).click();
  await expect(page.getByTestId("trial-no-steps")).toContainText("«Вокал»");
  await expect(page.getByTestId("trial-recommendation").getByRole("button", { name: /Ступень/ })).toHaveCount(0);
  await expect(page.getByTestId("lesson-stepper")).not.toContainText("Выберите ступень");
  await page.getByRole("button", { name: /К предпросмотру/ }).click();
  await expect(page.getByRole("button", { name: "Отправить на проверку" }).first()).toBeEnabled();
});
