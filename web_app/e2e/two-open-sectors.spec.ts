import { test, expect, type Page } from "@playwright/test";

/**
 * 07.11 (P4): a direction may have two open sectors — the current one and the previous one waiting
 * for its exam. The API is mocked, so the spec needs only the web app.
 * NOT RUN when written: the QA stack was not up. maestro-qa runs it on desktop and mobile-chromium.
 */

const direction = { id: "guitar", crmDirectionId: "crm-guitar", title: "Гитара", isActive: true, syncedAt: null };
const waitingId = "11111111-1111-4111-8111-111111111111";
const currentId = "22222222-2222-4222-8222-222222222222";

function studentPlan(id: string, sequence: number, status: "active" | "awaiting_exam", goal: string) {
  return {
    id, scope: "student", targetId: "demo-student", month: "2026-11", sequence, status, teacher: { name: "Преподаватель Maestro" }, goal,
    expectedResult: "", direction, publishedAt: "2026-11-05T10:00:00Z",
    exam: status === "awaiting_exam"
      ? { id: "exam-1", status: "scheduled", attempt: 1, scheduledAt: "2099-01-10T07:00:00.000Z", finishedAt: null, outcome: null, certificate: null, items: [{ id: "i1", title: "Бой восьмыми", criteria: "", done: null }] }
      : null,
    items: [{ id: `${id}-t1`, title: sequence === 1 ? "Am и E" : "Переборы", status: "in_progress", progressPercent: 40, state: "active" }],
    progress: { completed: 0, inProgress: 1, total: 1, percent: 40 },
  };
}

async function asStudent(page: Page, context: import("@playwright/test").BrowserContext) {
  const user = { id: "two-sectors-student", role: "student", audience: "school", firstName: "Ученик", lastName: "Пример", crmStudentId: "demo-student", permissions: [] };
  await context.addInitScript((value) => {
    localStorage.setItem("maestro_access_token", "mock-two-sectors");
    localStorage.setItem("maestro_auth_user", JSON.stringify(value));
  }, user);
  const plans = [studentPlan(currentId, 2, "active", "Переборы и бой"), studentPlan(waitingId, 1, "awaiting_exam", "Первые аккорды")];
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/me")) data = user;
    else if (path.endsWith("/students/me/monthly-plans")) data = { plans, aggregateProgress: { completed: 0, total: 2, percent: 40 } };
    else if (path.endsWith("/notifications/unread-count")) data = { count: 0 };
    return route.fulfill({ json: { data } });
  });
}

