import { expect, test, type Page } from "@playwright/test";

/**
 * Stage 4, step 6–7 (screen): the registration form with its two tabs — «Я ученик» and «Я родитель,
 * регистрирую ребёнка». The checks in words, the way on after success (a student to the courses, a
 * parent to the family cabinet), the sign-in link, 320 px without a sideways scroll.
 *
 * `POST /auth/register/parent` belongs to the server's part of the step; where the server of the
 * stand does not have it yet, the tests of the real parent flow are skipped and the form is checked
 * against an answer made by the test (`page.route`), with the same body the server will get.
 */

const PASSWORD = "QaMaestro2026!";

let counter = 0;
function newPhone() {
  counter += 1;
  // «+7 7» and nine digits: eleven digits as the school's numbers have them.
  const tail = `${Date.now()}`.slice(-7) + String(counter).padStart(2, "0");
  return `+7 7${tail.slice(0, 9)}`;
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function fillPerson(page: Page, prefix: "student" | "parent" | "child", person: { first: string; last: string; phone: string; password: string }) {
  await page.locator(`input[name=${prefix}FirstName]`).fill(person.first);
  await page.locator(`input[name=${prefix}LastName]`).fill(person.last);
  await page.locator(`input[name=${prefix}Phone]`).fill(person.phone);
  await page.locator(`input[name=${prefix}Password]`).fill(person.password);
}

test("the sign-in page leads to the registration and back", async ({ page }) => {
  await page.goto("/login");
  const link = page.getByTestId("login-register-link");
  await expect(link).toBeVisible();
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await link.click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole("heading", { name: "Создайте аккаунт Maestro" })).toBeVisible();
  await page.getByRole("link", { name: /Уже есть аккаунт — войти/ }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("the student tab asks for the fields in words and sends nothing while they are wrong", async ({ page }) => {
  let sent = 0;
  await page.route("**/api/v1/auth/register**", (route) => {
    sent += 1;
    return route.continue();
  });
  await page.goto("/register");
  const tabs = page.getByRole("tablist");
  await expect(tabs.getByRole("tab", { name: "Я ученик" })).toHaveAttribute("aria-selected", "true");

  await page.getByTestId("register-submit").click();
  await expect(page.getByTestId("error-studentFirstName")).toHaveText("Укажите имя");
  await expect(page.getByTestId("error-studentLastName")).toHaveText("Укажите фамилию");
  await expect(page.getByTestId("error-studentPhone")).toContainText("Укажите номер телефона");
  await expect(page.getByTestId("error-studentPassword")).toContainText("не короче 8 символов");
  // The first field with an error takes the cursor.
  await expect(page.locator("input[name=studentFirstName]")).toBeFocused();

  await fillPerson(page, "student", { first: "Алия", last: "Серикова", phone: newPhone(), password: PASSWORD });
  await page.locator("input[name=studentPasswordRepeat]").fill("Другой-пароль-1");
  await page.getByTestId("register-submit").click();
  await expect(page.getByTestId("error-studentPasswordRepeat")).toHaveText("Пароли не совпадают");
  expect(sent).toBe(0);
  await noOverflow(page);
});

test("a student registers, is signed in and lands in the courses with the outsider's menu", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/register");
  await fillPerson(page, "student", { first: "Алия", last: "Внешняя", phone: newPhone(), password: PASSWORD });
  await page.locator("input[name=studentPasswordRepeat]").fill(PASSWORD);
  await page.getByTestId("register-submit").click();
  // Five registrations a minute are allowed: after a busy minute the form says so in words, and a minute later it goes.
  const limited = page.getByTestId("register-error").filter({ hasText: "Слишком много попыток" });
  if (await limited.waitFor({ timeout: 3000 }).then(() => true, () => false)) {
    await page.waitForTimeout(62_000);
    await page.getByTestId("register-submit").click();
  }

  await expect(page).toHaveURL(/\/courses$/);
  const menu = page.locator("[data-testid=student-primary-navigation]:visible, [data-testid=student-mobile-navigation]:visible").first();
  await expect(menu.getByRole("link")).toHaveText([/Курсы/, /Тесты/, /Профиль/]);
  // The signed-in person is no longer shown the form.
  await page.goto("/register");
  await expect(page).toHaveURL(/\/courses$/);
});

test("the form takes over what the trial form had already collected", async ({ page }) => {
  await page.goto(`/register?firstName=${encodeURIComponent("Дана")}&lastName=${encodeURIComponent("Ким")}&phone=${encodeURIComponent("+7 702 111-22-33")}`);
  await expect(page.locator("input[name=studentFirstName]")).toHaveValue("Дана");
  await expect(page.locator("input[name=studentLastName]")).toHaveValue("Ким");
  await expect(page.locator("input[name=studentPhone]")).toHaveValue("+7 702 111-22-33");
});

test("the parent tab has two blocks, the hint about the child's sign-in and its own check of the phones", async ({ page }) => {
  let sent = 0;
  await page.route("**/api/v1/auth/register**", (route) => {
    sent += 1;
    return route.continue();
  });
  await page.goto("/register");
  await page.getByRole("tab", { name: "Я родитель, регистрирую ребёнка" }).click();
  await expect(page.getByRole("heading", { name: "Вы", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ребёнок", exact: true })).toBeVisible();
  await expect(page.getByText("Ребёнок будет входить по своему телефону и паролю")).toBeVisible();
  await expect(page.locator("input[name=studentFirstName]")).toHaveCount(0);

  const sameNumber = newPhone();
  await fillPerson(page, "parent", { first: "Марат", last: "Серик", phone: sameNumber, password: PASSWORD });
  await fillPerson(page, "child", { first: "Дамир", last: "Серик", phone: sameNumber.replace("+7 ", "8 "), password: "Ребёнок-2026" });
  await page.getByTestId("register-submit").click();
  await expect(page.getByTestId("error-childPhone")).toContainText("должен отличаться от вашего");
  await expect(page.locator("input[name=childPhone]")).toBeFocused();

  await page.locator("input[name=parentFirstName]").fill("");
  await page.locator("input[name=childPassword]").fill("1");
  await page.getByTestId("register-submit").click();
  await expect(page.getByTestId("error-parentFirstName")).toHaveText("Укажите имя");
  await expect(page.getByTestId("error-childPassword")).toContainText("Пароль ребёнка");
  expect(sent).toBe(0);
  await noOverflow(page);
});

test("the parent form sends both persons in one request and meets a taken phone with the way to sign in [answered by the test]", async ({ page }) => {
  let body: unknown = null;
  await page.route("**/api/v1/auth/register/parent", async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "PHONE_ALREADY_REGISTERED", message: "Этот телефон уже зарегистрирован" } }),
    });
  });
  await page.goto("/register");
  await page.getByRole("tab", { name: "Я родитель, регистрирую ребёнка" }).click();
  const parentPhone = newPhone();
  const childPhone = newPhone();
  await fillPerson(page, "parent", { first: " Марат ", last: "Серик", phone: parentPhone, password: PASSWORD });
  await fillPerson(page, "child", { first: "Дамир", last: "Серик", phone: childPhone, password: "Ребёнок-2026" });
  await page.getByTestId("register-submit").click();

  await expect(page.getByTestId("register-error")).toContainText("Этот телефон уже зарегистрирован");
  await expect(page.getByTestId("register-error").getByRole("link", { name: "Войдите" })).toHaveAttribute("href", "/login");
  expect(body).toEqual({
    parent: { firstName: "Марат", lastName: "Серик", phone: parentPhone, password: PASSWORD },
    child: { firstName: "Дамир", lastName: "Серик", phone: childPhone, password: "Ребёнок-2026" },
  });
});

