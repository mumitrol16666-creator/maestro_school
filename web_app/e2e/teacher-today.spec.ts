import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

const PASSWORD = "QaMaestro2026!";

async function signInAsTeacher(request: APIRequestContext, context: BrowserContext) {
  const response = await request.post("/api/v1/auth/login", {
    data: { phone: "qa_teacher_1", password: PASSWORD, profile: "staff" },
  });
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, payload.data);
}

test("the teacher's home is «Сегодня» with lessons, reports, proposals and messages", async ({ page, request, context }) => {
  await signInAsTeacher(request, context);
  await page.goto("/admin");

  await expect(page.getByRole("heading", { name: "Сегодня", level: 1 })).toBeVisible();
  const today = page.getByTestId("teacher-today");
  await expect(today).toBeVisible();
  for (const section of ["today-lessons", "today-reports", "today-proposals", "today-messages"]) {
    await expect(today.getByTestId(section)).toBeVisible();
  }
  await expect(today.getByRole("link", { name: "Всё расписание" })).toHaveAttribute("href", "/admin/offline-lessons");

  // Every lesson row and every owed report opens its lesson.
  const firstLesson = today.getByTestId("today-lessons").getByRole("link").filter({ hasText: /\d{2}:\d{2}/ }).first();
  if (await firstLesson.count()) {
    await expect(firstLesson).toHaveAttribute("href", /\/admin\/offline-lessons\//);
  }
  const firstReport = today.getByTestId("today-reports").getByRole("link").first();
  if (await firstReport.count()) {
    await expect(firstReport).toHaveAttribute("href", /\/admin\/offline-lessons\//);
  }
});

test("«Сегодня» fits a 375px phone without horizontal scroll", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signInAsTeacher(request, context);
  await page.goto("/admin");
  await expect(page.getByTestId("teacher-today")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  // A parent with overflow hidden would clip instead of scroll: nothing may reach past the viewport.
  const clipped = await page.evaluate(() => [...document.querySelectorAll("[data-testid=teacher-today] *")]
    .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1).length);
  expect(clipped).toBe(0);
});

test("«Сегодня» shows overdue items first and keeps its sections when nothing is due", async ({ page, context }) => {
  const user = { id: "00000000-0000-4000-8000-000000000011", firstName: "Учитель", lastName: "QA", role: "teacher", permissions: ["offline_school.read"] };
  await context.addInitScript((value) => {
    window.localStorage.setItem("maestro_access_token", "today-fixture");
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(value));
  }, user);
  const base = {
    generatedAt: "2026-10-19T05:30:00.000Z",
    date: "2026-10-19",
    crm: { agendaAvailable: true, agendaFromCache: false, rosterAvailable: true },
    lessons: [],
    reports: [],
    proposals: { total: 0, items: [] },
    messages: { unread: 0 },
    birthdays: [],
  };
  let today: Record<string, unknown> = {
    ...base,
    attention: [
      { kind: "reports_overdue", tone: "danger", count: 2, title: "Просроченные отчёты", href: "#today-reports" },
      { kind: "messages_unread", tone: "info", count: 3, title: "Непрочитанные сообщения", href: "/admin/messages" },
    ],
    messages: { unread: 3 },
    birthdays: [{ crmStudentId: "s1", name: "Казыбаев Камбар", daysUntil: 0, age: 14 }],
  };
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api\/v1/, "");
    if (path === "/auth/me") return route.fulfill({ json: { data: user } });
    if (path === "/teachers/me/today") return route.fulfill({ json: { data: today } });
    return route.fulfill({ json: { data: { items: [], tasks: [], notifications: [], count: 0, unreadCount: 0 }, meta: { total: 0 } } });
  });

  await page.goto("/admin");
  const attention = page.getByTestId("today-attention");
  await expect(attention.getByRole("link").first()).toContainText("Просроченные отчёты");
  await expect(attention).toContainText("Непрочитанные сообщения");
  await expect(page.getByTestId("today-birthdays")).toContainText("сегодня");

  today = { ...base, attention: [] };
  await page.getByRole("button", { name: "Обновить день" }).click();
  await expect(page.getByText("Всё закрыто", { exact: false })).toBeVisible();
  await expect(page.getByText("Сегодня уроков нет.")).toBeVisible();
  await expect(page.getByText("Все отчёты отправлены.")).toBeVisible();
});
