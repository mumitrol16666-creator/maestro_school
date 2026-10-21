import { expect, test } from "@playwright/test";

/**
 * A teacher pastes a whole link into «Найти в библиотеке»: the caption is guessed, one click saves
 * and picks it, and pasting it again finds the same entry. The link field under «Добавить ссылку»
 * takes typing too.
 */
const PASSWORD = "QaMaestro2026!";

test("a pasted link is saved and picked in one step; the manual link field takes typing", async ({ page, context }) => {
  const response = await page.request.post("/api/v1/auth/login", { data: { phone: "qa_teacher_1", password: PASSWORD, profile: "staff" } });
  expect(response.ok(), await response.text()).toBe(true);
  const payload = await response.json();
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, payload.data);
  const runId = Date.now().toString(); // numeric, like the page ids of chord sites
  await page.goto("/admin/my-students/student/QA-STUDENT-1");
  await page.getByRole("button", { name: "Выдать ДЗ" }).click();
  const picker = page.getByTestId("material-library-picker").filter({ hasText: "Материал к заданию" });
  const search = picker.getByRole("combobox");

  await search.fill(`https://mychords.net/ru/tatyana-kurtukova/${runId}-tatyana-kurtukova-odnogo.html#google_vignette`);
  const caption = picker.getByLabel("Подпись к ссылке");
  await expect(caption).toHaveValue("Tatyana kurtukova odnogo — mychords.net");
  await caption.fill(`Одного ${runId}`);
  await picker.getByRole("button", { name: "Сохранить в библиотеку и выбрать" }).click();
  await expect(page.getByTestId("homework-picked-materials")).toContainText(`Одного ${runId}`);

  // Pasting the same page again offers the saved entry instead of a second one.
  await search.fill(`https://mychords.net/ru/tatyana-kurtukova/${runId}-tatyana-kurtukova-odnogo.html`);
  await expect(picker.getByRole("option", { name: new RegExp(`Одного ${runId}`) })).toBeVisible();
  await expect(picker.getByLabel("Подпись к ссылке")).toHaveCount(0);

  // The manual way: caption in the search, link typed into its own field.
  await search.fill(`Разбор ${runId}`);
  await picker.getByRole("button", { name: "Добавить ссылку" }).click();
  const link = picker.getByLabel("Ссылка на материал");
  await link.click();
  await page.keyboard.type(`https://example.com/razbor-${runId}`);
  await expect(link).toHaveValue(`https://example.com/razbor-${runId}`);
  await picker.getByRole("button", { name: "Сохранить в библиотеку и выбрать" }).click();
  await expect(page.getByTestId("homework-picked-materials")).toContainText(`Разбор ${runId}`);
});
