import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

/**
 * Document 20, package 4 (В-41): opening the app renews the sign-in, at most once in 12 hours.
 * A failed network or a 5xx changes nothing; a 401 signs out.
 */
const PASSWORD = "QaMaestro2026!";
const HOUR = 60 * 60 * 1000;
const RENEWED_AT = "maestro_session_renewed_at";

type Session = { token: string; user: { id: string } };

// One sign-in per file: the login route allows 10 a minute, and these tests only need a session.
let cachedSession: Session | null = null;
async function studentSession(request: APIRequestContext): Promise<Session> {
  if (cachedSession) return cachedSession;
  const login = await request.post("/api/v1/auth/login", { data: { phone: "qa_student_1", password: PASSWORD, profile: "student" } });
  expect(login.ok(), await login.text()).toBe(true);
  cachedSession = (await login.json()).data as Session;
  return cachedSession;
}

async function signIn(context: BrowserContext, session: Session, renewedAgoMs: number | null) {
  await context.addInitScript(({ token, user, renewedAt }) => {
    // Written once per tab, not at every navigation: a reload must see what the app stored.
    if (window.sessionStorage.getItem("test-seeded")) return;
    window.sessionStorage.setItem("test-seeded", "1");
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
    if (renewedAt !== null) window.localStorage.setItem("maestro_session_renewed_at", String(renewedAt));
  }, { ...session, renewedAt: renewedAgoMs === null ? null : Date.now() - renewedAgoMs });
}

test("opening the app renews the session when the last renewal is older than 12 hours", async ({ page, request, context }) => {
  const session = await studentSession(request);
  await signIn(context, session, 13 * HOUR);
  const refreshed = page.waitForResponse((response) => response.url().endsWith("/api/v1/auth/refresh") && response.request().method() === "POST");
  await page.goto("/dashboard");
  const response = await refreshed;
  expect(response.status()).toBe(200);
  const renewed = (await response.json()).data as { token: string; user: { id: string } };
  expect(renewed.user.id).toBe(session.user.id);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("maestro_access_token"))).toBe(renewed.token);
  const stamp = Number(await page.evaluate((key) => window.localStorage.getItem(key), RENEWED_AT));
  expect(Date.now() - stamp).toBeLessThan(60_000);
  await expect(page).toHaveURL(/\/dashboard/);
});

test("a renewal made less than 12 hours ago is not repeated", async ({ page, request, context }) => {
  await signIn(context, await studentSession(request), 1 * HOUR);
  let calls = 0;
  page.on("request", (req) => { if (req.url().endsWith("/api/v1/auth/refresh")) calls += 1; });
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-learning-summary")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("dashboard-learning-summary")).toBeVisible();
  expect(calls).toBe(0);
});

test("no network or a server error during the renewal keeps the student in and tries again next time", async ({ page, request, context }) => {
  const session = await studentSession(request);
  await signIn(context, session, 13 * HOUR);
  await page.route("**/api/v1/auth/refresh", (route) => route.abort("internetdisconnected"));
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-learning-summary")).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("maestro_access_token"))).toBe(session.token);

  await page.unroute("**/api/v1/auth/refresh");
  await page.route("**/api/v1/auth/refresh", (route) => route.fulfill({
    status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "boom" } }),
  }));
  await page.reload();
  await expect(page.getByTestId("dashboard-learning-summary")).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("maestro_access_token"))).toBe(session.token);
  // Not marked as renewed: the next opening asks again.
  const stamp = Number(await page.evaluate((key) => window.localStorage.getItem(key), RENEWED_AT));
  expect(Date.now() - stamp).toBeGreaterThan(12 * HOUR);
});

test("a rejected renewal (401) signs the student out", async ({ page, request, context }) => {
  await signIn(context, await studentSession(request), 13 * HOUR);
  await page.route("**/api/v1/auth/refresh", (route) => route.fulfill({
    status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Требуется вход" } }),
  }));
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  expect(await page.evaluate(() => window.localStorage.getItem("maestro_access_token"))).toBeNull();
});

test("a sign-out while the renewal is on its way is not undone by its answer", async ({ page, request, context }) => {
  const session = await studentSession(request);
  await signIn(context, session, 13 * HOUR);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/v1/auth/refresh", async (route) => {
    await gate;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { token: "late-token", user: session.user } }) });
  });
  const asked = page.waitForRequest((req) => req.url().endsWith("/api/v1/auth/refresh"));
  await page.goto("/dashboard");
  await asked;
  await page.evaluate(() => window.localStorage.removeItem("maestro_access_token"));
  release();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.localStorage.getItem("maestro_access_token"))).toBeNull();
});

test("the renewal is for students: a staff member never asks", async ({ page, request, context }) => {
  const login = await request.post("/api/v1/auth/login", { data: { phone: "qa_admin", password: PASSWORD, profile: "staff" } });
  expect(login.ok(), await login.text()).toBe(true);
  const admin = (await login.json()).data as Session;
  await signIn(context, admin, 13 * HOUR);
  let calls = 0;
  page.on("request", (req) => { if (req.url().endsWith("/api/v1/auth/refresh")) calls += 1; });
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin/);
  await page.waitForTimeout(800);
  expect(calls).toBe(0);
});
