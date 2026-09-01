import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

const PASSWORD = "QaMaestro2026!";

async function signInAsStudent(request: APIRequestContext, context: BrowserContext) {
  const response = await request.post("/api/v1/auth/login", {
    data: { phone: "qa_student_1", password: PASSWORD, profile: "student" },
  });
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.data.user.productFeatures.roleNavigationV2).toBe(true);
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, payload.data);
}

test("student has exactly five first-level sections and profile stays in the avatar menu", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAsStudent(request, context);
  await page.goto("/dashboard");

  const navigation = page.getByTestId("student-primary-navigation");
  await expect(navigation.getByRole("link")).toHaveCount(5);
  await expect(navigation.getByRole("link", { name: /Главная/ })).toBeVisible();
  await expect(navigation.getByRole("link", { name: /Обучение/ })).toBeVisible();
  await expect(navigation.getByRole("link", { name: /Расписание/ })).toBeVisible();
  await expect(navigation.getByRole("link", { name: /Сообщения/ })).toBeVisible();
  await expect(navigation.getByRole("link", { name: /Магазин/ })).toBeVisible();
  await expect(navigation.getByRole("link", { name: /Профиль|Задания|План месяца|Недельная лига|Курсы|Тесты/ })).toHaveCount(0);

  await page.locator("header button[aria-haspopup='menu']").click();
  await expect(page.getByRole("menuitem", { name: "Профиль и настройки" })).toBeVisible();
});

test("legacy student links keep their parent section active", async ({ page, request, context }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAsStudent(request, context);

  const cases = [
    ["/tasks", "Обучение"],
    ["/monthly-plan", "Обучение"],
    ["/courses", "Обучение"],
    ["/progress", "Обучение"],
    ["/league", "Главная"],
    ["/board", "Главная"],
    ["/online-lessons", "Расписание"],
    ["/rewards", "Магазин"],
  ] as const;

  for (const [path, section] of cases) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const navigation = page.getByTestId("student-primary-navigation");
    await expect(navigation.getByRole("link", { name: new RegExp(section) })).toHaveAttribute("aria-current", "page");
  }
});

test("learning and shop expose compact secondary navigation", async ({ page, request, context }) => {
  await signInAsStudent(request, context);
  await page.goto("/learning");

  await expect(page.getByRole("heading", { name: "Обучение", exact: true })).toBeVisible();
  const learningNavigation = page.getByTestId("student-learning-navigation");
  await expect(learningNavigation.getByRole("link", { name: "Сейчас" })).toHaveAttribute("aria-current", "page");
  await expect(learningNavigation.getByRole("link", { name: "План" })).toBeVisible();
  await expect(learningNavigation.getByRole("link", { name: "Задания" })).toBeVisible();
  await learningNavigation.getByRole("button", { name: "Ещё" }).click();
  await expect(learningNavigation.getByRole("menuitem", { name: "История обучения" })).toBeVisible();
  await expect(learningNavigation.getByRole("menuitem", { name: "Курсы" })).toBeVisible();
  await expect(learningNavigation.getByRole("menuitem", { name: "Тесты" })).toBeVisible();

  await page.goto("/rewards");
  const shopNavigation = page.getByTestId("student-shop-navigation");
  await expect(shopNavigation.getByRole("link", { name: /Товары за ₸/ })).toHaveAttribute("href", "https://shop.maestro.com.kz");
  await expect(shopNavigation.getByRole("link", { name: "За Coins" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Магазин", exact: true })).toBeVisible();
});

test("student workspace fits all required mobile widths", async ({ page, request, context }) => {
  await signInAsStudent(request, context);

  for (const width of [320, 375, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/learning");

    const mobileNavigation = page.getByTestId("student-mobile-navigation");
    await expect(mobileNavigation.getByRole("link")).toHaveCount(5);
    await expect(mobileNavigation.getByText("Профиль", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("student-learning-navigation")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
});

test("mobile tasks show every source filter and schedule starts with the nearest lesson", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsStudent(request, context);

  await page.goto("/tasks");
  const sourceFilters = page.getByTestId("task-source-filters");
  await expect(sourceFilters.getByRole("button")).toHaveCount(4);
  await expect(sourceFilters.getByRole("button", { name: "Все", exact: true })).toBeVisible();
  await expect(sourceFilters.getByRole("button", { name: "Курсы", exact: true })).toBeVisible();
  await expect(sourceFilters.getByRole("button", { name: "С преподавателем", exact: true })).toBeVisible();
  await expect(sourceFilters.getByRole("button", { name: "Онлайн", exact: true })).toBeVisible();

  await page.goto("/school-lessons");
  const nearestLessons = page.getByRole("heading", { name: "Ближайшие уроки", exact: true });
  const balance = page.getByText("на вашем балансе", { exact: true });
  await expect(nearestLessons).toBeVisible();
  await expect(balance).toBeVisible();
  const nearestBox = await nearestLessons.boundingBox();
  const balanceBox = await balance.boundingBox();
  expect(nearestBox).not.toBeNull();
  expect(balanceBox).not.toBeNull();
  expect(nearestBox!.y).toBeLessThan(balanceBox!.y);

  const overflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ));
  expect(overflow).toBeLessThanOrEqual(1);
});

test("mobile task filters keep the screen stable and an offline task opens", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsStudent(request, context);

  let releaseWaitingRequest: (() => void) | undefined;
  const waitingRequest = new Promise<void>((resolve) => {
    releaseWaitingRequest = resolve;
  });
  await page.route("**/api/v1/students/me/tasks**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("status") === "waiting_review") await waitingRequest;
    await route.continue();
  });

  await page.goto("/tasks?source=offline");
  const states = page.getByTestId("task-state-filters");
  const results = page.getByTestId("task-results");
  await expect(states.getByRole("button")).toHaveCount(3);
  await expect(states.getByRole("button", { name: /Нужно сделать/ })).toHaveAttribute("aria-pressed", "true");

  await states.getByRole("button", { name: /На проверке/ }).click();
  await expect(page).toHaveURL(/view=waiting/);
  await expect(page.getByRole("heading", { name: "Задания", exact: true })).toBeVisible();
  await expect(results).toBeVisible();
  await expect(results).toHaveAttribute("aria-busy", "true");
  await expect(page.getByText("Собираем задания из всех разделов", { exact: true })).toHaveCount(0);

  releaseWaitingRequest?.();
  await expect(results).toHaveAttribute("aria-busy", "false");
  await expect(states.getByRole("button", { name: /На проверке/ })).toHaveAttribute("aria-pressed", "true");

  await states.getByRole("button", { name: /Нужно сделать/ }).click();
  await expect(results).toHaveAttribute("aria-busy", "false");
  const taskLink = results.getByRole("link", { name: /Посмотреть/ }).first();
  await expect(taskLink).toBeVisible();
  await taskLink.click();
  await expect(page).toHaveURL(/\/school-lessons\?tab=homework&lesson=/);
  await expect(page.getByRole("heading", { name: "Уроки", exact: true })).toBeVisible();
  await expect(page.getByText(/Application error/i)).toHaveCount(0);
});
