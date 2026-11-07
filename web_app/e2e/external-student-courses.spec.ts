import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

/**
 * Stage 4, step 6: the cabinet of a student outside the school — the menu, the course list and the
 * course page with the two kinds of lock, the paywall in the player, «Я оплатил», waiting, a
 * rejection with its reason, the profile with «Мои курсы». The data is made through the API (an
 * administrator makes priced courses and decides, a student registers as an outsider); the student's
 * own steps are made on the screen.
 *
 * Two tests stand on the part of the contract the server of this branch does not have yet and
 * therefore answer it themselves (`page.route`): the 409 COURSE_PRICE_CHANGED of a payment
 * request and `paymentRequired` of the home screen's next lesson. They are marked in their names.
 */

const PASSWORD = "QaMaestro2026!";
const run = Date.now().toString(36);

type Session = { token: string; user: { id: string } & Record<string, unknown> };

const sessions = new Map<string, Session>();

async function login(request: APIRequestContext, phone: string, profile: "staff" | "student" | "parent"): Promise<Session> {
  const known = sessions.get(phone);
  if (known) return known;
  const response = await request.post("/api/v1/auth/login", { data: { phone, password: PASSWORD, profile } });
  expect(response.ok(), await response.text()).toBe(true);
  const session = (await response.json()).data as Session;
  sessions.set(phone, session);
  return session;
}

async function installSession(context: BrowserContext, session: Session) {
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, session);
}

const auth = (session: Session) => ({ Authorization: `Bearer ${session.token}` });

async function api<T>(
  request: APIRequestContext,
  session: Session,
  method: "get" | "post" | "patch" | "put" | "delete",
  path: string,
  data?: unknown,
  expected: number[] = [200, 201],
): Promise<T> {
  const response = await request[method](`/api/v1${path}`, { headers: auth(session), data });
  expect(expected, `${method} ${path}: ${await response.text()}`).toContain(response.status());
  return (await response.json()).data as T;
}

/** A registration as the registration form does it: no school, so an outsider. */
async function registerOutsider(request: APIRequestContext, label: string): Promise<Session> {
  const digits = `${Date.now()}`.slice(-8) + String(Math.floor(Math.random() * 90) + 10);
  // The registration is limited to five a minute; a sixth waits for the window instead of failing.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await request.post("/api/v1/auth/register", {
      data: { firstName: "Внешний", lastName: label, phone: `+7 70${digits.slice(0, 9)}`, password: PASSWORD },
    });
    if (response.status() === 429) {
      const seconds = Number(/retry in (\d+)/.exec(await response.text())?.[1] ?? 10);
      await new Promise((resolve) => setTimeout(resolve, (seconds + 1) * 1000));
      continue;
    }
    expect(response.status(), await response.text()).toBe(201);
    return (await response.json()).data as Session;
  }
  throw new Error("the registration stayed rate limited");
}

const createdCourseIds: string[] = [];

