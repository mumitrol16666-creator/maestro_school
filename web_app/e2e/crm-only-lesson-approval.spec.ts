import { test, expect } from "@playwright/test";

test("only CRM approves a lesson; Platform shows role-appropriate status without writes", async ({ page }) => {
  const user = { id: "crm-only-fixture", firstName: "Администратор", lastName: "Проверка", role: "admin", permissions: ["offline_school.read", "offline_school.write"], productFeatures: { roleNavigationV2: true, lessonSyncV2: true } };
  await page.addInitScript(user => {
    localStorage.setItem("maestro_access_token", "isolated-crm-only-fixture");
    localStorage.setItem("maestro_auth_user", JSON.stringify(user));
    localStorage.setItem(`maestro:push-prompt-dismissed:${user.id}`, String(Date.now()));
  }, user);
  const lesson = { crmClassId: "billing-fixture", title: "Индивидуальный урок", date: "2026-09-23", startTime: "10:00", endTime: "10:45", status: "pending_admin_review", classType: "individual", teacher: { crmTeacherId: "teacher", name: "Преподаватель" }, topic: "Аккорды", lessonSummary: "Отработали переходы", materials: [], teacherOutcomeHint: "held" };
  const writes: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/v1/**", route => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api\/v1/, "");
    if (route.request().method() !== "GET") writes.push(path);
    const ok = (data: unknown) => route.fulfill({ json: { data } });
    if (path === "/auth/me") return ok(user);
    if (path.endsWith("/students")) return ok({ crmClassId: lesson.crmClassId, group: null, students: [{ crmStudentId: "pupil", appUserId: null, name: "Ученик Проверочный", attended: true, attendanceStatus: "present", recentLessons: [] }] });
    if (path.includes("/crm-sync-journal")) return ok({ events: [], conflicts: [] });
    if (path.endsWith("/draft") || path.endsWith("/report-versions")) return ok(null);
    if (path.endsWith(`/offline-lessons/${lesson.crmClassId}`)) return ok(lesson);
    return ok({ items: [], notifications: [], count: 0, unreadCount: 0, ready: false });
  });
  await page.goto(`/admin/offline-lessons/${lesson.crmClassId}`);
  await expect(page.getByText("Ожидает подтверждения в CRM", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Открыть расписание CRM" })).toHaveAttribute("href", /\/admin\.html#schedule$/);
  await expect(page.getByRole("button", { name: /^Подтвердить (урок|отсутствие)$/ })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Тема урока", exact: true })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Тема урока", exact: true })).toHaveValue("Аккорды");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
  user.role = "teacher";
  await page.reload();
  await expect(page.getByRole("link", { name: "Открыть расписание CRM" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Подтвердить (урок|отсутствие)$/ })).toHaveCount(0);
  lesson.status = "completed";
  user.role = "admin";
  await page.reload();
  await expect(page.getByText("Проведён", { exact: true })).toBeVisible();
  await expect(page.getByText("Ожидает подтверждения в CRM", { exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
