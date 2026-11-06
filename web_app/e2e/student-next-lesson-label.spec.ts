import { test, expect } from "@playwright/test";

for (const scenario of [
  { name: "future", isToday: false, status: "scheduled", heading: "Следующий урок", taskHeading: "К следующему уроку" },
  { name: "today", isToday: true, status: "scheduled", heading: "Сегодняшний урок", taskHeading: "К сегодняшнему уроку" },
  { name: "started", isToday: true, status: "started", heading: "Урок идёт", taskHeading: "К сегодняшнему уроку" },
]) test(`home identifies the ${scenario.name} lesson explicitly`, async ({ page, context }) => {
  const user = { id: "demo-label", role: "student", audience: "school", firstName: "Ученик", crmStudentId: "demo", permissions: [] };
  await context.addInitScript(user => { localStorage.setItem("maestro_access_token", "mock"); localStorage.setItem("maestro_auth_user", JSON.stringify(user)); }, user);
  const lesson = { crmClassId: "demo-lesson", title: "Индивидуальный урок", date: "2026-11-12T06:00:00Z", startTime: "11:00", endTime: "12:00", isToday: scenario.isToday, isTomorrow: false, status: scenario.status, teacherName: "Преподаватель", roomName: "Кабинет 1" };
  await page.route("**/api/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("weekly-league")) return route.fulfill({ status: 503, json: { error: { message: "Недоступно" } } });
    const data = path.endsWith("/auth/me") ? user : path.endsWith("/students/me/home") ? {
      generatedAt: "2026-11-06T04:00:00Z", school: null, schoolStatus: "not_linked", monthlyPlans: [], banners: [], tasks: null, streakWeeks: null, practice: null,
      dashboard: { points: 100, level: null, rank: null, currentCourse: null, nextAvailableLesson: null, progressPercent: 0, completedLessonsCount: 0, totalLessonsCount: 0 },
      today: { nextLesson: lesson, tasks: [{ id: "task", title: "Seven Nation Army", status: "todo", target: { href: "/tasks" } }], tasksTotal: 1 },
    } : [];
    return route.fulfill({ json: { data } });
  });
  await page.goto("/dashboard");
  const card = page.getByTestId("student-today");
  await expect(card.getByText(scenario.heading, { exact: true })).toBeVisible();
  await expect(card.getByText(scenario.taskHeading, { exact: true })).toBeVisible();
  if (!scenario.isToday) {
    await expect(card.getByRole("heading", { name: "Четверг, 12 ноября в 11:00" })).toBeVisible();
    await expect(card.getByText("Сегодня", { exact: true })).toHaveCount(0);
  }
});
