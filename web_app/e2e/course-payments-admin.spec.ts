import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

/**
 * Stage 4, step 5: the administrator's screens for paid courses — the queue of «Я оплатил»,
 * the list with filters and the table, payment details, the price in the course editor and the
 * access block in the student's card. The data is made through the API (an administrator
 * creates priced courses, a student asks to pay), the decisions are made on the screen.
 */

const PASSWORD = "QaMaestro2026!";
const run = Date.now().toString(36);

type Session = { token: string; user: { id: string } & Record<string, unknown> };

// The sign-in is rate limited: one session per person for the whole file.
const sessions = new Map<string, Session>();

async function login(request: APIRequestContext, phone: string, profile: "staff" | "student"): Promise<Session> {
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
  method: "get" | "post" | "patch" | "delete",
  path: string,
  data?: unknown,
  expected: number[] = [200, 201],
): Promise<T> {
  const response = await request[method](`/api/v1${path}`, { headers: auth(session), data });
  expect(expected, `${method} ${path}: ${await response.text()}`).toContain(response.status());
  return (await response.json()).data as T;
}

const createdCourseIds: string[] = [];

/** A published course with three lessons and a price; the first two lessons are the free ones. */
async function makePricedCourse(request: APIRequestContext, admin: Session, label: string, priceKzt: number | null = 12000) {
  const existing = await api<Array<{ directionId: string }>>(request, admin, "get", "/admin/courses?limit=1&page=1");
  const directionId = existing[0]?.directionId;
  expect(directionId, "the stand needs a course to take its direction").toBeTruthy();
  const title = `E2E оплата ${label} ${run}`;
  const course = await api<{ id: string }>(request, admin, "post", "/admin/courses", { directionId, title, priceKzt });
  createdCourseIds.push(course.id);
  const module = await api<{ id: string }>(request, admin, "post", "/admin/modules", { courseId: course.id, title: "Модуль 1", sortOrder: 1 });
  for (const index of [1, 2, 3]) {
    await api(request, admin, "post", "/admin/lessons", { moduleId: module.id, title: `Урок ${index}`, sortOrder: index, isPublished: true });
  }
  await api(request, admin, "post", `/admin/courses/${course.id}/publish`, { isPublished: true });
  return { id: course.id, title };
}

async function askToPay(request: APIRequestContext, student: Session, courseId: string, payerNote = "Перевёл через Kaspi") {
  return (await api<{ id: string }>(request, student, "post", `/courses/${courseId}/payment-requests`, { payerNote })).id;
}

const accessKind = async (request: APIRequestContext, student: Session, courseId: string) =>
  (await api<{ access: { kind: string } }>(request, student, "get", `/courses/${courseId}/access`)).access.kind;

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.afterAll(async ({ request }) => {
  if (!createdCourseIds.length) return;
  const admin = await login(request, "qa_admin", "staff");
  for (const id of createdCourseIds) {
    await request.delete(`/api/v1/admin/courses/${id}`, { headers: auth(admin) });
  }
});

