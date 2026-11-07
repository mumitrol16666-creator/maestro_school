import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

/**
 * Stage 4: «Добавить ребёнка» in the family cabinet. A parent who already has an account makes one
 * more child account: the form opens from the header, checks the fields in words (the child's phone
 * cannot be the parent's), the new child is added to the list and opened, and signs in with their
 * own phone. The parent registers through `/auth/register/parent`, so each test starts from a fresh
 * family; both registration forms share the limit of five a minute, so a busy minute is waited out.
 */

const PASSWORD = "QaMaestro2026!";

let counter = 0;
function newPhone() {
  counter += 1;
  const tail = `${Date.now()}`.slice(-7) + String(counter).padStart(2, "0");
  return `+7 7${tail.slice(0, 9)}`;
}

type Session = { token: string; user: { id: string } & Record<string, unknown> };

async function registerFamily(request: APIRequestContext, parentPhone: string): Promise<Session> {
  const body = {
    parent: { firstName: "Гаухар", lastName: "Семья", phone: parentPhone, password: PASSWORD },
    child: { firstName: "Алихан", lastName: "Семья", phone: newPhone(), password: PASSWORD },
  };
  let response = await request.post("/api/v1/auth/register/parent", { data: body });
  if (response.status() === 429) {
    await new Promise((resolve) => setTimeout(resolve, 62_000));
    response = await request.post("/api/v1/auth/register/parent", { data: body });
  }
  test.skip(response.status() === 404, "the server of this stand has no /auth/register/parent yet");
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).data as Session;
}

async function installSession(context: BrowserContext, session: Session) {
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, session);
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function fillChild(page: Page, child: { first: string; last: string; phone: string; password: string }) {
  await page.locator("input[name=childFirstName]").fill(child.first);
  await page.locator("input[name=childLastName]").fill(child.last);
  await page.locator("input[name=childPhone]").fill(child.phone);
  await page.locator("input[name=childPassword]").fill(child.password);
  await expect(page.locator("input[name=childPhone]")).toHaveValue(child.phone);
}

test("a parent adds a second child: the phone check in words, the child in the list and opened, the child signs in", async ({ page, context, request }) => {
  test.setTimeout(150_000);
  const parentPhone = newPhone();
  const session = await registerFamily(request, parentPhone);
  await installSession(context, session);
  await page.goto("/family");
  await expect(page.getByTestId("family-courses")).toContainText("Курсы Алихан");

  await page.getByTestId("add-child-open").click();
  const form = page.getByTestId("add-child-form");
  await expect(form).toBeVisible();

  // Nothing filled: every field is named; the parent's own phone is refused on the spot.
  await page.getByTestId("add-child-submit").click();
  await expect(page.getByTestId("error-childFirstName")).toHaveText("Укажите имя ребёнка");
  // The form moves the focus to the first wrong field one frame later; typing before that would land there.
  await expect(page.locator("input[name=childFirstName]")).toBeFocused();
  const childPhone = newPhone();
  await fillChild(page, { first: "Айя", last: "Семья", phone: parentPhone, password: PASSWORD });
  await page.getByTestId("add-child-submit").click();
  await expect(page.getByTestId("error-childPhone")).toContainText("отличаться от вашего");

  await page.locator("input[name=childPhone]").fill(childPhone);
  await page.getByTestId("add-child-submit").click();
  await expect(page.getByTestId("add-child-done")).toContainText("Семья Айя");
  await expect(form).toHaveCount(0);
  // Two children now: the selector is there and the new child is open.
  const selector = page.getByLabel("Ученик");
  await expect(selector.locator("option")).toHaveText(["Семья Алихан", "Семья Айя"]);
  await expect(page.getByTestId("family-courses")).toContainText("Курсы Айя");

  // The page read again keeps both.
  await page.reload();
  await expect(selector.locator("option")).toHaveCount(2);

  const childLogin = await request.post("/api/v1/auth/login", { data: { phone: childPhone, password: PASSWORD, profile: "student" } });
  expect(childLogin.ok(), await childLogin.text()).toBe(true);
  expect((await childLogin.json()).data.user.audience).toBe("external");
});

test("a taken phone is said in words, the form stays filled; it fits a 320 px phone with 44 px controls", async ({ page, context, request }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 320, height: 640 });
  const session = await registerFamily(request, newPhone());
  await installSession(context, session);
  await page.goto("/family");
  await page.getByTestId("add-child-open").click();
  await noOverflow(page);
  for (const control of [page.getByTestId("add-child-submit"), page.getByRole("button", { name: "Отмена" })]) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }

  // A phone that another family's parent has already.
  const takenPhone = newPhone();
  await registerFamily(request, takenPhone);
  await fillChild(page, { first: "Занят", last: "Номер", phone: takenPhone, password: PASSWORD });
  await page.getByTestId("add-child-submit").click();
  await expect(page.getByTestId("add-child-error")).toContainText("уже есть аккаунт");
  await expect(page.locator("input[name=childFirstName]")).toHaveValue("Занят");
  await expect(page.getByRole("link", { name: "Войдите" })).toHaveCount(0);

  await page.getByRole("button", { name: "Отмена" }).click();
  await expect(page.getByTestId("add-child-open")).toBeVisible();
  await noOverflow(page);
});
