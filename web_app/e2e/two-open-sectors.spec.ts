import { test, expect, type Page } from "@playwright/test";

/**
 * 07.11 (P4): a direction may have two open sectors — the current one and the previous one waiting
 * for its exam. The API is mocked, so the spec needs only the web app.
 * Run on web dev 127.0.0.1:3330 (chromium and mobile-chromium); maestro-qa runs it again on its stack.
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

async function asStudent(page: Page, context: import("@playwright/test").BrowserContext, only?: "waiting") {
  const user = { id: "two-sectors-student", role: "student", audience: "school", firstName: "Ученик", lastName: "Пример", crmStudentId: "demo-student", permissions: [] };
  await context.addInitScript((value) => {
    localStorage.setItem("maestro_access_token", "mock-two-sectors");
    localStorage.setItem("maestro_auth_user", JSON.stringify(value));
  }, user);
  const plans = only === "waiting"
    ? [studentPlan(waitingId, 1, "awaiting_exam", "Первые аккорды")]
    : [studentPlan(currentId, 2, "active", "Переборы и бой"), studentPlan(waitingId, 1, "awaiting_exam", "Первые аккорды")];
  await installPlansRoute(page, user, plans);
}

async function installPlansRoute(page: Page, user: unknown, plans: unknown[]) {
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

test("with only the waiting sector left the student is not told they study in the next one", async ({ page, context }) => {
  await asStudent(page, context, "waiting");
  await page.goto("/monthly-plan");
  const plate = page.getByTestId("sector-awaiting-exam");
  await expect(plate).toContainText("Ждёт экзамена");
  await expect(plate).not.toContainText("следующем секторе");
  await expect(plate).toContainText("откроет после урока");
});

test("a parent reads the heading of the sector on screen and the waiting plate says what is true", async ({ page, context }) => {
  const user = { id: "two-sectors-parent", role: "parent", audience: "family", firstName: "Родитель", lastName: "Пример", permissions: [] };
  await context.addInitScript((value) => {
    localStorage.setItem("maestro_access_token", "mock-two-sectors-parent");
    localStorage.setItem("maestro_auth_user", JSON.stringify(value));
  }, user);
  const child = { id: "demo-student", firstName: "Камбар", lastName: "Казыбаев", fullName: "Камбар Казыбаев", relationship: "parent" };
  const overview = {
    child,
    visibility: { showSchedule: false, showBalance: false, showPlanProgress: true, showAchievements: false },
    summary: { profile: { groups: [] }, financialBalance: null, upcomingLessons: [], visits: [], results: null, crmUnavailable: false, crmStale: false, weekDigest: null },
  };
  let plans = [studentPlan(currentId, 2, "active", "Переборы и бой"), studentPlan(waitingId, 1, "awaiting_exam", "Первые аккорды")];
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/me")) data = user;
    else if (path.endsWith("/parents/me/children")) data = [child];
    else if (path.endsWith("/offline-summary")) data = overview;
    else if (path.endsWith("/monthly-plans")) data = { plans, recentExams: [], aggregateProgress: { completed: 0, total: 2, percent: 40 } };
    return route.fulfill({ json: { data } });
  });
  await page.goto("/family");
  const section = page.locator("#family-sector");
  await expect(section.getByRole("heading", { name: "Текущий сектор", exact: true })).toBeVisible();
  await section.getByRole("tab", { name: "Сектор 1 · ждёт экзамена" }).click();
  await expect(section.getByRole("heading", { name: "Сектор 1 · ждёт экзамена", exact: true })).toBeVisible();
  await expect(section.getByRole("heading", { name: "Текущий сектор", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("family-sector-awaiting-exam")).toContainText("Ребёнок уже занимается в следующем секторе");

  // The current sector was closed early: only the waiting one is left, and no one studies «in the next».
  plans = [studentPlan(waitingId, 1, "awaiting_exam", "Первые аккорды")];
  await page.reload();
  await expect(section.getByRole("heading", { name: "Сектор 1 · ждёт экзамена", exact: true })).toBeVisible();
  await expect(page.getByTestId("family-sector-awaiting-exam")).not.toContainText("следующем секторе");
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


test("on the lesson «+ Добавить тему» hides only for the direction whose waiting sector is shown; the other tab shows the warnings", async ({ page, context }) => {
  const user = { id: "two-sectors-lesson-teacher", role: "teacher", firstName: "Преподаватель", permissions: ["offline_school.read", "offline_school.write"], productFeatures: { learningTopicsV2: true, homeworkFlowV2: true, unifiedLessonV2: true } };
  const studentId = "two-sectors-lesson-student";
  const guitar = { id: "dir-guitar", title: "Гитара", crmDirectionId: "crm-guitar" };
  const piano = { id: "dir-piano", title: "Фортепиано", crmDirectionId: "crm-piano" };
  const topic = (id: string, title: string, percent: number, extra: Record<string, unknown> = {}) => ({ id, title, masteryCriteria: "", progressPercent: percent, masteredAt: null, planCompletionRewardPoints: 0, ...extra });
  const plan = (planId: string, direction: typeof guitar, sequence: number, status: string, topics: unknown[]) => ({
    planId, direction, topics, month: "2026-11", planCompletionRewardPoints: 0, status, sequence, scope: "student", ownerStudentId: studentId, canEditTopics: status === "active",
  });
  const lesson = { crmClassId: "two-sectors-lesson", title: "Индивидуальный урок", date: "2026-11-05", startTime: "10:15", endTime: "11:00", duration: 45, status: "started", classType: "individual", crmIndividualStudentId: studentId, teacher: { crmTeacherId: "crm-teacher", name: "Преподаватель" }, startedAt: "2026-11-05T05:15:00Z", group: null, room: null };
  const roster = (plans: unknown[]) => ({
    crmClassId: lesson.crmClassId,
    students: [{ crmStudentId: studentId, name: "Ученица Примерова", attended: true, attendanceStatus: "present", recentLessons: [] }],
    learningV2: {
      enabled: true, available: true, canApply: true, owner: { kind: "student", id: studentId }, rewardsEnabled: false, plans,
      students: [{ crmStudentId: studentId, name: "Ученица Примерова", appUserId: null, pendingHomework: [], recentHomework: [] }], rewardPreview: [],
    },
  });
  // Guitar: the current sector (with a topic that has a pending report) and the one waiting for its exam. Piano: one current.
  const withPiano = [
    plan("g-current", guitar, 2, "active", [topic("g2", "Переборы", 40, { pendingFromLesson: { date: "2026-11-03", approvedWaitingForEarlier: false }, approvedPercent: 20 })]),
    plan("g-waiting", guitar, 1, "awaiting_exam", [topic("g1", "Am и E", 70)]),
    plan("p-current", piano, 1, "active", [topic("p1", "Гамма До", 10)]),
  ];
  const guitarOnly = withPiano.slice(0, 2);
  let payload = roster(withPiano);
  await context.addInitScript((value) => {
    localStorage.setItem("maestro_access_token", "two-sectors-lesson");
    localStorage.setItem("maestro_auth_user", JSON.stringify(value));
  }, user);
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api\/v1/, "");
    let data: unknown = [];
    if (path === "/auth/me") data = user;
    else if (path.endsWith("/two-sectors-lesson/students")) data = payload;
    else if (path.endsWith("/two-sectors-lesson")) data = lesson;
    else if (path.endsWith("/draft") || path.endsWith("/report-versions")) data = null;
    else if (path.endsWith("/students-overview")) data = { students: [] };
    else if (path.includes("/lesson-templates")) data = { own: [], school: [] };
    return route.fulfill({ json: { data } });
  });

  async function openTopicsStep() {
    await page.goto(`/admin/offline-lessons/${lesson.crmClassId}`);
    const nav = page.getByTestId("lesson-step-nav");
    await expect(nav).toBeVisible();
    for (let index = 0; index < 3 && !(await page.getByText("Прогресс тем").isVisible()); index += 1) {
      await nav.getByRole("button", { name: "Далее" }).click();
    }
    await expect(page.getByText("Прогресс тем")).toBeVisible();
  }

  // Two directions: the waiting guitar tab does not take the button away from the piano.
  await openTopicsStep();
  const guitarTabs = page.getByRole("tablist", { name: "Секторы направления Гитара" });
  // The warning of the current sector is on its tab label, and the other tab shows the chosen topic where it is.
  await expect(guitarTabs.getByRole("tab", { name: /Сектор 2 · текущий.*1 предупреждение/ })).toBeVisible();
  await page.getByTestId("lesson-topic-option").filter({ hasText: "Переборы" }).click();
  await guitarTabs.getByRole("tab", { name: /Сектор 1 · ждёт экзамена/ }).click();
  await expect(page.getByTestId("lesson-selected-topic-elsewhere")).toContainText("Переборы");
  await expect(page.getByText("Выберите тему, чтобы изменить её прогресс")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ Добавить тему в сектор" })).toBeVisible();
  await page.getByRole("button", { name: "+ Добавить тему в сектор" }).click();
  const directionSelect = page.getByLabel("Направление сектора");
  await expect(directionSelect).toHaveCount(0);
  await expect(page.getByText("Тема сразу добавится в текущий опубликованный сектор «Фортепиано»")).toBeVisible();

  // Only the guitar: with its waiting sector on screen there is no button and no «add a topic now».
  payload = roster(guitarOnly);
  await openTopicsStep();
  await page.getByRole("tablist", { name: "Секторы направления Гитара" }).getByRole("tab", { name: /Сектор 1 · ждёт экзамена/ }).click();
  await expect(page.getByRole("button", { name: "+ Добавить тему в сектор" })).toHaveCount(0);
  await expect(page.getByText("Добавьте тему прямо сейчас")).toHaveCount(0);
  await page.getByRole("tablist", { name: "Секторы направления Гитара" }).getByRole("tab", { name: /Сектор 2 · текущий/ }).click();
  await expect(page.getByRole("button", { name: "+ Добавить тему в сектор" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("«Обучение» counts the current sector only and shows the waiting one on its own line", async ({ page, context }) => {
  const user = { id: "two-sectors-learning", role: "student", audience: "school", firstName: "Ученик", lastName: "Пример", crmStudentId: "demo-student", permissions: [], productFeatures: { homeworkFlowV2: true, learningTopicsV2: true } };
  await context.addInitScript((value) => {
    localStorage.setItem("maestro_access_token", "mock-two-sectors-learning");
    localStorage.setItem("maestro_auth_user", JSON.stringify(value));
    localStorage.setItem(`maestro:push-prompt-dismissed:${value.id}`, String(Date.now()));
  }, user);
  const waiting = { ...studentPlan(waitingId, 1, "awaiting_exam", "Первые аккорды"), progress: { completed: 7, inProgress: 0, total: 8, percent: 88 } };
  const current = { ...studentPlan(currentId, 2, "active", "Переборы и бой"), progress: { completed: 1, inProgress: 1, total: 3, percent: 33 } };
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api\/v1/, "");
    if (path === "/auth/me") return route.fulfill({ json: { data: user } });
    if (path === "/students/me/home") {
      const counts = { actionRequired: 0, totalActive: 0, waitingReview: 0, needsRevision: 0, completed: 0, bySource: { offline: 0, online: 0, course: 0, theory: 0 } };
      return route.fulfill({ json: { data: {
        generatedAt: new Date().toISOString(),
        dashboard: { currentCourse: null, progressPercent: 0, completedLessonsCount: 0, totalLessonsCount: 0, points: 0, level: null, nextAvailableLesson: null },
        school: { upcomingLessons: [], lessonHistory: [], profile: { name: "Ученик", groups: [] } },
        monthlyPlans: [current, waiting],
        tasks: { items: [], counts, partial: false },
        achievementsEarned: 0,
        sectorProposals: [],
      } } });
    }
    return route.fulfill({ json: { data: { items: [], notifications: [], count: 0, unreadCount: 0, ready: false } } });
  });
  await page.goto("/learning");
  const card = page.getByTestId("learning-sector-card");
  await expect(card).toContainText("1 из 3");
  await expect(card).not.toContainText("8 из 11");
  await expect(card.getByTestId("learning-sector-awaiting-exam")).toContainText("Мой сектор 1 ждёт экзамена");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