test("the menu badge counts waiting payments and a request opens from its link, then is confirmed", async ({ page, request, context }) => {
  const admin = await login(request, "qa_admin", "staff");
  const student = await login(request, "qa_student_1", "student");
  const course = await makePricedCourse(request, admin, "подтверждение");
  const requestId = await askToPay(request, student, course.id, "Перевела 12:40");
  expect(await accessKind(request, student, course.id)).toBe("none");

  await installSession(context, admin);
  await page.goto(`/admin/course-payments?request=${requestId}`);
  await expect(page.getByRole("heading", { name: "Оплаты курсов" })).toBeVisible();

  // The badge on the menu is the number of requests waiting, the same as the server counts.
  const waiting = (await api<{ count: number }>(request, admin, "get", "/admin/course-payments/requests/pending-count")).count;
  expect(waiting).toBeGreaterThanOrEqual(1);
  const menuButton = page.getByRole("button", { name: "Открыть меню" });
  if (await menuButton.isVisible()) await menuButton.click();
  await expect(page.getByRole("link", { name: /^Оплаты курсов/ })).toContainText(waiting > 99 ? "99+" : String(waiting));
  if (await menuButton.isVisible()) await page.getByRole("button", { name: "Закрыть меню" }).first().click();

  const focused = page.getByTestId("focused-request");
  await expect(focused).toContainText(course.title);
  await expect(focused).toContainText("12 000 ₸");
  await expect(focused).toContainText("Перевела 12:40");
  await expect(focused).toContainText("Сам ученик");

  // The queue shows each request once: the opened one is not repeated below.
  await expect(page.getByTestId("payment-queue").locator(`[data-request-id="${requestId}"]`)).toHaveCount(0);

  await focused.getByRole("button", { name: "Подтвердить и открыть" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(`Открыть доступ к курсу «${course.title}» для`);
  await expect(dialog).toContainText("на 6 месяцев");
  await dialog.getByRole("button", { name: "Подтвердить и открыть" }).click();

  await expect(page.getByTestId("payments-notice")).toContainText("открыт");
  await expect(dialog).toHaveCount(0);
  expect(await accessKind(request, student, course.id)).toBe("paid");
});

test("«Оплата не найдена» needs a reason and the student sees it", async ({ page, request, context }) => {
  const admin = await login(request, "qa_admin", "staff");
  const student = await login(request, "qa_student_1", "student");
  const course = await makePricedCourse(request, admin, "отказ");
  const requestId = await askToPay(request, student, course.id);

  await installSession(context, admin);
  await page.goto(`/admin/course-payments?request=${requestId}`);
  const card = page.getByTestId("focused-request");
  await card.getByRole("button", { name: "Оплата не найдена" }).click();
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: "Отклонить заявку" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Причина (её увидит ученик)").fill("ок");
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Причина (её увидит ученик)").fill("Перевод на эту сумму не пришёл");
  await confirm.click();

  await expect(page.getByTestId("payments-notice")).toContainText("отклонена");
  const view = await api<{ lastRequest: { displayStatus: string; rejectionReason: string } }>(request, student, "get", `/courses/${course.id}/access`);
  expect(view.lastRequest.displayStatus).toBe("rejected");
  expect(view.lastRequest.rejectionReason).toBe("Перевод на эту сумму не пришёл");
  expect(await accessKind(request, student, course.id)).toBe("none");
});

test("a request decided by someone else is a calm message and a refreshed list, not an error", async ({ page, request, context }) => {
  const admin = await login(request, "qa_admin", "staff");
  const student = await login(request, "qa_student_1", "student");
  const course = await makePricedCourse(request, admin, "двое админов");
  const requestId = await askToPay(request, student, course.id);

  await installSession(context, admin);
  await page.goto(`/admin/course-payments?request=${requestId}`);
  const card = page.getByTestId("focused-request");
  await card.getByRole("button", { name: "Подтвердить и открыть" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // Another administrator rejects it while the dialog is open.
  await api(request, admin, "post", `/admin/course-payments/requests/${requestId}/reject`, { note: "Другой админ не нашёл перевод" });

  await page.getByRole("dialog").getByRole("button", { name: "Подтвердить и открыть" }).click();
  const notice = page.getByTestId("payments-notice");
  await expect(notice).toContainText("уже обработана");
  await expect(notice).toContainText("Список обновлён");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("focused-request").getByRole("button", { name: "Подтвердить и открыть" })).toHaveCount(0);
  await expect(page.getByTestId("focused-request")).toContainText("Оплата не найдена");
  expect(await accessKind(request, student, course.id)).toBe("none");
});

test("the list filters by course and status, refunds close the access at once, and the table downloads", async ({ page, request, context }) => {
  const admin = await login(request, "qa_admin", "staff");
  const student = await login(request, "qa_student_1", "student");
  const course = await makePricedCourse(request, admin, "возврат");
  const requestId = await askToPay(request, student, course.id, "Для таблицы");
  await api(request, admin, "post", `/admin/course-payments/requests/${requestId}/confirm`, {});
  expect(await accessKind(request, student, course.id)).toBe("paid");

  await installSession(context, admin);
  await page.goto("/admin/course-payments");
  await page.getByRole("tab", { name: /Все оплаты/ }).click();
  await page.getByTestId("filter-course").selectOption({ label: course.title });
  await page.getByTestId("filter-status").selectOption("confirmed");
  const history = page.getByTestId("payment-history");
  await expect(history.getByTestId("course-payment-card")).toHaveCount(1);
  await expect(history).toContainText("Подтверждена");
  await expect(page.getByTestId("period-sum")).toContainText("1 оплата на 12 000 ₸");

  // The table follows the filters; Excel needs the BOM, the course title is in a row.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать таблицу" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^course-payments-\d{4}-\d{2}-\d{2}\.csv$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect(bytes.subarray(0, 3).toString("hex")).toBe("efbbbf");
  expect(bytes.toString("utf8")).toContain(course.title);

  await history.getByRole("button", { name: "Возврат" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Доступ к курсу закроется сразу");
  await dialog.getByLabel("Заметка (необязательно)").fill("Вернули через Kaspi");
  await dialog.getByRole("button", { name: "Вернуть оплату" }).click();
  await expect(page.getByTestId("payments-notice")).toContainText("возвращена");
  expect(await accessKind(request, student, course.id)).toBe("none");

  await page.getByTestId("filter-status").selectOption("refunded");
  await expect(page.getByTestId("payment-history")).toContainText("Возвращена");
  await expect(page.getByTestId("payment-history")).toContainText("Вернули через Kaspi");
  await expect(page.getByTestId("payment-history").getByRole("button", { name: "Возврат" })).toHaveCount(0);
});

test("payment details are saved and refuse a link without https", async ({ page, request, context }) => {
  const admin = await login(request, "qa_admin", "staff");
  await installSession(context, admin);
  await page.goto("/admin/course-payments");
  await page.getByRole("tab", { name: "Реквизиты оплаты" }).click();
  const form = page.getByTestId("payment-settings-form");
  await form.getByLabel("Ссылка Kaspi Pay").fill("http://pay.example/abc");
  await expect(form).toContainText("Ссылка должна начинаться с https://");
  await expect(form.getByRole("button", { name: "Сохранить реквизиты" })).toBeDisabled();
  await form.getByLabel("Ссылка Kaspi Pay").fill("https://pay.kaspi.kz/pay/e2e");
  await form.getByLabel("Номер для перевода").fill("+7 701 000-00-00");
  await form.getByLabel("Получатель").fill("ИП Maestro");
  await form.getByRole("button", { name: "Сохранить реквизиты" }).click();
  await expect(form).toContainText("Реквизиты сохранены");
  const saved = await api<{ kaspiPayUrl: string; transferPhone: string }>(request, admin, "get", "/admin/course-payments/settings");
  expect(saved.kaspiPayUrl).toBe("https://pay.kaspi.kz/pay/e2e");
  expect(saved.transferPhone).toBe("+7 701 000-00-00");
});

test("the course editor sets the price, the free lessons and the school flag; empty price means free", async ({ page, request, context }) => {
  const admin = await login(request, "qa_admin", "staff");
  const course = await makePricedCourse(request, admin, "редактор", null);
  await installSession(context, admin);
  await page.goto(`/admin/courses/${course.id}`);

  const terms = page.getByTestId("course-terms");
  await expect(terms).toContainText("Курс бесплатный");
  await expect(terms).toContainText("Пустое поле — курс бесплатный целиком");
  const price = page.getByTestId("course-price-input");
  await expect(price).toHaveValue("");
  await expect(page.getByTestId("course-free-lessons-input")).toHaveValue("2");

  await price.fill("0");
  await expect(terms).toContainText("Цена должна быть больше нуля");
  await expect(terms.getByRole("button", { name: "Сохранить условия" })).toBeDisabled();

  await price.fill("15 000");
  await page.getByTestId("course-free-lessons-input").fill("1");
  await terms.getByLabel("Входит в обучение школы (ученикам бесплатно)").check();
  await terms.getByRole("button", { name: "Сохранить условия" }).click();
  await expect(terms).toContainText("Курс платный: 15 000 ₸ за 6 месяцев");
  const saved = await api<{ priceKzt: number; freeLessonsCount: number; includedInSchool: boolean }>(request, admin, "get", `/admin/courses/${course.id}`);
  expect([saved.priceKzt, saved.freeLessonsCount, saved.includedInSchool]).toEqual([15000, 1, true]);
  // The tree marks the one free lesson.
  await expect(page.getByText("бесплатно", { exact: true })).toHaveCount(1);

  await price.fill("");
  await terms.getByRole("button", { name: "Сохранить условия" }).click();
  await expect(terms).toContainText("Курс бесплатный");
  const freed = await api<{ priceKzt: number | null }>(request, admin, "get", `/admin/courses/${course.id}`);
  expect(freed.priceKzt).toBeNull();
});

test("the student's card gives a course access with a reason and takes it back", async ({ page, request, context }) => {
  const admin = await login(request, "qa_admin", "staff");
  const student = await login(request, "qa_student_1", "student");
  const course = await makePricedCourse(request, admin, "выдача");
  await installSession(context, admin);
  await page.goto(`/admin/students/${student.user.id}`);

  const card = page.getByTestId("student-course-access");
  await expect(card).toContainText("Доступ к курсам");
  await card.getByRole("button", { name: "Выдать доступ" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Курс").selectOption({ label: `${course.title} — 12 000 ₸` });
  const grant = dialog.getByRole("button", { name: "Выдать доступ" });
  await expect(grant).toBeDisabled();
  await dialog.getByLabel("Причина (обязательно)").fill("Оплатил наличными в школе");
  await grant.click();

  const entry = card.getByTestId("course-access-entry").filter({ hasText: course.title });
  await expect(entry).toContainText("Выдан вручную");
  await expect(entry).toContainText("Действует");
  await expect(entry).toContainText("Оплатил наличными в школе");
  expect(await accessKind(request, student, course.id)).toBe("granted");

  await entry.getByRole("button", { name: "Отозвать" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Отозвать доступ" }).click();
  await expect(entry).toContainText("Закрыт");
  await expect(entry.getByRole("button", { name: "Отозвать" })).toHaveCount(0);
  expect(await accessKind(request, student, course.id)).toBe("none");
});

test("the payments screen fits a 390px phone, buttons are 44px high", async ({ page, request, context }) => {
  const admin = await login(request, "qa_admin", "staff");
  const student = await login(request, "qa_student_1", "student");
  const course = await makePricedCourse(request, admin, "телефон");
  await askToPay(request, student, course.id, "Комментарий, который достаточно длинный, чтобы занять несколько строк на узком экране телефона");

  await page.setViewportSize({ width: 390, height: 844 });
  await installSession(context, admin);
  await page.goto("/admin/course-payments");
  const card = page.getByTestId("course-payment-card").filter({ hasText: course.title });
  await expect(card).toBeVisible();
  await noOverflow(page);
  for (const name of ["Подтвердить и открыть", "Оплата не найдена"]) {
    const box = await card.getByRole("button", { name }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
  }
  await card.getByRole("button", { name: "Оплата не найдена" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await noOverflow(page);
  await page.getByRole("dialog").getByRole("button", { name: "Отмена" }).click();

  await page.getByRole("tab", { name: /Все оплаты/ }).click();
  await expect(page.getByTestId("filter-course")).toBeVisible();
  await noOverflow(page);
  await page.getByRole("tab", { name: "Реквизиты оплаты" }).click();
  await expect(page.getByTestId("payment-settings-form")).toBeVisible();
  await noOverflow(page);
});

test("a teacher without the right does not see the section and the API refuses", async ({ page, request, context }) => {
  const teacher = await login(request, "qa_teacher_1", "staff");
  const denied = await request.get("/api/v1/admin/course-payments/requests/pending-count", { headers: auth(teacher) });
  expect(denied.status()).toBe(403);

  await installSession(context, teacher);
  await page.goto("/admin/course-payments");
  await expect(page.getByRole("heading", { name: "Раздел недоступен" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Оплаты курсов" })).toHaveCount(0);
});