test("a parent registers the child too, lands in the family cabinet and the child signs in with their own phone [needs POST /auth/register/parent]", async ({ page, request }) => {
  const probe = await request.post("/api/v1/auth/register/parent", { data: {} });
  test.skip(probe.status() === 404, "the server of this stand has no /auth/register/parent yet");

  const parentPhone = newPhone();
  const childPhone = newPhone();
  await page.goto("/register");
  await page.getByRole("tab", { name: "Я родитель, регистрирую ребёнка" }).click();
  await fillPerson(page, "parent", { first: "Марат", last: "Родитель", phone: parentPhone, password: PASSWORD });
  await fillPerson(page, "child", { first: "Дамир", last: "Ребёнок", phone: childPhone, password: "Ребёнок-2026" });
  await page.getByTestId("register-submit").click();

  await expect(page).toHaveURL(/\/family$/);
  // The child is an outsider: the card «Курсы Дамир» is there at once.
  await expect(page.getByTestId("family-courses")).toContainText("Курсы Дамир");

  const childLogin = await request.post("/api/v1/auth/login", { data: { phone: childPhone, password: "Ребёнок-2026", profile: "student" } });
  expect(childLogin.ok(), await childLogin.text()).toBe(true);
  expect((await childLogin.json()).data.user.audience).toBe("external");
});

test("both tabs fit a 320 px phone and every control is at least 44 px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/register");
  for (const tab of ["Я ученик", "Я родитель, регистрирую ребёнка"]) {
    await page.getByRole("tab", { name: tab }).click();
    await noOverflow(page);
    for (const control of [page.getByRole("tab", { name: tab }), page.getByTestId("register-submit")]) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    for (const toggle of await page.getByRole("button", { name: "Показать пароль" }).all()) {
      const box = (await toggle.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
  }
  await page.setViewportSize({ width: 430, height: 900 });
  await noOverflow(page);
});
