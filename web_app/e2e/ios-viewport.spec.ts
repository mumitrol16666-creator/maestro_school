import { expect, test } from "@playwright/test";

test("iPhone login fields keep Safari at the device viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await expect(page.locator('input[autocomplete="username"]:visible')).toBeVisible();

  const metrics = await page.locator("input:visible").evaluateAll((inputs) => ({
    fontSizes: inputs.map((input) => Number.parseFloat(getComputedStyle(input).fontSize)),
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));

  expect(metrics.fontSizes.length).toBeGreaterThan(0);
  expect(metrics.fontSizes.every((size) => size >= 16)).toBe(true);
  expect(metrics.pageWidth).toBeLessThanOrEqual(metrics.viewportWidth);

  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).toContain("width=device-width");
  expect(viewport).toContain("initial-scale=1");
});
