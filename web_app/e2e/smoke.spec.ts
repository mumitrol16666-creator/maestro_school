import { expect, test } from "@playwright/test";

test("страница входа загружается без критической ошибки", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/login", { waitUntil: "domcontentloaded" });

  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "Вход ученика" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Войти в кабинет" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("устаревший клиентский модуль восстанавливается одной перезагрузкой", async ({ page }) => {
  await page.goto("/login");
  const startedAt = Date.now();
  await page.evaluate(() => window.sessionStorage.removeItem("maestro_client_runtime_recovery_at"));

  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.evaluate(() => {
      window.dispatchEvent(new PromiseRejectionEvent("unhandledrejection", {
        reason: new Error("ChunkLoadError: Loading chunk 123 failed"),
        promise: Promise.resolve(),
      }));
    }),
  ]);

  const recoveredAt = await page.evaluate(() => Number(
    window.sessionStorage.getItem("maestro_client_runtime_recovery_at") ?? 0,
  ));
  expect(recoveredAt).toBeGreaterThanOrEqual(startedAt);
  await expect(page.getByRole("heading", { name: "Вход ученика" })).toBeVisible();
  await expect(page).not.toHaveURL(/_maestro_refresh=/);
});

test("устаревший webpack runtime восстанавливается одной перезагрузкой", async ({ page }) => {
  await page.goto("/login");
  const startedAt = Date.now();
  await page.evaluate(() => window.sessionStorage.removeItem("maestro_client_runtime_recovery_at"));

  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.evaluate(() => {
      window.dispatchEvent(new PromiseRejectionEvent("unhandledrejection", {
        reason: new Error("TypeError: Cannot read properties of undefined (reading 'call') at __webpack_require__"),
        promise: Promise.resolve(),
      }));
    }),
  ]);

  const recoveredAt = await page.evaluate(() => Number(
    window.sessionStorage.getItem("maestro_client_runtime_recovery_at") ?? 0,
  ));
  expect(recoveredAt).toBeGreaterThanOrEqual(startedAt);
  await expect(page.getByRole("heading", { name: "Вход ученика" })).toBeVisible();
  await expect(page).not.toHaveURL(/_maestro_refresh=/);
});

test("открытая вкладка замечает новую версию до перехода", async ({ page }) => {
  let checks = 0;
  await page.route("**/app-version**", async (route) => {
    checks += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ version: "new-build" }),
    });
  });

  await page.goto("/login");
  await page.waitForFunction(() => Number(
    window.sessionStorage.getItem("maestro_client_runtime_recovery_at") ?? 0,
  ) > 0);

  expect(checks).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: "Вход ученика" })).toBeVisible();
});
