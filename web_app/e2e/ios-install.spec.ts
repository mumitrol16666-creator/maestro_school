import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

/**
 * Document 20, package 4 (В-40, В-41): the app is installed on iPhone through Safari, the APK is
 * only for Android, one card at a time at the bottom of the screen, and the sign-in screen says
 * whom to write to when the password is forgotten.
 */
const PASSWORD = "QaMaestro2026!";
const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.111 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

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

async function signIn(context: BrowserContext, session: Session) {
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
    window.localStorage.setItem("maestro_session_renewed_at", String(Date.now()));
  }, session);
}

/** Safari in a browser tab has no PushManager; the page must not pretend otherwise. */
async function withoutPush(context: BrowserContext) {
  await context.addInitScript(() => { delete (window as unknown as { PushManager?: unknown }).PushManager; });
}

async function openSettings(page: Page) {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Настройки" }).click();
  await expect(page.getByTestId("profile-section-settings")).toBeVisible();
}

test.describe("iPhone, Safari tab", () => {
  test.use({ userAgent: IPHONE_SAFARI, viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the profile shows the three Safari steps, no APK and no Chrome menu", async ({ page, request, context }) => {
    await signIn(context, await studentSession(request));
    await withoutPush(context);
    await openSettings(page);
    const steps = page.getByTestId("ios-install-steps").first();
    await expect(steps).toBeVisible();
    await expect(steps).toContainText("Нажми «Поделиться» внизу экрана");
    await expect(steps).toContainText("Выбери «На экран „Домой“»");
    await expect(steps).toContainText("Нажми «Добавить»");
    await expect(steps.locator("svg").first()).toBeVisible();
    await expect(page.getByText("Скачать APK")).toHaveCount(0);
    await expect(page.getByText(/Android/)).toHaveCount(0);
    await expect(page.getByText(/меню ⋮/)).toHaveCount(0);
    await expect(page.getByText("Установить приложение", { exact: true })).toHaveCount(0);
    // The steps are shown once; the notification card only points to them.
    await expect(page.getByTestId("ios-install-steps")).toHaveCount(1);
    await expect(page.getByRole("link", { name: /Как установить приложение/ })).toHaveAttribute("href", "#pwa-install-card");
    await expect(page.getByText("На iPhone уведомления работают в приложении с экрана «Домой» (iOS 16.4 и новее)")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("the sign-in screen has no Android download and says whom to write to", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("forgot-password")).toContainText("Забыл пароль? Напиши администратору");
    await expect(page.getByText("Скачать приложение для Android")).toHaveCount(0);
    await page.setViewportSize({ width: 320, height: 640 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("an installed app on iPhone gets no install card", async ({ page, request, context }) => {
    await signIn(context, await studentSession(request));
    await context.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
    await openSettings(page);
    await expect(page.getByTestId("pwa-install-card")).toHaveCount(0);
    await expect(page.getByTestId("ios-install-steps")).toHaveCount(0);
    await expect(page.getByText("Установлено")).toHaveCount(0);
  });
});

test.describe("iPad with a desktop user agent", () => {
  test.use({ userAgent: IPAD_DESKTOP_UA, viewport: { width: 820, height: 1180 }, hasTouch: true });

  test("is treated as iOS: Safari steps, no APK", async ({ page, request, context }) => {
    await signIn(context, await studentSession(request));
    await withoutPush(context);
    await context.addInitScript(() => Object.defineProperty(navigator, "maxTouchPoints", { value: 5 }));
    await openSettings(page);
    await expect(page.getByTestId("ios-install-steps").first()).toContainText("вверху экрана");
    await expect(page.getByText("Скачать APK")).toHaveCount(0);
  });
});

test.describe("iPhone, Chrome", () => {
  test.use({ userAgent: IPHONE_CHROME, viewport: { width: 390, height: 844 }, hasTouch: true });

  test("asks to open the page in Safari instead of showing the steps or the APK", async ({ page, request, context }) => {
    await signIn(context, await studentSession(request));
    await withoutPush(context);
    await openSettings(page);
    await expect(page.getByTestId("ios-open-in-safari").first()).toContainText("Открой эту страницу в Safari, чтобы установить приложение");
    await expect(page.getByTestId("ios-install-steps")).toHaveCount(0);
    await expect(page.getByText("Скачать APK")).toHaveCount(0);
    await expect(page.getByText(/меню ⋮/)).toHaveCount(0);
  });
});

test.describe("Android", () => {
  test.use({ userAgent: ANDROID_CHROME, viewport: { width: 412, height: 915 }, hasTouch: true });

  test("keeps the APK and the Chrome instruction", async ({ page, request, context }) => {
    await signIn(context, await studentSession(request));
    await openSettings(page);
    await expect(page.getByRole("link", { name: "Скачать APK" })).toBeVisible();
    await expect(page.getByTestId("pwa-install-card")).toContainText("Chrome");
    await expect(page.getByTestId("ios-install-steps")).toHaveCount(0);
  });

  test("inside the installed app (TWA, standalone) there is no APK and no install card", async ({ page, request, context }) => {
    await signIn(context, await studentSession(request));
    await context.addInitScript(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => query.includes("display-mode: standalone")
        ? ({ matches: true, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } as MediaQueryList)
        : original(query);
    });
    await openSettings(page);
    await expect(page.getByText("Скачать APK")).toHaveCount(0);
    await expect(page.getByTestId("pwa-install-card")).toHaveCount(0);
  });

  test("the install card goes away when the app gets installed in the same tab", async ({ page, request, context }) => {
    await signIn(context, await studentSession(request));
    await openSettings(page);
    await expect(page.getByTestId("pwa-install-card")).toContainText("Приложение на телефоне");
    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await expect(page.getByTestId("pwa-install-card")).toHaveCount(0);
  });

  test("the install hint and the notification hint never show together; install goes first", async ({ page, request, context }) => {
    await signIn(context, await studentSession(request));
    await context.route("**/api/v1/push/vapid-public-key", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ data: { enabled: true, publicKey: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U" } }),
    }));
    await page.goto("/dashboard");
    const notify = page.getByRole("button", { name: "Включить уведомления" });
    await expect(notify).toBeVisible();

    await page.evaluate(() => window.dispatchEvent(new Event("beforeinstallprompt")));
    await expect(page.getByText("Добавить Maestro на главный экран")).toBeVisible();
    await expect(notify).toHaveCount(0);

    await page.getByRole("button", { name: "Позже" }).click();
    await expect(page.getByText("Добавить Maestro на главный экран")).toHaveCount(0);
    await expect(notify).toBeVisible();
  });
});

test.describe("sign-in screen, forgotten password", () => {
  test("the student is told «ты», the parent and the staff «вы»", async ({ page }) => {
    await page.goto("/login");
    const line = page.getByTestId("forgot-password");
    await expect(line).toContainText("Забыл пароль? Напиши администратору");
    await page.getByRole("button", { name: "Родитель" }).click();
    await expect(line).toContainText("Забыли пароль? Напишите администратору");
    await page.getByRole("button", { name: "Сотрудник" }).click();
    await expect(line).toContainText("Забыли пароль или нет доступа? Напишите администратору");
    await expect(page.getByText("Нет доступа к рабочему кабинету?")).toHaveCount(0);
    await page.getByRole("button", { name: "Ученик" }).click();
    await expect(line).toContainText("Забыл пароль? Напиши администратору");
  });

  test("the WhatsApp button, when the number is configured, is at least 44 px high", async ({ page }) => {
    await page.goto("/login");
    const button = page.getByTestId("forgot-password").getByRole("link", { name: "Написать в WhatsApp" });
    if (await button.count() === 0) {
      test.info().annotations.push({ type: "note", description: "NEXT_PUBLIC_SCHOOL_WHATSAPP is not set: the line stays without a button" });
      return;
    }
    await expect(button).toHaveAttribute("href", /^https:\/\/wa\.me\/\d{10,}$/);
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});
