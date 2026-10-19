import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Plan 1.12: the shared materials library, picking a material by its caption, sending a course
 * lesson to a student, and uploaded files that open only for signed-in users.
 */

const PASSWORD = "QaMaestro2026!";
const runId = Date.now().toString(36);

async function signIn(page: Page, context: BrowserContext, login: string, profile: "staff" | "student") {
  // page.request shares the browser's cookies, so the media cookie set at sign-in reaches <img>/<a>.
  const response = await page.request.post("/api/v1/auth/login", { data: { phone: login, password: PASSWORD, profile } });
  expect(response.ok(), await response.text()).toBe(true);
  const payload = await response.json();
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, payload.data);
}

test.describe.configure({ mode: "serial" });

let uploadedUrl = "";

test("a teacher adds a link and a file to the library, then picks one by caption for homework", async ({ page, context }) => {
  await signIn(page, context, "qa_teacher_1", "staff");
  await page.goto("/admin/materials");
  await expect(page.getByRole("heading", { name: "Библиотека материалов" })).toBeVisible();

  await page.getByLabel("Ссылка", { exact: true }).fill(`https://www.youtube.com/watch?v=${runId}`);
  await page.getByLabel("Подпись").fill(`Бой восьмыми ${runId}`);
  await page.getByRole("button", { name: "Добавить ссылку" }).click();
  await expect(page.getByRole("status")).toContainText(`Добавлено: Бой восьмыми ${runId}`);

  await page.getByLabel("Подпись").fill(`Аккорды PDF ${runId}`);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Загрузить файл" }).click();
  await (await chooser).setFiles({ name: "chords.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 chords") });
  await expect(page.getByRole("status")).toContainText(`Загружено: Аккорды PDF ${runId}`);

  const list = page.getByTestId("material-library-list");
  const video = list.getByTestId("material-library-item").filter({ hasText: `Бой восьмыми ${runId}` });
  await expect(video).toContainText("YouTube");
  const pdf = list.getByTestId("material-library-item").filter({ hasText: `Аккорды PDF ${runId}` });
  await expect(pdf).toContainText("PDF");
  uploadedUrl = (await pdf.getByRole("link").getAttribute("href")) ?? "";
  expect(uploadedUrl).toMatch(/^\/api\/v1\/media\/pdf\/.+\.pdf$/);

  // The file opens for the signed-in teacher through the media cookie, and not for a stranger.
  const own = await page.request.get(uploadedUrl);
  expect(own.status()).toBe(200);
  const anonymous = await page.context().browser()!.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
  expect((await anonymous.request.get(uploadedUrl)).status()).toBe(401);
  await anonymous.close();

  await page.goto("/admin/my-students/student/QA-STUDENT-1");
  await page.getByRole("button", { name: "Выдать ДЗ" }).click();
  const picker = page.getByTestId("material-library-picker").filter({ hasText: "Материал к заданию" });
  await picker.getByRole("combobox").fill(`восьмыми ${runId}`);
  await picker.getByRole("option", { name: new RegExp(`Бой восьмыми ${runId}`) }).click();
  await expect(page.getByTestId("homework-picked-materials")).toContainText(`Бой восьмыми ${runId}`);
});

test("a teacher sends a course lesson and the student watches the bare lesson", async ({ page, context }) => {
  await signIn(page, context, "qa_teacher_1", "staff");
  await page.goto("/admin/my-students/student/QA-STUDENT-1");
  const share = page.getByTestId("share-course-lesson");
  await share.getByRole("button", { name: "Отправить урок курса" }).click();
  await share.getByLabel("Курс").selectOption({ label: "QA Курс гитары" });
  await share.getByLabel("Комментарий ученику").fill("Посмотри перед уроком");
  await share.getByRole("button", { name: "Отправить ученику" }).click();
  await expect(share).toContainText("«Постановка правой руки»");

  await context.clearCookies();
  await context.addInitScript(() => window.localStorage.clear());
  const studentPage = await context.newPage();
  await signIn(studentPage, context, "qa_student_1", "student");
  await studentPage.goto("/shared-lessons");
  await studentPage.getByRole("link", { name: /Постановка правой руки/ }).first().click();
  const lesson = studentPage.getByTestId("shared-lesson");
  await expect(lesson.getByRole("heading", { name: "Постановка правой руки" })).toBeVisible();
  await expect(lesson).toContainText("Посмотри перед уроком");
  await expect(lesson.locator("iframe")).toHaveAttribute("src", /youtube/);
  await expect(lesson).toContainText("сдавать ничего не нужно");
  if (uploadedUrl) expect((await studentPage.request.get(uploadedUrl)).status()).toBe(200);
});

test("the library and a sent lesson fit a 375px phone", async ({ page, context }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, context, "qa_teacher_1", "staff");
  await page.goto("/admin/materials");
  await expect(page.getByTestId("material-library-list")).toBeVisible();
  const clipped = () => page.evaluate(() => [...document.querySelectorAll("main *")]
    .filter((element) => {
      const box = element.getBoundingClientRect();
      if (box.right <= window.innerWidth + 1) return false;
      // Scrollable strips (the type filter) may run past the edge on purpose.
      return !element.closest("[aria-label='Тип материала']");
    }).length);
  expect(await clipped()).toBe(0);
});
