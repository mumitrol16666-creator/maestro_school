import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

/**
 * Stage 4, step 6: «Курсы {имя ребёнка}» on the family page — the state of every course, «Оплатить
 * курс» with the same paywall spoken to the parent («вы»), the link from a notification
 * (`/family?student=…&notice=course`), and that the child sees who paid.
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

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

const createdCourseIds: string[] = [];

async function makeCourse(request: APIRequestContext, admin: Session, label: string, priceKzt: number | null) {
  const directions = await api<Array<{ id: string }>>(request, admin, "get", "/directions");
  const title = `E2E семья ${label} ${run}`;
  const course = await api<{ id: string }>(request, admin, "post", "/admin/courses", { directionId: directions[0].id, title, priceKzt });
  createdCourseIds.push(course.id);
  const module = await api<{ id: string }>(request, admin, "post", "/admin/modules", { courseId: course.id, title: "Модуль 1", sortOrder: 1 });
  for (const index of [1, 2, 3]) {
    await api(request, admin, "post", "/admin/lessons", { moduleId: module.id, title: `Урок ${index}`, sortOrder: index, isPublished: true });
  }
  await api(request, admin, "post", `/admin/courses/${course.id}/publish`, { isPublished: true });
  return { id: course.id, title };
}

test.describe.configure({ mode: "serial" });

let admin: Session;
let parent: Session;
let child: { id: string; firstName: string };
let paid: { id: string; title: string };
let free: { id: string; title: string };

test.beforeAll(async ({ request }, testInfo) => {
  admin = await login(request, "qa_admin", "staff");
  parent = await login(request, "qa_parent_1", "parent");
  const children = await api<Array<{ id: string; firstName: string }>>(request, parent, "get", "/parents/me/children");
  expect(children.length, "qa_parent_1 needs a child").toBeGreaterThan(0);
  child = children[0];
  paid = await makeCourse(request, admin, `платный-${testInfo.project.name}`, 12000);
  free = await makeCourse(request, admin, `бесплатный-${testInfo.project.name}`, null);
  await api(request, admin, "put", "/admin/course-payments/settings", {
    kaspiPayUrl: "https://pay.kaspi.kz/pay/e2e-family",
    transferPhone: "+7 777 123-45-67",
    recipientName: "ИП Маэстро",
    hint: null,
  });
});

test.afterAll(async ({ request }) => {
  for (const id of createdCourseIds) {
    await request.delete(`/api/v1/admin/courses/${id}`, { headers: auth(admin) });
  }
});

test("the notification link opens the child's courses with their states", async ({ page, context }) => {
  await installSession(context, parent);
  await page.goto(`/family?student=${child.id}&notice=course`);
  const card = page.getByTestId("family-courses");
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { name: `Курсы ${child.firstName}` })).toBeVisible();
  await expect(page.getByTestId("family-notice")).toContainText("Курсы ребёнка");

  const paidRow = card.locator(`[data-course-id="${paid.id}"]`);
  await expect(paidRow.getByTestId("family-course-state")).toHaveText("12 000 ₸ за 6 месяцев");
  await expect(paidRow).toContainText("Первые 2 урока бесплатно");
  const freeRow = card.locator(`[data-course-id="${free.id}"]`);
  await expect(freeRow.getByTestId("family-course-state")).toHaveText("Бесплатно");
  await expect(freeRow.getByTestId("family-course-pay")).toHaveCount(0);
  await noOverflow(page);
});

test("the parent pays for the child: the paywall speaks to «вы», the request goes by the parent's route", async ({ page, context, request }) => {
  await installSession(context, parent);
  await page.goto(`/family?student=${child.id}`);
  const row = page.getByTestId("family-courses").locator(`[data-course-id="${paid.id}"]`);
  const pay = row.getByTestId("family-course-pay");
  expect((await pay.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await pay.click();

  const paywall = row.getByTestId("course-paywall");
  await expect(paywall).toContainText(`Оплатите курс для ${child.firstName}`);
  await expect(paywall).not.toContainText("Оплати курс,");
  await expect(paywall.getByTestId("paywall-price")).toHaveText("12 000 ₸ за 6 месяцев");
  await expect(paywall.getByTestId("paywall-kaspi")).toHaveAttribute("href", "https://pay.kaspi.kz/pay/e2e-family");
  await expect(paywall.getByLabel("Комментарий (необязательно)")).toHaveAttribute("placeholder", /вы перевели/);
  await noOverflow(page);

  const sent = page.waitForRequest((req) => req.method() === "POST" && req.url().endsWith(`/parents/me/children/${child.id}/courses/${paid.id}/payment-requests`));
  await paywall.getByTestId("paywall-paid").click();
  expect((await sent).postDataJSON()).toMatchObject({ expectedPriceKzt: 12000 });
  await expect(paywall.getByTestId("paywall-sent")).toContainText("Откроем доступ после проверки оплаты");

  // The list moves on: waiting, and no second «Оплатить курс».
  await expect(row.getByTestId("family-course-state")).toHaveText("Ждём подтверждения оплаты");
  await expect(row.getByTestId("family-course-pay")).toHaveCount(0);

  // The child sees the same request and that a parent sent it.
  const childSession = await login(request, "qa_student_1", "student");
  const requests = await api<Array<{ courseId: string; paidBy: string; status: string }>>(request, childSession, "get", "/students/me/course-payment-requests");
  expect(requests.find((item) => item.courseId === paid.id)).toMatchObject({ paidBy: "parent", status: "pending" });
});

test("a waiting request is met with the waiting card, and a confirmed one shows the end of the access", async ({ page, context, request }) => {
  await installSession(context, parent);
  await page.goto(`/family?student=${child.id}`);
  const row = page.getByTestId("family-courses").locator(`[data-course-id="${paid.id}"]`);
  await expect(row.getByTestId("family-course-state")).toHaveText("Ждём подтверждения оплаты");

  const childSession = await login(request, "qa_student_1", "student");
  const [pending] = (await api<Array<{ id: string; courseId: string; status: string }>>(request, childSession, "get", "/students/me/course-payment-requests"))
    .filter((item) => item.courseId === paid.id && item.status === "pending");
  await api(request, admin, "post", `/admin/course-payments/requests/${pending.id}/confirm`, {});

  await page.reload();
  await expect(row.getByTestId("family-course-state")).toContainText(/^Доступ до \d{2}\.\d{2}\.\d{4}$/);
  await expect(row.getByTestId("family-course-pay")).toHaveCount(0);
});

test("the family page of a parent fits 320 px with the courses card open", async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await installSession(context, parent);
  await page.goto(`/family?student=${child.id}&notice=course`);
  await expect(page.getByTestId("family-courses")).toBeVisible();
  await noOverflow(page);
});

/** The parent's registration form: a parent and a child in one request, the child without the school. */
async function registerParentWithExternalChild(request: APIRequestContext, label: string): Promise<{ session: Session; childName: string }> {
  const stamp = `${Date.now()}`.slice(-8);
  const phone = (tail: string) => `+7 70${stamp.slice(0, 7)}${tail}`;
  const childName = `Лена${label}`.slice(0, 40);
  // The two registration forms share a limit of five a minute; a refusal waits for the window.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await request.post("/api/v1/auth/register/parent", {
      data: {
        parent: { firstName: "Ольга", lastName: "Внешняя", phone: phone("11"), password: PASSWORD },
        child: { firstName: childName, lastName: "Внешняя", phone: phone("22"), password: PASSWORD },
      },
    });
    if (response.status() === 429) {
      const seconds = Number(/retry in (\d+)/.exec(await response.text())?.[1] ?? 10);
      await new Promise((resolve) => setTimeout(resolve, (seconds + 1) * 1000));
      continue;
    }
    expect(response.status(), await response.text()).toBe(201);
    return { session: (await response.json()).data as Session, childName };
  }
  throw new Error("the registration stayed rate limited");
}

test("a child without the school has no school overview: one sentence and the courses, no error", async ({ page, context, request }, testInfo) => {
  test.setTimeout(150_000);
  const { session, childName } = await registerParentWithExternalChild(request, testInfo.project.name.replace(/\W/g, "").slice(0, 8));
  const children = await api<Array<{ id: string; audience: string }>>(request, session, "get", "/parents/me/children");
  expect(children.map((item) => item.audience)).toEqual(["external"]);

  await installSession(context, session);
  await page.goto("/family");
  await expect(page.getByTestId("family-external-note")).toHaveText(`${childName} занимается онлайн-курсами Maestro`);
  await expect(page.getByTestId("family-courses").getByRole("heading", { name: `Курсы ${childName}` })).toBeVisible();
  // None of the school's blocks, and no apology for data the school cannot have.
  for (const id of ["family-crm-notice", "family-balance", "family-week-digest", "family-explainer"]) {
    await expect(page.getByTestId(id), id).toHaveCount(0);
  }
  await expect(page.getByText("Сейчас не удалось получить данные школы")).toHaveCount(0);
  await expect(page.getByText("Загружаем данные")).toHaveCount(0);
  await noOverflow(page);
});
