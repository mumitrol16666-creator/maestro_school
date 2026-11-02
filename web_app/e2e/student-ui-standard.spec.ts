import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

/**
 * Documents 20 · pack 1 (В-7, В-9, В-10, В-13): the student's screens on a phone have no horizontal scroll,
 * no text under 12 px, no tap target under 44×44, and the header «назад» leads to the section's parent.
 */
const PASSWORD = "QaMaestro2026!";
const SCREENS = ["/dashboard", "/learning", "/progress", "/courses", "/tests", "/school-lessons", "/league", "/settings"] as const;

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

async function openScreen(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main#main-content")).toBeVisible();
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(400);
}

type Findings = { beyondRight: string[]; smallText: string[]; smallTargets: string[]; hScroll: boolean };

async function measure(page: Page): Promise<Findings> {
  return page.evaluate(() => {
    const label = (element: Element) => {
      const html = element as HTMLElement;
      const text = (element.getAttribute("aria-label") || html.innerText || element.getAttribute("href") || element.tagName).replace(/\s+/g, " ").trim();
      return `${element.tagName.toLowerCase()}«${text.slice(0, 40)}»`;
    };
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(element);
      return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) !== 0;
    };
    // an element inside a horizontally scrolling or clipping strip may legitimately stick out of the viewport
    const clipped = (element: Element) => {
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const overflowX = getComputedStyle(parent).overflowX;
        if (overflowX !== "visible") return true;
      }
      return false;
    };

    const all = [...document.querySelectorAll("body *")].filter(visible);
    const beyondRight = all
      .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1 && !clipped(element))
      .map(label);

    const smallText: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (!parent || !node.textContent?.trim() || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) continue;
      if (!visible(parent)) continue;
      const rect = parent.getBoundingClientRect();
      if (rect.width <= 1 && rect.height <= 1) continue;
      if (parseFloat(getComputedStyle(parent).fontSize) < 12) smallText.push(`${parent.tagName.toLowerCase()}«${node.textContent.trim().slice(0, 40)}»`);
    }

    const smallTargets = [...document.querySelectorAll("a, button, input, select")]
      .filter(visible)
      .filter((element) => !(element instanceof HTMLInputElement && element.type === "hidden"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width >= 43.5 && rect.height >= 43.5) return false;
        if (rect.width <= 1 && rect.height <= 1) return false; // visually hidden field
        if (element.tagName === "A") {
          const paragraph = element.closest("p");
          if (paragraph && (paragraph.innerText || "").trim().length > ((element as HTMLElement).innerText || "").trim().length) return false;
        }
        if (element instanceof HTMLInputElement && ["checkbox", "radio", "file"].includes(element.type)) {
          const wrapper = element.closest("label") || (element.id ? document.querySelector(`label[for="${element.id}"]`) : null);
          const box = wrapper?.getBoundingClientRect();
          if (box && box.width >= 43.5 && box.height >= 43.5) return false;
        }
        return true;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return `${label(element)} ${Math.round(rect.width * 10) / 10}×${Math.round(rect.height * 10) / 10}`;
      });

    const root = document.documentElement;
    return { beyondRight, smallText, smallTargets, hScroll: root.scrollWidth > root.clientWidth };
  });
}

for (const width of [390, 320]) {
  test(`student screens at ${width} px: no horizontal scroll, text ≥ 12 px, targets ≥ 44×44`, async ({ page, request, context }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width, height: 844 });
    await signInAsStudent(request, context);

    const problems: string[] = [];
    for (const path of SCREENS) {
      await openScreen(page, path);
      const found = await measure(page);
      if (found.hScroll) problems.push(`${path}: the page scrolls horizontally`);
      for (const item of found.beyondRight) problems.push(`${path}: right of the viewport — ${item}`);
      for (const item of found.smallText) problems.push(`${path}: text under 12 px — ${item}`);
      for (const item of found.smallTargets) problems.push(`${path}: target under 44×44 — ${item}`);
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
}

test("the header «назад» leads to the parent section and is absent on a section root", async ({ page, request, context }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsStudent(request, context);

  await openScreen(page, "/dashboard");
  await expect(page.getByTestId("back-button")).toHaveCount(0);

  await openScreen(page, "/monthly-plan");
  const sectorBack = page.locator("header").getByTestId("back-button");
  await expect(sectorBack).toBeVisible();
  await expect(sectorBack).toHaveAttribute("href", "/learning");
  const box = await sectorBack.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(43.5);

  await openScreen(page, "/courses");
  const courseLink = page.locator("main a[href^='/courses/']").first();
  await expect(courseLink).toBeVisible();
  const courseHref = await courseLink.getAttribute("href");
  expect(courseHref).toMatch(/^\/courses\/[^/]+$/);
  await openScreen(page, courseHref!);
  const courseBack = page.locator("header").getByTestId("back-button");
  await expect(courseBack).toBeVisible();
  await expect(courseBack).toHaveAttribute("href", "/courses");
});
