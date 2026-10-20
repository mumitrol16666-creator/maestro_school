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

type Options = {
  tasks?: UnifiedTask[];
  partial?: boolean;
  failTasks?: boolean;
  failSchool?: boolean;
  failHome?: boolean;
  lessons?: SchoolOfflineLesson[];
  count?: number;
  plans?: unknown[];
};

/** Plan 2.1: «Обучение» reads one `/students/me/home`; every block of it can be missing on its own. */
async function setup(page: Page, options: Options = {}) {
  const user = { id: "learning-mock-student", firstName: "Айару", lastName: "Максот", role: "student", permissions: [], productFeatures: { homeworkFlowV2: true, learningTopicsV2: true } };
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
    const items = options.tasks ?? Array.from({ length: 5 }, (_, index) => task({ id: `offline:${index}`, ...(index ? { title: `Задание ${index + 1}` } : {}) }));
    const counts = { actionRequired: options.count ?? items.filter(x=>x.actionRequired).length, totalActive: items.length, waitingReview: items.filter(x=>x.status === "waiting_review").length, needsRevision: items.filter(x=>x.status === "needs_revision").length, completed: 0, bySource: { offline: items.length, online: 0, course: 0, theory: 0 } };
    if (path === "/students/me/home") {
      if (options.failHome) return route.fulfill(failed);
      return route.fulfill({ json: { data: {
        generatedAt: now.toISOString(),
        dashboard: { currentCourse: null, progressPercent: 0, completedLessonsCount: 0, totalLessonsCount: 0, points: 0, level: null, nextAvailableLesson: null },
        school: options.failSchool ? null : { upcomingLessons: options.lessons ?? [lesson()], lessonHistory: [], profile: { name: "Айару", groups: [] } },
        monthlyPlans: options.plans ?? [],
        tasks: options.failTasks ? null : { items, counts, partial: !!options.partial },
        achievementsEarned: 0,
        sectorProposals: [],
      } } });
    }
    if (path === "/students/me/tasks") {
      return route.fulfill({ json: { data: { items, counts, filteredCounts: counts }, meta: { partial: !!options.partial, truncated: false, sources: { offline: { status: "ok" }, course: { status: "ok" }, online: { status: "ok" }, theory: { status: "ok" } } } } });
    }
    return route.fulfill({ json: { data: { items: [], notifications: [], count: 0, unreadCount: 0, ready: false } } });
  });
  await page.goto("/learning");
  return { requests, errors };
}

test("one read of the home: tasks, sector, no zero statistics", async ({ page }) => {
  const { requests, errors } = await setup(page, { count: 5 });
  const overview = page.getByTestId("learning-overview");
  await expect(overview.getByRole("heading", { name: "Обучение", exact: true })).toBeVisible();
  await expect(overview.getByTestId("learning-task-count")).toHaveText("5 незавершённых");
  await expect(overview.getByText("Из прошлых уроков", { exact: true })).toBeVisible();
  await expect(overview.getByText(/Вернитесь|Ваш результат|Освоено за месяц|0 из 0/)).toHaveCount(0);
  await expect(overview.getByRole("link", { name: "Открыть задание", exact: true })).toHaveAttribute("href", "/tasks/school/old");
  await expect(overview.getByRole("link", { name: "Все задания", exact: true })).toHaveAttribute("href", "/tasks");
  await expect(overview.getByRole("link", { name: "Открыть сектор", exact: true })).toHaveAttribute("href", "/monthly-plan");
  await expect(overview.getByRole("heading", { name: "Сектор ещё не открыт" })).toBeVisible();
  await expect(overview.getByTestId("learning-task-list").getByTestId("task-card")).toHaveCount(4);
  // The header and the page share one read; nothing else reaches the school separately.
  expect(requests.filter((path) => path === "/students/me/home")).toHaveLength(1);
  expect(requests.some((path) => ["/students/me/tasks", "/students/me/offline-summary", "/students/me/monthly-plans"].includes(path))).toBe(false);
  expect(errors).toEqual([]);
});

test("school data missing keeps tasks and sector, says the data is partial", async ({ page }) => {
  await setup(page, { failSchool: true });
  await expect(page.getByRole("heading", { name: "Бумажный солдатик + Jingle Bells" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Сектор ещё не открыт" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Обновить данные" })).toBeVisible();
});

test("unknown tasks are not zero or completed", async ({ page }) => {
  await setup(page, { failTasks: true });
  await expect(page.getByRole("heading", { name: "Проверим ваши задания" })).toBeVisible();
  await expect(page.getByTestId("learning-task-count")).toHaveCount(0);
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
});

test("long names fit phone and desktop without horizontal overflow", async ({ page }) => {
  await setup(page, { tasks: [task({ title: "Бумажный солдатик и очень длинное название произведения ".repeat(4) })] });
  await expect(page.getByTestId("learning-overview")).toBeVisible();
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

test("a failed home read offers a retry that brings the page back", async ({ page }) => {
  const state: Options = { failHome: true };
  await setup(page, state);
  await expect(page.getByRole("button", { name: "Повторить" })).toBeVisible();
  state.failHome = false;
  await page.getByRole("button", { name: "Повторить" }).click();
  await expect(page.getByRole("heading", { name: "Обучение", exact: true })).toBeVisible();
});

test("all tasks opens the owning screen with the same source and count", async ({ page }) => {
  await setup(page);
  await page.getByTestId("learning-overview").getByRole("link", { name: "Все задания", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByRole("heading", { name: "Задания", exact: true })).toBeVisible();
  await expect(page.getByTestId("task-results").getByText("Бумажный солдатик + Jingle Bells", { exact: true })).toBeVisible();
});

test("an open sector without topics is not called completed", async ({ page }) => {
  await setup(page, { plans: [{ id: "empty", scope: "student", targetId: "s", month: "2026-09", sequence: 2, status: "active", goal: "", items: [], progress: { completed: 0, total: 0, percent: 0 }, teacher: { name: "" } }] });
  await expect(page.getByTestId("learning-sector-card")).toContainText("Мой сектор 2");
  await expect(page.getByText("Все текущие темы завершены")).toHaveCount(0);
});

test("save implemented design screenshots", async ({ page }, testInfo) => {
  await setup(page, { count: 5 });
  await expect(page.getByTestId("learning-overview")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("learning-now.png"), fullPage: true });
});