async function makeCourse(
  request: APIRequestContext,
  admin: Session,
  label: string,
  priceKzt: number | null,
  lessons = 3,
) {
  const directions = await api<Array<{ id: string }>>(request, admin, "get", "/directions");
  const directionId = directions[0]?.id;
  expect(directionId, "the stand needs a direction").toBeTruthy();
  const title = `E2E внешний ${label} ${run}`;
  const course = await api<{ id: string }>(request, admin, "post", "/admin/courses", { directionId, title, priceKzt });
  createdCourseIds.push(course.id);
  const module = await api<{ id: string }>(request, admin, "post", "/admin/modules", { courseId: course.id, title: "Модуль 1", sortOrder: 1 });
  const lessonIds: string[] = [];
  for (let index = 1; index <= lessons; index += 1) {
    const lesson = await api<{ id: string }>(request, admin, "post", "/admin/lessons", {
      moduleId: module.id,
      title: `Урок ${index}`,
      sortOrder: index,
      isPublished: true,
    });
    lessonIds.push(lesson.id);
  }
  await api(request, admin, "post", `/admin/courses/${course.id}/publish`, { isPublished: true });
  return { id: course.id, title, lessonIds };
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

/**
 * The server checks the order of the course before the payment: a person reaches the paywall of
 * lesson 3 only after lessons 1 and 2 are done. This does it through the API.
 */
async function finishFreeLessons(request: APIRequestContext, session: Session) {
  await api(request, session, "post", `/courses/${paid.id}/enroll`);
  for (const lessonId of paid.lessonIds.slice(0, 2)) {
    await api(request, session, "post", `/lessons/${lessonId}/start`);
    await api(request, session, "post", `/lessons/${lessonId}/complete`);
  }
}

const navigation = (page: Page) =>
  page.locator("[data-testid=student-primary-navigation]:visible, [data-testid=student-mobile-navigation]:visible").first();

test.describe.configure({ mode: "serial", timeout: 90_000 });

let admin: Session;
let outsider: Session;
let paid: { id: string; title: string; lessonIds: string[] };
let free: { id: string; title: string; lessonIds: string[] };

test.beforeAll(async ({ request }, testInfo) => {
  test.setTimeout(120_000);
  admin = await login(request, "qa_admin", "staff");
  outsider = await registerOutsider(request, `${run}-${testInfo.project.name}`.slice(0, 40));
  paid = await makeCourse(request, admin, `платный-${testInfo.project.name}`, 12000);
  free = await makeCourse(request, admin, `бесплатный-${testInfo.project.name}`, null, 2);
  await api(request, admin, "put", "/admin/course-payments/settings", {
    kaspiPayUrl: "https://pay.kaspi.kz/pay/e2e-link",
    transferPhone: "+7 777 123-45-67",
    recipientName: "ИП Маэстро",
    hint: "Переведите сумму и нажмите «Я оплатил».",
  });
});

test.afterAll(async ({ request }) => {
  for (const id of createdCourseIds) {
    await request.delete(`/api/v1/admin/courses/${id}`, { headers: auth(admin) });
  }
});

test("the account is external and the menu has courses, tests and the profile only", async ({ page, context }) => {
  expect(outsider.user.audience).toBe("external");
  await installSession(context, outsider);
  await page.goto("/courses");
  const menu = navigation(page);
  await expect(menu.getByRole("link")).toHaveText([/Курсы/, /Тесты/, /Профиль/]);
  for (const school of ["Главная", "Обучение", "Расписание", "Сообщения"]) {
    await expect(menu.getByRole("link", { name: school })).toHaveCount(0);
  }
  // The header strip «Разделы обучения» (Сектор, Задания…) is the school's too.
  await expect(page.getByTestId("student-learning-navigation")).toHaveCount(0);
  await noOverflow(page);
});

test("the school's screens lead back to the courses", async ({ page, context }) => {
  await installSession(context, outsider);
  for (const path of ["/dashboard", "/school-lessons", "/monthly-plan", "/tasks", "/league", "/progress", "/learning", "/board"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/courses$/);
  }
});

test("the course list shows the price, the free lessons, the reward line and no Coins for a course", async ({ page, context }) => {
  await installSession(context, outsider);
  await page.goto("/courses");
  const paidCard = page.locator("a", { hasText: paid.title });
  await expect(paidCard.getByTestId("course-state")).toHaveText("12 000 ₸ за 6 месяцев");
  await expect(paidCard.getByTestId("course-free-note")).toHaveText("Первые 2 урока бесплатно");
  await expect(paidCard.getByTestId("course-reward")).toHaveText("+100 баллов за модуль, +250 за курс");
  const freeCard = page.locator("a", { hasText: free.title });
  await expect(freeCard.getByTestId("course-state")).toHaveText("Бесплатно");
  await expect(freeCard.getByTestId("course-free-note")).toHaveCount(0);
  await expect(page.getByText("Maestro Coins")).toHaveCount(0);
  await noOverflow(page);
});

test("the course page tells the two locks apart: «после оплаты» and «откроется после предыдущего»", async ({ page, context }) => {
  await installSession(context, outsider);
  await page.goto(`/courses/${paid.id}`);
  await expect(page.getByTestId("course-state")).toHaveText("12 000 ₸ за 6 месяцев");
  await expect(page.getByTestId("course-reward")).toHaveText("+100 баллов за модуль, +250 за курс");

  // Not started yet: the free lessons wait for «Начать обучение», the third needs the payment.
  const lessons = page.getByTestId("course-lesson");
  await expect(lessons).toHaveCount(3);
  await expect(lessons.nth(0).getByTestId("lesson-free-label")).toHaveText("бесплатно");
  await expect(lessons.nth(0).getByTestId("lesson-lock-label")).toHaveText("после начала курса");
  await expect(lessons.nth(2).getByTestId("lesson-lock-label")).toHaveText("после оплаты");
  await expect(lessons.nth(2).getByTestId("lesson-free-label")).toHaveCount(0);

  await page.getByRole("button", { name: "Начать обучение" }).click();
  await expect(lessons.nth(0).getByTestId("lesson-lock-label")).toHaveCount(0);
  await expect(lessons.nth(0)).toHaveAttribute("data-lock", "open");
  // The second free lesson is closed by the order of the course, the third by the payment.
  await expect(lessons.nth(1).getByTestId("lesson-lock-label")).toHaveText("откроется после предыдущего");
  await expect(lessons.nth(1).getByTestId("lesson-free-label")).toHaveText("бесплатно");
  await expect(lessons.nth(1).getByTestId("lesson-paid-label")).toHaveCount(0);
  // The third is closed by both: the order is the main word, «платный» a small mark, and it leads to the
  // course (not to the paywall, the lesson before it is not done yet).
  await expect(lessons.nth(2).getByTestId("lesson-lock-label")).toHaveText("откроется после предыдущего");
  await expect(lessons.nth(2).getByTestId("lesson-paid-label")).toHaveText("платный");
  await expect(lessons.nth(2)).toHaveAttribute("data-lock", "order_payment");
  await expect(lessons.nth(2)).toHaveAttribute("href", `/courses/${paid.id}`);
  await noOverflow(page);
});

test("lesson 3 is the paywall; a payment request goes, the payment page opens in a new tab and the number copies", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // The server checks the order of the course before the payment: lessons 1 and 2 are done first, so
  // that lesson 3 is closed only by the payment.
  await finishFreeLessons(request, outsider);
  await installSession(context, outsider);
  await page.goto(`/lessons/${paid.lessonIds[2]}`);

  const paywall = page.getByTestId("course-paywall");
  await expect(paywall).toBeVisible();
  await expect(paywall.getByRole("heading", { name: paid.title })).toBeVisible();
  await expect(paywall.getByTestId("paywall-price")).toHaveText("12 000 ₸ за 6 месяцев");
  await expect(paywall).toContainText("Доступ на 6 месяцев");
  // No video, no materials, no homework of the lesson: only the paywall.
  await expect(page.getByRole("button", { name: "Начать урок" })).toHaveCount(0);

  const kaspi = paywall.getByTestId("paywall-kaspi");
  await expect(kaspi).toHaveText(/Оплатить через Kaspi Pay/);
  await expect(kaspi).toHaveAttribute("href", "https://pay.kaspi.kz/pay/e2e-link");
  await expect(kaspi).toHaveAttribute("target", "_blank");
  await expect(kaspi).toHaveAttribute("rel", /noopener/);

  await expect(paywall.getByTestId("paywall-phone")).toHaveText("+7 777 123-45-67");
  await expect(paywall).toContainText("ИП Маэстро");
  await expect(paywall.getByTestId("paywall-hint")).toContainText("Переведите сумму");
  await paywall.getByRole("button", { name: "Скопировать" }).click();
  await expect(paywall.getByRole("button", { name: "Номер скопирован" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("+77771234567");

  // The buttons are at least 44 px high.
  for (const button of [paywall.getByTestId("paywall-paid"), paywall.getByRole("button", { name: /Скопировать|Номер скопирован/ })]) {
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await noOverflow(page);

  await paywall.getByLabel("Комментарий (необязательно)").fill("Перевёл с карты Kaspi");
  const sent = page.waitForRequest((req) => req.method() === "POST" && req.url().endsWith(`/courses/${paid.id}/payment-requests`));
  await paywall.getByTestId("paywall-paid").click();
  // The request carries the price the person saw.
  expect((await sent).postDataJSON()).toMatchObject({ expectedPriceKzt: 12000, payerNote: "Перевёл с карты Kaspi" });

  const banner = page.getByTestId("paywall-sent");
  await expect(banner).toContainText("Заявка отправлена");
  await expect(banner).toContainText("Откроем доступ после проверки оплаты");
  // A second press is not possible: the form is gone.
  await expect(paywall.getByTestId("paywall-paid")).toHaveCount(0);

  const requests = await api<Array<{ courseId: string; status: string; payerNote: string }>>(request, outsider, "get", "/students/me/course-payment-requests");
  expect(requests.filter((item) => item.courseId === paid.id)).toEqual([
    expect.objectContaining({ status: "pending", payerNote: "Перевёл с карты Kaspi" }),
  ]);
});

test("a waiting request shows only the waiting card, on the lesson, in the list and in the profile", async ({ page, context }) => {
  await installSession(context, outsider);
  await page.goto(`/lessons/${paid.lessonIds[2]}`);
  const pending = page.getByTestId("paywall-pending");
  await expect(pending).toContainText("Ждём подтверждения оплаты");
  await expect(page.getByTestId("paywall-paid")).toHaveCount(0);
  await expect(page.getByTestId("paywall-kaspi")).toHaveCount(0);

  await page.goto("/courses");
  await expect(page.locator("a", { hasText: paid.title }).getByTestId("course-state")).toHaveText("Ждём подтверждения оплаты");

  await page.goto(`/courses/${paid.id}`);
  await expect(page.getByTestId("course-state")).toHaveText("Ждём подтверждения оплаты");
  await expect(page.getByTestId("course-pay")).toHaveCount(0);

  await page.goto("/settings");
  await expect(page.getByTestId("external-my-courses")).toContainText(paid.title);
  const row = page.getByTestId("external-payment-request").filter({ hasText: paid.title });
  await expect(row).toContainText("Ждём подтверждения оплаты");
  await expect(row).toContainText("12 000 ₸");
  // The profile of an outsider has no school groups, memberships or Coins.
  await expect(page.getByText("Учебные группы")).toHaveCount(0);
  await expect(page.getByText("Бонусы Maestro")).toHaveCount(0);
  await noOverflow(page);
});

test("a rejection shows its reason and the request can be sent again", async ({ page, context, request }) => {
  const [pendingRequest] = (await api<Array<{ id: string; courseId: string; status: string }>>(request, outsider, "get", "/students/me/course-payment-requests"))
    .filter((item) => item.courseId === paid.id && item.status === "pending");
  await api(request, admin, "post", `/admin/course-payments/requests/${pendingRequest.id}/reject`, { note: "Перевод на эту сумму не найден" });

  await installSession(context, outsider);
  await page.goto(`/lessons/${paid.lessonIds[2]}`);
  await expect(page.getByTestId("paywall-history")).toHaveText("Оплата не найдена: Перевод на эту сумму не найден");
  const resend = page.getByTestId("paywall-paid");
  await expect(resend).toHaveText("Отправить заявку снова");

  await page.goto("/settings");
  const row = page.getByTestId("external-payment-request").filter({ hasText: paid.title }).first();
  await expect(row).toContainText("Оплата не найдена");
  await expect(row).toContainText("Причина: Перевод на эту сумму не найден");

  await page.goto(`/lessons/${paid.lessonIds[2]}`);
  await page.getByTestId("paywall-paid").click();
  await expect(page.getByTestId("paywall-sent")).toContainText("Заявка отправлена");
});

test("a request sent from another tab meanwhile is met quietly with the waiting card", async ({ page, context, request }) => {
  // The previous test left a waiting request; a new student of the same kind shows the race alone.
  const second = await registerOutsider(request, `гонка-${run}`);
  await finishFreeLessons(request, second);
  await installSession(context, second);
  await page.goto(`/lessons/${paid.lessonIds[2]}`);
  await expect(page.getByTestId("paywall-paid")).toBeVisible();
  // The same person sends it from elsewhere (a second tab, the app on the phone).
  await api(request, second, "post", `/courses/${paid.id}/payment-requests`, { expectedPriceKzt: 12000 });
  await page.getByTestId("paywall-paid").click();
  await expect(page.getByTestId("paywall-sent")).toBeVisible();
  await expect(page.getByTestId("course-paywall").getByRole("alert")).toHaveCount(0);
});

test("when the price changed meanwhile the person is told and sees the new price [409 answered by the test: the server of this branch does not send it yet]", async ({ page, context, request }) => {
  const third = await registerOutsider(request, `цена-${run}`);
  await finishFreeLessons(request, third);
  await installSession(context, third);
  await page.goto(`/lessons/${paid.lessonIds[2]}`);
  await expect(page.getByTestId("paywall-price")).toHaveText("12 000 ₸ за 6 месяцев");

  // The administrator raises the price; the first press is answered with the new one.
  await api(request, admin, "patch", `/admin/courses/${paid.id}`, { priceKzt: 15000 });
  const bodies: unknown[] = [];
  let first = true;
  await page.route(`**/courses/${paid.id}/payment-requests`, async (route) => {
    bodies.push(route.request().postDataJSON());
    if (first) {
      first = false;
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "COURSE_PRICE_CHANGED", message: "Цена курса изменилась", details: { priceKzt: 15000 } } }),
      });
      return;
    }
    await route.continue();
  });

  await page.getByTestId("paywall-paid").click();
  await expect(page.getByTestId("paywall-price-changed")).toHaveText("Цена изменилась: теперь 15 000 ₸");
  await expect(page.getByTestId("paywall-price")).toHaveText("15 000 ₸ за 6 месяцев");
  await page.getByTestId("paywall-paid").click();
  await expect(page.getByTestId("paywall-sent")).toBeVisible();
  expect(bodies.map((body) => (body as { expectedPriceKzt: number }).expectedPriceKzt)).toEqual([12000, 15000]);
  await api(request, admin, "patch", `/admin/courses/${paid.id}`, { priceKzt: 12000 });
});

