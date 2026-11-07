import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

/**
 * Document 20, package 2, В-23: the «Победа» window for a passed test, a mastered topic or a closed
 * sector, and a streak of 7 days; «позанимался» answers with one sentence instead of a toast.
 * The test and the lesson are injected into the responses, so the checks do not depend on which QA
 * test was already passed or which QA lesson was rewarded, and nothing is written to the school.
 */
const PASSWORD = "QaMaestro2026!";

async function signIn(request: APIRequestContext, context: BrowserContext) {
  const login = await request.post("/api/v1/auth/login", { data: { phone: "qa_student_1", password: PASSWORD, profile: "student" } });
  expect(login.ok(), await login.text()).toBe(true);
  const session = (await login.json()).data as { token: string; user: { id: string } };
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, session);
  return session;
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

/** `theory-1-1` as a test not yet passed; `alreadyPassed()` turns it into a passed one on the next read. */
async function fakePreparedTest(page: Page, alreadyPassed: () => boolean) {
  await page.route("**/api/v1/tests/theory-1-1**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("/attempts") && method === "POST") {
      await route.fulfill({
        json: {
          data: {
            id: "attempt-qa", testId: "theory-1-1", attemptNumber: 1, score: 92, correctAnswers: 5, totalQuestions: 5, passed: true,
            passingScore: 70, attemptsRemaining: 1, exhausted: false, xpAwarded: 20, xpStatus: "awarded", review: [], topicsToRepeat: [],
            nextTest: null, nextTestAvailableToday: false, createdAt: new Date().toISOString(),
          },
        },
      });
      return;
    }
    if (url.includes("/draft")) {
      await route.fulfill({ json: { data: { saved: true, updatedAt: new Date().toISOString() } } });
      return;
    }
    const response = await route.fetch();
    const body = await response.json();
    if (alreadyPassed()) {
      Object.assign(body.data, {
        passed: true, available: false, exhausted: false, draft: null, bestScore: 92, earnedXp: 20, attemptsUsed: 1,
        latestAttempt: { score: 92, correctAnswers: 5, totalQuestions: 5, passed: true, attemptNumber: 1, createdAt: new Date().toISOString(), review: [] },
      });
    } else {
      Object.assign(body.data, {
        passed: false, available: true, exhausted: false, dailyLocked: false, draft: null, bestScore: null, earnedXp: 0,
        attemptsUsed: 0, attemptsUsedToday: 0, attemptsRemaining: 2, latestAttempt: null, nextTest: null,
      });
    }
    await route.fulfill({ response, json: body });
  });
}

async function answerAllQuestions(page: Page) {
  // The material comes first; the button to the questions is at its end.
  const toTest = page.getByRole("button", { name: "Перейти к тесту" });
  await expect(toTest).toBeVisible();
  await toTest.click();
  const options = page.locator("fieldset label");
  await expect(options.first()).toBeVisible();
  for (let step = 0; step < 20; step += 1) {
    await options.first().click();
    const finish = page.getByRole("button", { name: "Завершить" });
    if (await finish.count()) {
      await expect(finish).toBeEnabled();
      await finish.click();
      return;
    }
    await page.getByRole("button", { name: "Дальше" }).click();
  }
}

test("a passed test opens the window right after the send and not when the passed test is opened again", async ({ page, request, context }) => {
  await signIn(request, context);
  let passed = false;
  await fakePreparedTest(page, () => passed);
  await page.goto("/tests/theory-1-1");
  await answerAllQuestions(page);

  const win = page.getByTestId("test-celebration");
  await expect(win).toBeVisible();
  await expect(win).toHaveAttribute("role", "dialog");
  await expect(win).toHaveAttribute("aria-modal", "true");
  await expect(win.getByTestId("celebration-number")).toContainText("92 %");
  await expect(win.getByRole("heading", { name: "Тест пройден!" })).toBeVisible();
  await expect(win).toContainText("бери гитару");
  // The test's XP is on the result card under the window, not repeated in it.
  await expect(win.getByTestId("celebration-detail")).toHaveCount(0);
  await expect(page.getByTestId("celebration-confetti")).toHaveCount(1);

  // The card takes the taps, the backdrop does not; «Дальше» has the focus and is at least 44 px.
  await expect(page.getByTestId("test-celebration-layer")).toHaveCSS("pointer-events", "none");
  const next = win.getByRole("button", { name: "Дальше" });
  await expect(next).toBeFocused();
  expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await next.click();
  await expect(win).toHaveCount(0);

  passed = true;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Тест пройден" })).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByTestId("test-celebration")).toHaveCount(0);
});

