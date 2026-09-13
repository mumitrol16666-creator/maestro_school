import { test, expect, type Page } from "@playwright/test";
import type { UnifiedTask } from "../src/types/unified-tasks";
import { nearestLearningLesson, learningTaskContext } from "../src/lib/learning-overview";
import type { SchoolOfflineLesson } from "../src/types/school-offline";

const now = new Date("2026-09-13T04:00:00Z");
function task(extra: Partial<UnifiedTask> = {}): UnifiedTask {
  return {
    id: "offline:old", source: "offline", kind: "assignment", title: "Бумажный солдатик + Jingle Bells",
    descriptionPreview: "Метроном + бой с переходами. Повторить куплет и припев.",
    status: "needs_revision", actionRequired: true,
    context: { primary: "Индивидуально · Максот Айару Нурболкызы", secondary: null, teacherName: "Сидоров Владислав Максимович" },
    timing: { assignedAt: "2026-08-07T10:00:00Z", dueAt: null, dueKind: null, overdue: false },
    result: { completionPercent: 80, scorePercent: null, reviewComment: null, points: null, coins: null },
    target: { href: "/tasks/school/old", actionLabel: "Посмотреть замечания" }, updatedAt: "2026-08-07T10:00:00Z", ...extra,
  };
}
function lesson(id = "next", extra: Partial<SchoolOfflineLesson> = {}): SchoolOfflineLesson {
  return { crmClassId: id, title: "Индивидуально · Айару", date: "2026-09-17", startTime: "15:30", endTime: "16:15", status: "scheduled", classType: "individual", groupName: null, teacherName: "Сидоров Владислав Максимович", roomName: "Кабинет 1", topic: null, lessonGoals: null, lessonSummary: null, homework: null, nextLessonFocus: null, materials: [], attended: null, ...extra };
}

