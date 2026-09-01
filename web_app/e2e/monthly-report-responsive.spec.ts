import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";

const PASSWORD = "QaMaestro2026!";

async function signInAsStudent(request: APIRequestContext, context: BrowserContext) {
  const response = await request.post("/api/v1/auth/login", {
    data: { phone: "qa_student_1", password: PASSWORD, profile: "student" },
  });
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, payload.data);
}

test("monthly report is an accessible mobile sheet without duplicate header actions", async ({ page, request, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsStudent(request, context);
  await page.goto("/school-lessons?tab=history");

  const trigger = page.getByRole("button", { name: "Отчёт за месяц" });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Отчёт об обучении" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Закрыть", exact: true })).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Excel (.xls)", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Скачать Excel (.xls)" })).toBeVisible();

  const overflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ));
  expect(overflow).toBeLessThanOrEqual(1);

  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Скачать Excel (.xls)" }).click();
  const download = await downloadPromise;
  const reportPath = await download.path();
  expect(reportPath).not.toBeNull();
  const reportXml = await readFile(reportPath as string, "utf8");
  expect(reportXml).toContain("Набрано учебных баллов:");
  expect(reportXml).not.toMatch(/Набрано баллов:.*XP/);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