test("the student switches between the current sector and the one waiting for its exam", async ({ page, context }) => {
  await asStudent(page, context);
  await page.goto("/monthly-plan");
  const tabs = page.getByTestId("sector-switch");
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole("tab", { name: "Мой сектор 2 · текущий" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Мой сектор 2", exact: true })).toBeVisible();
  await expect(page.getByTestId("sector-awaiting-exam")).toHaveCount(0);

  await tabs.getByRole("tab", { name: "Мой сектор 1 · ждёт экзамена" }).click();
  await expect(page.getByRole("heading", { name: "Мой сектор 1", exact: true })).toBeVisible();
  await expect(page.getByTestId("sector-awaiting-exam")).toContainText("Ждёт экзамена");
  await expect(page.getByTestId("sector-exam-summary")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`sector=${waitingId}`));
  for (const tab of await tabs.getByRole("tab").all()) expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a link with ?sector opens the sector waiting for its exam", async ({ page, context }) => {
  await asStudent(page, context);
  await page.goto(`/monthly-plan?sector=${waitingId}`);
  await expect(page.getByRole("tab", { name: "Мой сектор 1 · ждёт экзамена" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("sector-awaiting-exam")).toBeVisible();
});

test("the teacher's editor shows the waiting sector read-only and blocks the next one", async ({ page, context }) => {
  const user = { id: "two-sectors-teacher", role: "teacher", firstName: "Учитель", permissions: ["offline_school.read", "offline_school.write"] };
  await context.addInitScript((value) => {
    localStorage.setItem("maestro_access_token", "fixture");
    localStorage.setItem("maestro_auth_user", JSON.stringify(value));
  }, user);
  const version = (id: string, sequence: number, status: string, goal: string) => ({
    id, sequence, status, version: 2, goal, expectedResult: "", skills: "", checkpoint: "", note: "", direction,
    publication: { isPublished: true, publishedAt: "2026-11-05T10:00:00Z", draftRevision: 2, publishedRevision: 2, hasUnpublishedChanges: false },
    items: [{ id: `${id}-t1`, title: sequence === 1 ? "Am и E" : "Переборы", status: "in_progress", progressPercent: 40, state: "active", masteryCriteria: "" }],
    progress: { completed: 0, inProgress: 1, total: 1, percent: 40 },
  });
  const examRow = {
    planId: waitingId, sequence: 1, direction, progress: { completed: 1, total: 1, percent: 100, ready: true }, canStart: false, previousExam: null,
    exam: { id: "exam-1", sessionId: "s1", planId: waitingId, crmStudentId: "demo-student", crmGroupId: null, direction, status: "scheduled", attempt: 1, previousExamId: null,
      sentForScheduleAt: null, crmClassId: "c1", scheduledAt: "2099-01-10T07:00:00.000Z", startedAt: null, finishedAt: null, outcome: null, decision: null, comment: null,
      certificate: null, cancelledAt: null, cancelReason: null, items: [{ id: "i1", kind: "custom", topicId: null, title: "Бой восьмыми", criteria: "", position: 1, done: null }] },
  };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/me")) data = user;
    else if (path.endsWith("/teachers/me/students")) data = { students: [{ key: "k", crmStudentId: "demo-student", name: "Камбар Казыбаев", firstName: "Камбар", lastName: "Казыбаев", middleName: "", directions: ["Гитара"], groups: [], schedules: [], attendanceHistory: [], sources: ["offline"] }] };
    else if (path.endsWith("/teachers/me/crm-directions")) data = [direction];
    else if (path.endsWith("/monthly-plan")) data = { student: { crmStudentId: "demo-student", name: "Камбар" }, direction: { crmDirectionId: "crm-guitar", title: "Гитара" }, nextSequence: 2, plan: version(currentId, 2, "active", "Переборы и бой"), awaitingExam: version(waitingId, 1, "awaiting_exam", "Первые аккорды"), history: [] };
    else if (path.endsWith("/sector-exams")) data = [examRow];
    else if (path.endsWith("/homework-flow")) data = { enabled: true, model: "learning_homework_v2" };
    return route.fulfill({ json: { data } });
  });
  await page.goto("/admin/my-students/student/demo-student/plan");
  const tabs = page.getByTestId("sector-switch");
  await expect(tabs.getByRole("tab", { name: "Сектор 2 · текущий" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Открыть следующий сектор" })).toBeDisabled();
  await expect(page.getByTestId("next-sector-blocked")).toContainText("Сектор 1 ещё ждёт экзамена: следующий откроется после него");

  await tabs.getByRole("tab", { name: "Сектор 1 · ждёт экзамена" }).click();
  await expect(page.getByTestId("sector-awaiting-view")).toBeVisible();
  await expect(page.getByTestId("sector-awaiting-view").getByRole("textbox")).toHaveCount(0);
  await expect(page.getByTestId("sector-early-close-booked")).toContainText("Отменить урок экзамена может администратор в CRM");
  await expect(page.getByRole("button", { name: "Закрыть досрочно" })).toHaveCount(0);

  await tabs.getByRole("tab", { name: "Сектор 2 · текущий" }).click();
  await page.getByRole("button", { name: "Закрыть досрочно" }).click();
  await expect(page.getByText("Баллы за сектор не начисляются: их дают только за сданный экзамен. Отменить нельзя.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Закрыть сектор 2 без баллов" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