async function setup(page: Page, options: { tasks?: UnifiedTask[]; partial?: boolean; failTasks?: boolean; failSchool?: boolean; failPlans?: boolean; lessons?: SchoolOfflineLesson[]; count?: number; plans?: unknown[] } = {}) {
  const user = { id: "learning-mock-student", firstName: "Айару", lastName: "Максот", role: "student", permissions: [], productFeatures: { roleNavigationV2: true, studentWorkspaceV2: true, homeworkFlowV2: true, learningTopicsV2: true } };
  await page.clock.setFixedTime(now);
  await page.addInitScript(user => {
    localStorage.setItem("maestro_access_token", "isolated-learning-mock");
    localStorage.setItem("maestro_auth_user", JSON.stringify(user));
    localStorage.setItem(`maestro:push-prompt-dismissed:${user.id}`, String(Date.now()));
  }, user);
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/v1/**", route => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api\/v1/, "");
    requests.push(path);
    const failed = { status: 503, json: { error: { code: "UNAVAILABLE", message: "Временно недоступно" } } };
    if (path === "/auth/me") return route.fulfill({ json: { data: user } });
    if (path === "/students/me/monthly-plans") return route.fulfill(options.failPlans ? failed : { json: { data: { month: "2026-09", plans: options.plans ?? [], aggregateProgress: { completed: 0, total: 0, percent: 0 } } } });
    if (path === "/students/me/tasks") {
      const items = options.tasks ?? Array.from({ length: 5 }, (_, index) => task({ id: `offline:${index}`, ...(index ? { title: `Задание ${index + 1}` } : {}) }));
      return route.fulfill(options.failTasks ? failed : { json: { data: { items, counts: { actionRequired: options.count ?? items.filter(x=>x.actionRequired).length, totalActive: items.length, waitingReview: items.filter(x=>x.status === "waiting_review").length, needsRevision: items.filter(x=>x.status === "needs_revision").length, completed: 0, bySource: { offline: items.length, online: 0, course: 0 } } }, meta: { partial: !!options.partial, truncated: false, sources: { offline: { status: options.partial ? "unavailable" : "ok" }, course: { status: "ok" }, online: { status: "ok" } } } } });
    }
    if (path === "/students/me/offline-summary") return route.fulfill(options.failSchool ? failed : { json: { data: { upcomingLessons: options.lessons ?? [lesson()], lessonHistory: [], monthlyPlan: null, profile: { name: "Айару", groups: [] }, balanceSnapshot: { memberships: [], currentMembership: null, accountBalanceKzt: 32000, classesRemainingTotal: 8, debtAmountKzt: 0, totalPaidAmountKzt: 32000 } } } });
    return route.fulfill({ json: { data: { items: [], notifications: [], count: 0, unreadCount: 0, ready: false } } });
  });
  await page.goto("/learning");
  await expect(page.getByTestId("learning-overview")).toBeVisible();
  return { requests, errors };
}

test("one task source, compact plan, neutral historical homework, no zero statistics", async ({ page }) => {
  const { requests, errors } = await setup(page, { count: 5 });
  const overview = page.getByTestId("learning-overview");
  await expect(overview.getByRole("heading", { name: "Сейчас", exact: true })).toBeVisible();
  await expect(overview.getByTestId("learning-task-count")).toHaveText("5 незавершённых");
  await expect(overview.getByText("Из прошлых уроков", { exact: true })).toBeVisible();
  await expect(overview.getByText("7 августа", { exact: true })).toBeVisible();
  await expect(overview.getByText(/Вернитесь|Ваш результат|Освоено за месяц|0 из 0/)).toHaveCount(0);
  await expect(overview.getByText("Индивидуально · Максот Айару Нурболкызы", { exact: true })).toHaveCount(0);
  await expect(overview.getByRole("link", { name: "Открыть задание", exact: true })).toHaveAttribute("href", "/tasks/school/old");
  await expect(overview.getByRole("link", { name: "Все задания", exact: true })).toHaveAttribute("href", "/tasks");
  await expect(overview.getByRole("link", { name: "Открыть план", exact: true })).toHaveAttribute("href", "/monthly-plan");
  await expect(overview.getByRole("link", { name: "Расписание", exact: true })).toHaveAttribute("href", "/school-lessons");
  expect(requests.some(path=>path.includes("homework-statistics"))).toBe(false);
  expect(errors).toEqual([]);
  const height = await overview.getByRole("region", { name: "Учебный план пока не опубликован" }).evaluate(el=>el.getBoundingClientRect().height);
  expect(height).toBeLessThan(230);
});

test("CRM failure leaves task and plan visible without inventing an empty schedule", async ({ page }) => {
  await setup(page, { failSchool: true });
  await expect(page.getByRole("heading", { name: "Расписание недоступно" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Бумажный солдатик + Jingle Bells" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Урок пока не назначен" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Обновить данные" })).toBeVisible();
});

test("unknown tasks and plan are not zero or completed", async ({ page }) => {
  await setup(page, { failTasks: true, failPlans: true });
  await expect(page.getByRole("heading", { name: "Проверим ваши задания" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Не удалось загрузить план" })).toBeVisible();
  await expect(page.getByTestId("learning-task-count")).toHaveCount(0);
  await expect(page.getByText("Учебный план пока не опубликован", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Незавершённых заданий нет", { exact: true })).toHaveCount(0);
});

test("partial empty result never claims everything is completed", async ({ page }) => {
  await setup(page, { tasks: [], partial: true });
  await expect(page.getByText("0 незавершённых · данные неполные", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Проверим ваши задания" })).toBeVisible();
});

test("real empty and waiting states stay distinct", async ({ page }) => {
  await setup(page, { tasks: [task({ status: "waiting_review", actionRequired: false })], lessons: [] });
  await expect(page.getByRole("heading", { name: "Задания на проверке" })).toBeVisible();
  await expect(page.getByText("На проверке: 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Урок пока не назначен" })).toBeVisible();
});

test("long names fit phone and desktop without horizontal overflow", async ({ page }) => {
  await setup(page, { tasks: [task({ title: "Бумажный солдатик и очень длинное название произведения ".repeat(4) })] });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth), `width ${width}`).toBeLessThanOrEqual(1);
  }
});

test("nearest lesson uses school time and ignores past and cancelled entries", () => {
  const current = new Date("2026-09-13T10:45:00Z");
  const ongoing = lesson("ongoing", { date: "2026-09-13", startTime: "15:30", endTime: "16:15", status: "started" });
  expect(nearestLearningLesson([lesson("later"), lesson("cancelled", { date: "2026-09-13", status: "cancelled" }), lesson("old", { date: "2026-09-12" }), ongoing], current)?.crmClassId).toBe("ongoing");
  expect(nearestLearningLesson([lesson("invalid", { date: "invalid" })], current)).toBeNull();
  expect(learningTaskContext(task()).label).toBe("Из прошлых уроков");
});

test("successful empty response is not a performance score", async ({ page }) => {
  await setup(page, { tasks: [], lessons: [] });
  await expect(page.getByRole("heading", { name: "Незавершённых заданий нет" })).toBeVisible();
  await expect(page.getByTestId("learning-task-count")).toHaveText("0 незавершённых");
  await expect(page.getByTestId("learning-overview").getByText(/0%|0 из 0/)).toHaveCount(0);
});

test("retry replaces unavailable data with an actual schedule", async ({ page }) => {
  const state = { failSchool: true };
  await setup(page, state);
  await expect(page.getByRole("heading", { name: "Расписание недоступно" })).toBeVisible();
  state.failSchool = false;
  await page.getByRole("button", { name: "Обновить данные" }).click();
  await expect(page.getByRole("heading", { name: "17 сентября" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Расписание недоступно" })).toHaveCount(0);
});

test("all tasks opens the owning screen with the same source and count", async ({ page }) => {
  await setup(page);
  await page.getByTestId("learning-overview").getByRole("link", { name: "Все задания", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByRole("heading", { name: "Задания", exact: true })).toBeVisible();
  await expect(page.getByTestId("task-results")).toBeVisible();
  await expect(page.getByTestId("task-results").getByText("Бумажный солдатик + Jingle Bells", { exact: true })).toBeVisible();
});

test("published empty plan is not called completed", async ({ page }) => {
  await setup(page, { plans: [{ id: "empty", items: [] }] });
  await expect(page.getByRole("heading", { name: "Темы плана готовятся" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Все текущие темы завершены" })).toHaveCount(0);
});

test("save implemented design screenshots", async ({ page }, testInfo) => {
  await setup(page, { count: 5 });
  await page.screenshot({ path: testInfo.outputPath("learning-now.png"), fullPage: true });
});
