import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { startQaLessonForTeacher } from "./qa-start";

/** 01.11: changing a lesson step lands the screen on the steps, just under the header. */
const PASSWORD = "QaMaestro2026!";
const CRM_URL = process.env.QA_CRM_URL ?? "http://127.0.0.1:5002";
const QA_SECRET = process.env.QA_CONTROLLER_SECRET ?? "local-maestro-qa-controller-2026";

async function signIn(request: APIRequestContext, context: BrowserContext) {
  const login = await request.post("/api/v1/auth/login", { data: { phone: "qa_teacher_1", password: PASSWORD, profile: "staff" } });
  expect(login.ok(), await login.text()).toBe(true);
  const session = (await login.json()).data as { token: string; user: unknown };
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, session);
}

test("«Далее», «Назад» and the stepper put the steps right under the header", async ({ page, request, context }) => {
  await signIn(request, context);
  const run = Date.now().toString(36).toUpperCase();
  const created = await request.post(`${CRM_URL}/api/qa/v1/lessons`, {
    headers: { "X-Maestro-QA-Secret": QA_SECRET },
    data: {
      scenarioId: `SCROLL-${run}`, classType: "individual", studentId: "QA-STUDENT-1", teacherId: "QA-TEACHER-1",
      date: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10), startTime: "15:00", endTime: "15:45", title: `Прокрутка ${run}`,
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const crmClassId = (await created.json()).data.class.crmClassId as string;
  await startQaLessonForTeacher(request, crmClassId);
  await page.goto(`/admin/offline-lessons/${crmClassId}`);
  await expect(page.getByTestId("lesson-stepper")).toBeVisible();

  const stepperTop = async () => {
    await page.waitForTimeout(900);
    return page.evaluate(() => {
      const stepper = document.querySelector('[data-testid="lesson-stepper"]')!.getBoundingClientRect().top;
      const header = document.querySelector("header.sticky")?.getBoundingClientRect().height ?? 0;
      return { stepper, header };
    });
  };
  const nav = page.getByTestId("lesson-step-nav");
  await nav.getByRole("button", { name: "Далее" }).click();
  let pos = await stepperTop();
  expect(pos.stepper, "after «Далее»").toBeGreaterThanOrEqual(pos.header);
  expect(pos.stepper, "after «Далее»").toBeLessThanOrEqual(pos.header + 40);

  await page.mouse.wheel(0, 1200);
  await nav.getByRole("button", { name: "Назад" }).click();
  pos = await stepperTop();
  expect(pos.stepper, "after «Назад»").toBeGreaterThanOrEqual(pos.header);
  expect(pos.stepper, "after «Назад»").toBeLessThanOrEqual(pos.header + 40);

  await page.mouse.wheel(0, 1200);
  await page.getByTestId("lesson-stepper").getByRole("button", { name: /Итог и/ }).click();
  pos = await stepperTop();
  expect(pos.stepper, "after the stepper").toBeGreaterThanOrEqual(pos.header);
  expect(pos.stepper, "after the stepper").toBeLessThanOrEqual(pos.header + 40);
});
