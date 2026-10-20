import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

/**
 * Plan 2.5: a course homework answer carries a file (private storage), and the student downloads
 * it back from the attempt history. Needs a QA course lesson with homework the student has started.
 */
const PASSWORD = "QaMaestro2026!";
const LESSON = process.env.QA_COURSE_LESSON_ID ?? "2166bfec-50cc-4e31-a897-547ff9151fc1";
const QA_DB = process.env.QA_PLATFORM_DB ?? "maestro_regression";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("a student sends a course homework answer with a file and downloads it back", async ({ page, request, context }) => {
  const login = await request.post("/api/v1/auth/login", { data: { phone: "qa_student_1", password: PASSWORD, profile: "student" } });
  expect(login.ok(), await login.text()).toBe(true);
  const session = (await login.json()).data as { token: string; user: unknown };
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, session);

  // A previous run's answer is removed so the lesson takes a new one (QA only).
  execFileSync("psql", ["-h", "localhost", "-U", "vladislav", "-d", QA_DB, "-At", "-c",
    `delete from homework_submissions where student_id = (select id from users where login = 'qa_student_1') and homework_id in (select id from homeworks where lesson_id = '${LESSON}'); `
    + `update lesson_progress set status = 'in_progress' where student_id = (select id from users where login = 'qa_student_1') and lesson_id = '${LESSON}';`]);
  await page.goto(`/lessons/${LESSON}`);
  const form = page.locator("form").filter({ hasText: "Тип работы" });
  await page.waitForLoadState("networkidle");
  test.skip(!(await form.isVisible().catch(() => false)), "В QA нет начатого урока курса с ДЗ");
  await form.getByRole("button", { name: "Файл", exact: true }).click();
  await form.getByTestId("homework-file-field").locator("input[type=file]").setInputFiles({ name: "ruka.png", mimeType: "image/png", buffer: png });
  await expect(form).toContainText("Будет отправлен: ruka.png");
  await form.getByPlaceholder("Опишите, как вы выполнили задание").fill("Фото постановки руки");
  await form.getByRole("button", { name: /Отправить на проверку/ }).click();
  await expect(page.getByText("Работа отправлена на проверку.", { exact: true })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать файл" }).first().click();
  expect((await download).suggestedFilename()).toBeTruthy();
});
