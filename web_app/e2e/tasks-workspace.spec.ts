import { test, expect, type Page } from "@playwright/test";
import type { UnifiedTask } from "../src/types/unified-tasks";
import { taskDate, taskStatusLabel } from "../src/lib/task-presentation";
import { learningTaskContext } from "../src/lib/learning-overview";

function task(id: string, extra: Partial<UnifiedTask> = {}): UnifiedTask {
  return {
    id, source: "offline", provenance: "learning_homework_v2", kind: "assignment",
    title: "Аккорды Am–E", descriptionPreview: "Переходы под метроном, 80 BPM.",
    status: "todo", actionRequired: true,
    context: { primary: "Индивидуально · ФИО ученика", secondary: null, teacherName: "Сидоров Владислав Максимович" },
    timing: { assignedAt: "2026-09-12T10:00:00Z", dueAt: null, dueKind: null, overdue: false },
    result: { completionPercent: null, scorePercent: null, reviewComment: null, points: null, coins: null },
    target: { href: "/tasks/school/assignment", actionLabel: "Открыть" }, updatedAt: "2026-09-12T10:00:00Z", ...extra,
  };
}
function examples() {
  return [
    task("v2:new"),
    task("online:revision", { source: "online", provenance: undefined, title: "Ритм и бой", status: "needs_revision", result: { completionPercent: null, scorePercent: null, reviewComment: "Не ускоряйся на переходе.", points: null, coins: null } }),
    task("offline:old", { provenance: "legacy_offline", title: "Бумажный солдатик + Jingle Bells", status: "needs_revision",
      timing: { assignedAt: "2026-08-07T10:00:00Z", dueAt: "2026-09-17T10:30:00Z", dueKind: "next_lesson", overdue: false },
      result: { completionPercent: 80, scorePercent: null, reviewComment: null, points: 100, coins: null } }),
    task("course:waiting", { source: "course", provenance: undefined, title: "Теория: интервалы", status: "waiting_review", actionRequired: false }),
    task("v2:done", { title: "Принятое задание", status: "completed", actionRequired: false }),
  ];
}
type Options = { tasks?: UnifiedTask[]; fail?: boolean; partial?: boolean; delay?: number; truncated?: boolean };
async function setup(page: Page, options: Options = {}, url = "/tasks") {
  const user = { id: "tasks-isolated", firstName: "Айару", lastName: "Максот", role: "student", permissions: [], productFeatures: { roleNavigationV2: true, studentWorkspaceV2: true, homeworkFlowV2: true, learningTopicsV2: true } };
  await page.clock.setFixedTime(new Date("2026-09-13T04:00:00Z"));
  await page.addInitScript(user => {
    localStorage.setItem("maestro_access_token", "isolated-tasks-mock");
    localStorage.setItem("maestro_auth_user", JSON.stringify(user));
    localStorage.setItem(`maestro:push-prompt-dismissed:${user.id}`, String(Date.now()));
  }, user);
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/api\/v1/, "");
    // Analytics is intercepted too; reject any unexpected business mutation.
    if (route.request().method() !== "GET" && path !== "/usage/events") writes.push(path);
    if (path === "/auth/me") return route.fulfill({ json: { data: user } });
    if (path === "/students/me/tasks") {
      if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay));
      if (options.fail) return route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Нет связи" } } });
      const all = options.tasks ?? examples();
      const counts = (items: UnifiedTask[]) => ({ totalActive: items.filter(t=>t.status !== "completed").length,
        actionRequired: items.filter(t=>t.actionRequired).length, waitingReview: items.filter(t=>t.status === "waiting_review").length,
        needsRevision: items.filter(t=>t.status === "needs_revision").length, completed: items.filter(t=>t.status === "completed").length,
        bySource: { course: items.filter(t=>t.source === "course").length, offline: items.filter(t=>t.source === "offline").length, online: items.filter(t=>t.source === "online").length } });
      const filtered = all.filter(t=>!url.searchParams.get("source") || t.source === url.searchParams.get("source"));
      const items = filtered.filter(t => (url.searchParams.get("scope") === "completed" ? t.status === "completed" : t.status !== "completed")
        && (!url.searchParams.get("status") || t.status === url.searchParams.get("status")));
      return route.fulfill({ json: { data: { items, counts: counts(all), filteredCounts: counts(filtered) },
        meta: { partial: !!options.partial, truncated: !!options.truncated, sources: { offline: { status: options.partial ? "unavailable" : "ok" }, course: { status: "ok" }, online: { status: "ok" } } } } });
    }
    if (path === "/students/me/homework-assignments") return route.fulfill({ json: { data: { model: "learning_homework_v2", assignments: [{
      id: "assignment", model: "learning_homework_v2", recipientId: "recipient", state: "assigned", currentCycle: 1, acceptedAt: null,
      topic: { id: "topic", title: "Аккорды Am–E", masteryCriteria: "10 переходов", direction: { id: "guitar", title: "Гитара", crmDirectionId: null }, scope: "student" },
      instructions: "Переходы под метроном, 80 BPM.", materials: [], sourceLessonId: "lesson", dueAt: null, assignedAt: "2026-09-12T10:00:00Z",
      teacherName: "Сидоров Владислав Максимович", latestAttempt: null, attempts: [],
    }] } } });
    if (path === "/students/me/offline-summary") return route.fulfill({ json: { data: { upcomingLessons: [], lessonHistory: [] } } });
    return route.fulfill({ json: { data: { items: [], notifications: [], count: 0, unreadCount: 0, ready: false } } });
  });
  await page.goto(url);
  await expect(page.getByTestId("tasks-workspace")).toBeVisible();
  return { errors, writes };
}

