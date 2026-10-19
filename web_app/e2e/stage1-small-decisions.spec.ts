import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

/**
 * Plan item 1.8 (decisions of 19.10): early sector close, one bonus a week,
 * topic percents for parents, no repeated lesson context on the attendance step.
 */

const PASSWORD = "QaMaestro2026!";
const CRM_URL = process.env.QA_CRM_URL ?? "http://127.0.0.1:5002";
const QA_SECRET = process.env.QA_CONTROLLER_SECRET ?? "local-maestro-qa-controller-2026";

async function signIn(request: APIRequestContext, context: BrowserContext, login: string, profile: "staff" | "parent") {
  const response = await request.post("/api/v1/auth/login", { data: { phone: login, password: PASSWORD, profile } });
  expect(response.ok(), await response.text()).toBe(true);
  const payload = await response.json();
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, payload.data);
  return payload.data.token as string;
}

test("the sector editor offers an early close with the Points the teacher writes", async ({ page, request, context }) => {
  await signIn(request, context, "qa_teacher_1", "staff");
  await page.goto("/admin/my-students/student/QA-STUDENT-1/plan");
  const panel = page.getByTestId("sector-early-close");
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Закрыть досрочно" }).click();
  const points = panel.getByLabel("Баллы за досрочное закрытие");
  await expect(points).toBeVisible();
  await points.fill("300");
  await expect(panel.getByText("Целое число от 0 до 250.")).toBeVisible();
  await expect(panel.getByRole("button", { name: /Закрыть сектор \d+ за/ })).toBeDisabled();
  await points.fill("120");
  await expect(panel.getByRole("button", { name: /Закрыть сектор \d+ за 120 баллов/ })).toBeEnabled();
});

test("the attendance step does not repeat the previous lesson shown on step 1", async ({ page, request, context }) => {
  const token = await signIn(request, context, "qa_teacher_1", "staff");
  const date = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const created = await request.post(`${CRM_URL}/api/qa/v1/lessons`, {
    headers: { "X-Maestro-QA-Secret": QA_SECRET },
    data: {
      scenarioId: `SMALL-${Date.now().toString(36).toUpperCase()}`,
      classType: "individual", studentId: "QA-STUDENT-1", teacherId: "QA-TEACHER-1",
      date, startTime: "10:00", endTime: "11:00", title: "Урок без повтора контекста",
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const crmClassId = (await created.json()).data.class.crmClassId as string;
  const started = await request.post(`/api/v1/teachers/me/offline-lessons/${crmClassId}/start`, {
    headers: { Authorization: `Bearer ${token}` }, data: {},
  });
  expect(started.ok(), await started.text()).toBe(true);

  await page.goto(`/admin/offline-lessons/${crmClassId}`);
  await expect(page.getByTestId("lesson-context-step")).toContainText("Контекст прошлого урока");
  await page.getByTestId("lesson-step-nav").getByRole("button", { name: "Далее" }).click();
  await expect(page.getByTestId("lesson-stepper")).toContainText("Шаг 2 из 5");
  await expect(page.getByText("Контекст прошлого урока")).toHaveCount(0);
});

test("a parent sees how far each topic of the sector has gone", async ({ page, request, context }) => {
  await signIn(request, context, "qa_parent_1", "parent");
  await page.goto("/family");
  const progress = page.getByTestId("family-topic-progress");
  await expect(progress.first()).toBeVisible();
  await expect(progress.first()).toContainText("%");
});

test("the student card says when this week's bonus was already given", async ({ page, context }) => {
  const user = { id: "00000000-0000-4000-8000-000000000011", firstName: "Учитель", lastName: "QA", role: "teacher", permissions: ["offline_school.read"] };
  await context.addInitScript((value) => {
    window.localStorage.setItem("maestro_access_token", "bonus-fixture");
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(value));
  }, user);
  const workspace = {
    generatedAt: "2026-10-19T05:30:00.000Z",
    access: { kind: "assigned", direct: true },
    student: {
      crmStudentId: "QA-STUDENT-1", appUserId: "10000000-0000-4000-8000-000000000021", name: "Казыбаев Камбар",
      phone: null, avatarUrl: null, learningLevel: null, directions: ["Гитара"], groups: [],
      appActivity: { lastActiveAt: null, lastLoginAt: null, linked: true }, parents: [],
    },
    sectors: [], proposals: [], homework: { available: true, waitingCount: 0, items: [] },
    recentLessons: { available: true, items: [] }, tests: [], courses: [],
    weekXp: { weekKey: "2026-10-19", total: 5, bySource: [{ sourceType: "teacher_bonus", amount: 5 }], events: [] },
    dynamics: null,
  };
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api\/v1/, "");
    if (path === "/auth/me") return route.fulfill({ json: { data: user } });
    if (path.endsWith("/workspace")) return route.fulfill({ json: { data: workspace } });
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto("/admin/my-students/student/QA-STUDENT-1");
  await expect(page.getByTestId("bonus-week-limit")).toBeVisible();
  await expect(page.getByRole("button", { name: "Дать бонус" })).toBeDisabled();
});
