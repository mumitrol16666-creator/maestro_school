import { test, expect, type Page } from "@playwright/test";
import type { TeacherHomeworkItem, TeacherHomeworkWorkspace } from "../src/lib/teacher-student-homework-api";

const path = "/admin/my-students/student/student-fixture/tasks";
const apiPath = "/teachers/me/students/student-fixture/homework";
function item(key: string, extra: Partial<TeacherHomeworkItem> = {}): TeacherHomeworkItem {
  return { key, model: "legacy", title: "Звезда по имени солнце", instructions: "Доучить 1 куплет и припев", assignedAt: "2026-08-27T10:00:00Z", state: "clarify", comment: null, reviewHref: null, lessonHref: "/admin/offline-lessons/old", canResolve: true, revision: 0, crmClassId: key, history: [], ...extra };
}
async function setup(page: Page, extra: { readOnly?: boolean; partial?: boolean; fail?: boolean } = {}) {
  const user = { id: "teacher-fixture", firstName: "Владислав", lastName: "Сидоров", role: "teacher", permissions: ["offline_school.read", "homework.review"], productFeatures: { roleNavigationV2: true, learningTopicsV2: true, homeworkFlowV2: true, studentWorkspaceV2: true } };
  const data: TeacherHomeworkWorkspace = { student: { crmStudentId: "student-fixture", name: "Анна Учебная" }, planHref: "/admin/my-students/student/student-fixture/plan", partial: !!extra.partial, items: [
    item("old", { canResolve: !extra.readOnly }), item("current", { title: "Переходы Am–E", state: "continue", comment: "Сыграть медленно" }),
    item("review", { title: "Бой 4-ка", model: "learning_homework_v2", state: "waiting_review", canResolve: false, reviewHref: "/admin/homework-review/recipient-one" }),
    item("done", { title: "Jingle Bells", state: "accepted", canResolve: false }),
  ] };
  const state = { data, posts: [] as Record<string, unknown>[], conflict: false, postFail: false };
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(user => {
    localStorage.setItem("maestro_access_token", "isolated-homework-fixture"); localStorage.setItem("maestro_auth_user", JSON.stringify(user));
    localStorage.setItem(`maestro:push-prompt-dismissed:${user.id}`, String(Date.now()));
  }, user);
  await page.route("**/api/v1/**", async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/^.*\/api\/v1/, "");
    if (pathname === "/auth/me") return route.fulfill({ json: { data: user } });
    if (pathname === "/students/me/tasks") return route.fulfill({ json: { data: { items: [], counts: { actionRequired: 0, totalActive: 0, completed: 0, waitingReview: 0 } } } });
    if (pathname === "/students/me/homework-assignments") return route.fulfill({ json: { data: { assignments: [] } } });
    if (pathname === "/students/me/offline-summary") return route.fulfill({ json: { data: { upcomingLessons: [], lessonHistory: [{
      crmClassId: "old", title: data.items[0].title, topic: data.items[0].title, date: "2026-08-27", startTime: "15:00", endTime: "15:45", status: "completed",
      teacherName: "Сидоров Владислав", homework: data.items[0].instructions, materials: [], lessonPointsAwarded: 100,
      homeworkResult: { status: "partial", completionPercent: 80, reviewedAt: null, reviewConfidence: "legacy_derived" },
      legacyResolution: data.items[0].revision ? { decision: data.items[0].state, comment: data.items[0].comment, updatedAt: "2026-09-13T09:00:00Z" } : null,
    }] } } });
    if (pathname === apiPath) return route.fulfill(extra.fail ? { status: 503, json: { error: { message: "CRM недоступна" } } } : { json: { data } });
    if (pathname.startsWith(apiPath) && pathname.endsWith("/resolve")) {
      const body = request.postDataJSON(); state.posts.push(body);
      if (state.conflict) return route.fulfill({ status: 409, json: { error: { message: "Задание уже изменено. Обновите список перед сохранением", code: "HOMEWORK_STALE_VERSION" } } });
      if (state.postFail) return route.fulfill({ status: 503, json: { error: { message: "Временно недоступно" } } });
      const old = data.items[0]; old.state = body.decision; old.comment = body.comment; old.revision++;
      old.history.push({ decision: body.decision, comment: body.comment, actorName: "Сидоров Владислав", at: "2026-09-13T09:00:00Z" });
      return route.fulfill({ json: { data: { revision: old.revision, idempotent: false } } });
    }
    if (pathname === "/admin/homework-submissions") return route.fulfill({ json: { data: [], meta: { total: 0 } } });
    if (pathname === "/teachers/me/staff-tasks") return route.fulfill({ json: { data: { tasks: [] } } });
    return route.fulfill({ json: { data: { count: 0, items: [], notifications: [], ready: false } } });
  });
  await page.goto(path);
  return { state, errors, user };
}
async function openLegacy(page: Page) {
  await page.getByRole("button", { name: /^Уточнить результат/ }).click();
  await page.getByText("Звезда по имени солнце", { exact: true }).click();
}

