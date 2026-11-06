import { test, expect } from "@playwright/test";
import pack from "../../content/sector-1-basic-preparation.json";

test("sector materials are readable without presenting their percentage as exam readiness", async ({ page, context }, info) => {
  const user = { id: "sector-design-demo", role: "student", audience: "school", firstName: "Ученик", lastName: "Пример", crmStudentId: "demo-student", permissions: [] };
  await context.addInitScript(user => {
    localStorage.setItem("maestro_access_token", "mock-sector-design");
    localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, user);
  const items = pack.template.topics.map((topic, index) => ({ id: `topic-${index}`, title: topic.title, masteryCriteria: topic.masteryCriteria,
    status: index < 6 ? "completed" : index < 14 ? "in_progress" : "planned", progressPercent: index < 6 ? 100 : index < 14 ? 40 : 0, state: "active" }));
  const plan = { id: "sector-demo", scope: "student", targetId: "demo-student", month: "2026-11", sequence: 1, status: "active", teacher: { name: "Преподаватель Maestro" }, goal: pack.template.title,
    expectedResult: "Простые мелодии, открытые аккорды, два боя и первые песни. Темп обучения подбираем вместе с преподавателем.", direction: { id: "guitar", crmDirectionId: "guitar", title: "Гитара" },
    items, progress: { completed: 6, inProgress: 8, total: 22, percent: 27 }, publishedAt: "2026-11-05T10:00:00Z", exam: null };
  const closed = { ...plan, id: "old-sector", sequence: 0, status: "closed", goal: "Прежний сектор", progress: { completed: 22, inProgress: 0, total: 22, percent: 100 } };
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url()); const p = url.pathname;
    let data: unknown = [];
    if (p.endsWith("/auth/me")) data = user;
    else if (p.endsWith("/students/me/monthly-plans")) data = { plans: url.searchParams.has("history") ? [plan, closed] : [plan], aggregateProgress: url.searchParams.has("history") ? { completed: 28, total: 44, percent: 64 } : plan.progress };
    else if (p.endsWith("/notifications/unread-count")) data = { count: 0 };
    return route.fulfill({ json: { data } });
  });
  await page.goto("/monthly-plan");
  await expect(page.getByRole("heading", { name: "Базовая подготовка", exact: true })).toBeVisible();
  if (process.env.SECTOR_DESIGN_BASELINE === "1") {
    await page.screenshot({ path: `/Library/Project/Maestro/output/sector-design-2026-11-06/before-${info.project.name}.png`, fullPage: true });
    return;
  }
  const chart = page.getByTestId("sector-progress-overview");
  await expect(chart).toContainText("6 из 22");
  await expect(chart).toContainText("пунктов освоено");
  await expect(page.getByText("Твой учебный маршрут", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "В работе · 8", exact: true }).click();
  await expect(page.getByTestId("sector-topic")).toHaveCount(8);
  await page.getByTestId("sector-topic").first().getByText("Критерий освоения", { exact: true }).click();
  await expect(page.getByText(/10 правильных и чисто звучащих постановок/).first()).toBeVisible();
  await page.getByRole("button", { name: "Все темы · 22", exact: true }).click();
  await expect(page.getByTestId("sector-topic")).toHaveCount(22);
  await page.getByRole("button", { name: "Закрытые секторы", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Закрытые секторы", exact: true })).toBeVisible();
  await expect(chart).toContainText("6 из 22");
  await expect(chart).not.toContainText("64%");
  await page.getByRole("button", { name: "Скрыть закрытые секторы", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.reload();
  await expect(page.getByTestId("sector-topic")).toHaveCount(22);
  await page.screenshot({ path: `/Library/Project/Maestro/output/sector-design-2026-11-06/after-${info.project.name}.png`, fullPage: true });
  await page.screenshot({ path: `/Library/Project/Maestro/output/sector-design-2026-11-06/preview-${info.project.name}.png` });
  const compact = { ...plan, goal: "Переход пауэр-аккордов", expectedResult: "", items: [
    { ...items[0], title: "Переход пауэр-аккордов", status: "planned", progressPercent: 0 },
    { ...items[1], title: "Power chords", status: "planned", progressPercent: 0 },
    { ...items[2], title: "1 модуль — 3 упражнения", status: "completed", progressPercent: 100 },
    { ...items[3], title: "2 модуль", status: "in_progress", progressPercent: 50 },
    { ...items[4], title: "Seven Nation Army", status: "planned", progressPercent: 0 },
  ], progress: { completed: 1, inProgress: 1, total: 5, percent: 20 } };
  await page.route("**/api/v1/students/me/monthly-plans**", route => route.fulfill({ json: { data: { plans: [compact], aggregateProgress: compact.progress } } }));
  await page.reload();
  await expect(page.getByTestId("sector-topic")).toHaveCount(5);
  await expect(chart).toContainText("1 из 5");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (info.project.name === "chromium") await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({ path: `/Library/Project/Maestro/output/sector-design-2026-11-06/compact-${info.project.name}.png`, fullPage: true });
});