/** The first completed QA lesson gets these results; its id is read from the real answer. */
async function openRewardedLesson(page: Page, results: Record<string, unknown>) {
  let lessonId = "";
  await page.route("**/api/v1/students/me/offline-summary**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const completed = (body.data.lessonHistory as Array<Record<string, unknown>>).find((lesson) => lesson.status === "completed");
    expect(completed, "the QA student has a completed lesson").toBeTruthy();
    lessonId = completed!.crmClassId as string;
    Object.assign(completed!, results);
    await route.fulfill({ response, json: body });
  });
  await page.goto("/school-lessons?tab=history");
  await expect.poll(() => lessonId).not.toBe("");
  // The card is closed here: nothing is celebrated until it is opened.
  await page.waitForTimeout(400);
  await expect(page.getByTestId("lesson-celebration")).toHaveCount(0);
  await page.goto(`/school-lessons?tab=history&lesson=${encodeURIComponent(lessonId)}`);
  return lessonId;
}

const MASTERED_TOPIC = {
  learningTopicResults: [
    { topicId: "t1", title: "Стабильный бой восьмыми", fromPercent: 70, toPercent: 100, comment: null, occurredAt: "2026-10-22T05:00:00.000Z", mastered: true, masteryPointsAwarded: 100 },
  ],
  learningPlanCompletionResults: [],
};

test("the first opening of a lesson with a mastered topic shows the window, the second does not", async ({ page, request, context }) => {
  await signIn(request, context);
  const lessonId = await openRewardedLesson(page, MASTERED_TOPIC);

  const win = page.getByTestId("lesson-celebration");
  await expect(win).toBeVisible();
  await expect(win.getByTestId("celebration-number")).toContainText("+100 баллов");
  await expect(win.getByRole("heading", { name: "Тема освоена!" })).toBeVisible();
  await expect(win).toContainText("Стабильный бой восьмыми");
  await expect(win.getByRole("button", { name: "Дальше" })).toBeFocused();
  // It closes by itself after 6 s.
  await expect(win).toBeHidden({ timeout: 9_000 });

  const stored = await page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.startsWith("maestro_celebrated:lesson:")));
  expect(stored.some((key) => key.includes(lessonId))).toBe(true);

  await page.reload();
  await expect(page.getByTestId("learning-topic-result")).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByTestId("lesson-celebration")).toHaveCount(0);
});

test("a closed sector says «Сектор закрыт!» and Escape closes the window", async ({ page, request, context }) => {
  await signIn(request, context);
  await openRewardedLesson(page, {
    learningTopicResults: [],
    learningPlanCompletionResults: [{ planId: "p1", month: "2026-10", sequence: 1, completedAt: "2026-10-22T05:00:00.000Z", pointsAwarded: 250 }],
  });
  const win = page.getByTestId("lesson-celebration");
  await expect(win.getByRole("heading", { name: "Сектор закрыт!" })).toBeVisible();
  await expect(win.getByTestId("celebration-number")).toContainText("+250 баллов");
  await page.keyboard.press("Escape");
  await expect(win).toHaveCount(0);
});

test("with «reduce motion» the number is final at once and there is no confetti", async ({ page, request, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(request, context);
  await openRewardedLesson(page, MASTERED_TOPIC);
  const win = page.getByTestId("lesson-celebration");
  await expect(win).toBeVisible();
  // No waiting for a count-up: the first thing the window shows is the final number.
  expect((await win.getByTestId("celebration-number").innerText()).replace(/\s+/g, " ")).toContain("+100 баллов");
  await expect(page.getByTestId("celebration-confetti")).toHaveCount(0);
});

test("«позанимался» answers with one sentence instead of a toast and 7 days in a row open the window", async ({ page, request, context }) => {
  await signIn(request, context);
  await page.route("**/api/v1/students/me/home**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.practice = { ...body.data.practice, checkedInToday: false, streakDays: 6 };
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/v1/students/me/practice/checkin", async (route) => {
    await route.fulfill({
      json: {
        data: {
          today: "2026-11-02", checkedInToday: true, streakDays: 7, reply: "Гитара ждала тебя!",
          reminder: { enabled: true, time: "19:30", days: [0, 1, 2, 3, 4, 5, 6] },
        },
      },
    });
  });
  await page.goto("/dashboard");
  const checkin = page.getByTestId("practice-checkin");
  await expect(checkin).toContainText("Отмечай дни, когда брал инструмент");
  await checkin.getByRole("button", { name: "Позанимался сегодня" }).click();

  const reply = checkin.getByTestId("practice-reply");
  await expect(reply).toContainText("Гитара ждала тебя!");
  expect(await reply.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(20);
  await expect(page.getByTestId("app-toast")).toHaveCount(0);

  const win = page.getByTestId("streak-celebration");
  await expect(win).toBeVisible();
  await expect(win.getByTestId("celebration-number")).toContainText("7 дней подряд");
  // The home header follows the mark without a reload (В-31: the streak of days is its second figure).
  await expect(page.getByTestId("dashboard-streak")).toContainText("7");
  await win.getByRole("button", { name: "Дальше" }).click();
  await expect(win).toHaveCount(0);

  // After 2 s the quiet «done» state; the streak is not repeated in the card.
  await expect(checkin.getByTestId("practice-done")).toBeVisible({ timeout: 5_000 });
  await expect(checkin).not.toContainText("Дней подряд");
});