test("compact mockup: one task per tab, legacy decision panel, no overflow", async ({ page }, info) => {
  const { errors } = await setup(page);
  await expect(page.getByTestId("teacher-homework-card")).toHaveCount(1);
  await openLegacy(page);
  await expect(page.getByRole("button", { name: "Сохранить решение" })).toBeDisabled();
  await page.getByLabel("Продолжить работу", { exact: true }).check();
  await expect(page.getByText("Доучить 1 куплет и припев")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `../docs/design/teacher-student-tasks-2026-09-13/implemented-${info.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});
for (const decision of ["Принято", "Продолжить работу", "Неактуально"]) test(`legacy decision: ${decision} is saved once and moves to its section`, async ({ page }) => {
  const { state } = await setup(page); await openLegacy(page);
  await page.getByLabel(decision, { exact: true }).check();
  if (decision !== "Принято") {
    await page.getByRole("button", { name: "Сохранить решение" }).click();
    await expect(page.getByTestId("teacher-student-tasks").getByRole("alert")).toContainText("Напишите");
    await page.getByLabel(/^Комментарий/).fill("Повторить припев медленно");
  }
  await page.getByRole("button", { name: "Сохранить решение" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Решение сохранено" })).toBeVisible();
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0].expectedRevision).toBe(0);
  await page.getByRole("button", { name: decision === "Продолжить работу" ? /^Текущие/ : /^История/ }).click();
  await page.getByText("Звезда по имени солнце", { exact: true }).click();
  await expect(page.getByText("История решений")).toBeVisible();
  await expect(page.getByText(/100%/)).toHaveCount(0);
});
test("new homework opens the existing review, never legacy decisions", async ({ page }) => {
  await setup(page); await page.getByRole("button", { name: /^На проверке/ }).click();
  await page.getByText("Бой 4-ка", { exact: true }).click();
  await expect(page.getByRole("link", { name: "Открыть проверку →" })).toHaveAttribute("href", "/admin/homework-review/recipient-one");
  await expect(page.getByRole("button", { name: "Сохранить решение" })).toHaveCount(0);
});
test("foreign teacher task is read only", async ({ page }) => {
  const { state } = await setup(page, { readOnly: true }); await openLegacy(page);
  await expect(page.getByText(/Задание другого преподавателя/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Сохранить решение" })).toHaveCount(0); expect(state.posts).toHaveLength(0);
});
test("conflicting edit blocks resubmission and offers refresh", async ({ page }) => {
  const { state } = await setup(page); state.conflict = true; await openLegacy(page);
  await page.getByLabel("Принято", { exact: true }).check(); await page.getByRole("button", { name: "Сохранить решение" }).click();
  await expect(page.getByTestId("teacher-student-tasks").getByRole("alert")).toContainText("Задание уже изменено");
  await expect(page.getByRole("button", { name: "Сохранить решение" })).toBeDisabled(); expect(state.posts).toHaveLength(1);
});
test("uncertain network retry retains the request key", async ({ page }) => {
  const { state } = await setup(page); state.postFail = true; await openLegacy(page);
  await page.getByLabel("Принято", { exact: true }).check(); await page.getByRole("button", { name: "Сохранить решение" }).click();
  await expect(page.getByTestId("teacher-student-tasks").getByRole("alert")).toContainText("Временно недоступно"); state.postFail = false;
  await page.getByRole("button", { name: "Сохранить решение" }).click(); await expect(page.getByRole("status").filter({ hasText: "Решение сохранено" })).toBeVisible();
  expect(state.posts).toHaveLength(2); expect(state.posts[0].requestKey).toBe(state.posts[1].requestKey);
});
test("unavailable CRM is an error, not an empty student", async ({ page }) => {
  await setup(page, { fail: true }); await expect(page.getByTestId("teacher-student-tasks").getByRole("alert")).toContainText("CRM недоступна");
  await expect(page.getByText("В этом разделе заданий нет.")).toHaveCount(0);
});
test("320px long title remains within viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 }); const { state } = await setup(page);
  state.data.items[0].title = "Оченьдлинноеназваниебезпробелов".repeat(5);
  await page.reload(); await page.getByRole("button", { name: /^Уточнить результат/ }).click();
  await page.getByText(state.data.items[0].title, { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("student sees the saved legacy decision, not the old percentage or missing review", async ({ page }) => {
  const { user } = await setup(page); await openLegacy(page);
  await page.getByLabel("Неактуально", { exact: true }).check();
  await page.getByLabel(/^Комментарий/).fill("Заменено новым заданием по теме");
  await page.getByRole("button", { name: "Сохранить решение" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Решение сохранено" })).toBeVisible();
  user.role = "student";
  await page.evaluate(user => localStorage.setItem("maestro_auth_user", JSON.stringify(user)), user);
  await page.goto("/tasks/school/old");
  await page.reload();
  await expect(page.getByText("Неактуально", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Заменено новым заданием по теме", { exact: true })).toBeVisible();
  await expect(page.getByText("80%", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/ещё не отметил результат/)).toHaveCount(0);
  await expect(page.getByText("баллов за занятие", { exact: true })).toBeVisible();
});