test("a confirmed payment turns «после оплаты» into the order of the course and shows the dates of the access", async ({ page, context, request }) => {
  const fresh = await registerOutsider(request, `оплачен-${run}`);
  const requestId = (await api<{ id: string }>(request, fresh, "post", `/courses/${paid.id}/payment-requests`, { expectedPriceKzt: 12000 })).id;
  await api(request, admin, "post", `/admin/course-payments/requests/${requestId}/confirm`, {});
  await api(request, fresh, "post", `/courses/${paid.id}/enroll`);

  await installSession(context, fresh);
  await page.goto(`/courses/${paid.id}`);
  await expect(page.getByTestId("course-state")).toContainText(/^Доступ до \d{2}\.\d{2}\.\d{4}$/);
  await expect(page.getByTestId("course-free-note")).toHaveCount(0);
  await expect(page.getByTestId("course-pay")).toHaveCount(0);
  const lessons = page.getByTestId("course-lesson");
  await expect(lessons.nth(0)).toHaveAttribute("data-lock", "open");
  // Paid: the third lesson now waits only for the lessons before it.
  await expect(lessons.nth(2).getByTestId("lesson-lock-label")).toHaveText("откроется после предыдущего");
  await expect(page.getByTestId("lesson-lock-label").filter({ hasText: "после оплаты" })).toHaveCount(0);
  await expect(page.getByTestId("lesson-free-label")).toHaveCount(0);

  await page.goto(`/lessons/${paid.lessonIds[2]}`);
  await expect(page.getByTestId("course-paywall")).toHaveCount(0);

  await page.goto("/settings");
  await expect(page.getByTestId("external-my-courses")).toContainText(/Доступ до \d{2}\.\d{2}\.\d{4}/);
  await expect(page.getByTestId("external-payment-request").first()).toContainText("Оплата подтверждена");
});