test("compact rows separate current tasks and historical grades", async ({ page }) => {
  const { errors, writes } = await setup(page);
  await expect(page.getByTestId("task-card")).toHaveCount(3);
  await expect(page.getByTestId("task-state-filters").getByRole("button", { name: "Нужно сделать 3" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Из прошлых уроков" })).toContainText("Частично выполнено · 80%");
  await expect(page.getByTestId("task-results")).not.toContainText("Повторите задание");
  await expect(page.getByTestId("task-results")).not.toContainText("К следующему уроку");
  await expect(page.getByTestId("task-results")).not.toContainText("100 баллов");
  await expect(page.getByTestId("task-results")).not.toContainText("ФИО ученика");
  await expect(page.getByTestId("task-results")).not.toContainText("Процент не выставлен");
  await expect(page.getByText("Комментарий: Не ускоряйся на переходе.")).toBeVisible();
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
});

test("filters change the list and their own counts; deep link survives reload", async ({ page }) => {
  await setup(page);
  await page.getByTestId("task-source-filters").getByRole("button", { name: "Курсы", exact: true }).click();
  await expect(page.getByTestId("task-state-filters").getByRole("button", { name: "Нужно сделать 0" })).toBeVisible();
  await page.getByTestId("task-state-filters").getByRole("button", { name: "На проверке 1" }).click();
  await expect(page.getByRole("heading", { name: "Теория: интервалы" })).toBeVisible();
  await expect(page.getByTestId("task-card")).toHaveCount(1);
  await expect(page).toHaveURL(/source=course.*view=waiting/);
  await page.reload();
  await expect(page.getByTestId("task-source-filters").getByRole("button", { name: "Курсы", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Теория: интервалы" })).toBeVisible();
});

test("completed tab and return to active do not duplicate tasks", async ({ page }) => {
  await setup(page);
  await page.getByTestId("task-state-filters").getByRole("button", { name: "Выполнено 1", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Принятое задание" })).toBeVisible();
  await expect(page.getByTestId("task-card")).toHaveCount(1);
  await page.getByTestId("task-state-filters").getByRole("button", { name: "Нужно сделать 3" }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Принятое задание" })).toHaveCount(0);
});

test("slow filter requests never show the previous list under the next tab", async ({ page }) => {
  const options = { delay: 0 };
  await setup(page, options);
  await expect(page.getByTestId("task-card")).toHaveCount(3);
  options.delay = 1200;
  await page.getByTestId("task-source-filters").getByRole("button", { name: "Курсы", exact: true }).click();
  await expect(page.getByText("Загружаем задания…")).toBeVisible();
  await expect(page.getByTestId("task-card")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Незавершённых заданий нет" })).toBeVisible();
});

test("failed load keeps navigation and retry, never presents zero as success", async ({ page }) => {
  const options = { fail: true };
  await setup(page, options);
  await expect(page.getByRole("heading", { name: "Не удалось загрузить задания" })).toBeVisible();
  await expect(page.getByTestId("task-source-filters").getByRole("button")).toHaveCount(4);
  await expect(page.getByTestId("task-state-filters")).not.toContainText("0");
  options.fail = false;
  await page.getByTestId("task-results").getByRole("button", { name: "Повторить" }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(3);
});

test("partial data has lower-bound counters, never all done", async ({ page }) => {
  await setup(page, { partial: true, tasks: [] });
  await expect(page.getByRole("heading", { name: "Полный список пока недоступен" })).toBeVisible();
  await expect(page.getByTestId("task-state-filters")).toContainText("≥ 0");
  await expect(page.getByRole("heading", { name: "Незавершённых заданий нет" })).toHaveCount(0);
  await page.getByTestId("task-source-filters").getByRole("button", { name: "Курсы", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Незавершённых заданий нет" })).toBeVisible();
  await expect(page.getByTestId("task-state-filters")).not.toContainText("≥");
});

test("compact empty state and long content fit 320 through 1440 pixels", async ({ page }) => {
  await setup(page, { tasks: [task("long", { title: "Оченьдлинноеназваниебезпробелов".repeat(12) })] });
  await expect(page.getByTestId("task-card")).toHaveCount(1);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth), `width ${width}`).toBeLessThanOrEqual(1);
  }
});
test("empty state stays compact", async ({ page }) => {
  await setup(page, { tasks: [] });
  const empty = page.getByRole("region", { name: "Пустой список" });
  await expect(empty).toBeVisible();
  expect(await empty.evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(230);
});

test("open leads to canonical assignment detail, without creating another task", async ({ page }) => {
  const { writes, errors } = await setup(page);
  await page.getByRole("link", { name: "Открыть: Аккорды Am–E", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\/school\/assignment$/);
  await expect(page.getByText("Переходы под метроном, 80 BPM.", { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("presentation keeps historical and current provenance distinct and rejects invalid dates", () => {
  expect(learningTaskContext(task("current")).label).toBe("Задание преподавателя");
  expect(taskStatusLabel(examples()[2])).toBe("Частично выполнено · 80%");
  expect(taskDate("invalid")).toBeNull();
  expect(taskDate("2026-09-12T22:00:00Z")).toContain("13 сентября");
});

test("save implemented task design", async ({ page }, testInfo) => {
  await setup(page);
  await expect(page.getByTestId("task-card")).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath("tasks.png"), fullPage: true });
});