test("a course without a price is open as a whole", async ({ page, context, request }) => {
  const reader = await registerOutsider(request, `бесплатно-${run}`);
  await installSession(context, reader);
  await page.goto(`/courses/${free.id}`);
  await expect(page.getByTestId("course-state")).toHaveText("Бесплатно");
  await expect(page.getByTestId("course-pay")).toHaveCount(0);
  await expect(page.getByTestId("lesson-lock-label").filter({ hasText: "после оплаты" })).toHaveCount(0);
  await expect(page.getByTestId("lesson-free-label")).toHaveCount(0);
});

test("the profile leads to a trial lesson", async ({ page, context }) => {
  await installSession(context, outsider);
  await page.goto("/settings");
  const trial = page.getByTestId("external-trial").getByRole("link", { name: /Записаться на пробный урок/ });
  await expect(trial).toHaveAttribute("href", "/trial-lesson");
  expect((await trial.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await trial.click();
  await expect(page).toHaveURL(/\/trial-lesson$/);
});

test("an outsider's account menu shows points but no Coins, and a course leads back to the course list", async ({ page, context }) => {
  await installSession(context, outsider);
  await page.goto(`/courses/${paid.id}`);
  await expect(page.getByRole("link", { name: "Курсы", exact: true }).first()).toBeVisible();
  await page.locator("header button[aria-haspopup=menu]").click();
  await expect(page.getByRole("menu")).toContainText("Maestro");
  await expect(page.getByText("Maestro Coins")).toHaveCount(0);
});

test("a school student reads «Входит в твоё обучение» and keeps the school menu [needs the school student of the stand]", async ({ page, context, request }) => {
  const school = await login(request, "qa_student_1", "student");
  expect(school.user.audience).toBe("school");
  const included = await makeCourse(request, admin, "в школе", 9000, 3);
  await api(request, admin, "patch", `/admin/courses/${included.id}`, { includedInSchool: true });

  await installSession(context, school);
  await page.goto(`/courses/${included.id}`);
  await expect(page.getByTestId("course-state")).toHaveText("Входит в твоё обучение");
  await expect(page.getByTestId("lesson-lock-label").filter({ hasText: "после оплаты" })).toHaveCount(0);
  await expect(page.getByTestId("course-pay")).toHaveCount(0);
  await expect(navigation(page).getByRole("link", { name: /Расписание/ })).toBeVisible();

  // And the school student's home does not send anyone to the courses.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("the home screen says «Оплатить курс» when the next lesson needs the payment [the field is answered by the test: the server of this branch does not send it yet]", async ({ page, context, request }) => {
  const school = await login(request, "qa_student_1", "student");
  await installSession(context, school);
  // The home screen reads `/students/me/home`, whose `dashboard` part carries the next lesson.
  await page.route("**/api/v1/students/me/home", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const dashboard = body.data.dashboard;
    dashboard.currentCourse = dashboard.currentCourse ?? {
      id: paid.id,
      title: paid.title,
      description: null,
      thumbnail: null,
      difficultyLevel: "beginner",
      direction: { id: "d", title: "Гитара", slug: "guitar" },
    };
    dashboard.nextAvailableLesson = {
      id: paid.lessonIds[2],
      title: "Урок 3",
      status: "available",
      moduleSortOrder: 1,
      sortOrder: 3,
      paymentRequired: true,
      courseId: paid.id,
    };
    await route.fulfill({ response, json: body });
  });
  await page.goto("/dashboard");
  const action = page.getByTestId("dashboard-course-action");
  await expect(action).toHaveText("Оплатить курс");
  await expect(action).toHaveAttribute("href", `/courses/${paid.id}`);
});
