import { expect, test } from "@playwright/test";

/**
 * Plan 5.5: a closed topic and a closed sector in the lesson result carry «Поделиться», which
 * draws the card and, without a share sheet, saves it as a picture.
 */
const PASSWORD = "QaMaestro2026!";

test("a mastered topic and a closed sector offer a share card", async ({ page, request, context }) => {
  const login = await request.post("/api/v1/auth/login", { data: { phone: "qa_student_1", password: PASSWORD, profile: "student" } });
  expect(login.ok(), await login.text()).toBe(true);
  const session = (await login.json()).data as { token: string; user: unknown };
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, session);

  let lessonId = "";
  await page.route("**/api/v1/students/me/offline-summary**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const completed = (body.data.lessonHistory as Array<Record<string, unknown>>).find((lesson) => lesson.status === "completed");
    expect(completed).toBeTruthy();
    lessonId = completed!.crmClassId as string;
    Object.assign(completed!, {
      learningTopicResults: [
        { topicId: "t1", title: "Стабильный бой восьмыми", fromPercent: 70, toPercent: 100, comment: null, occurredAt: "2026-10-22T05:00:00.000Z", mastered: true, masteryPointsAwarded: 100 },
      ],
      learningPlanCompletionResults: [{ planId: "p1", month: "2026-10", sequence: 1, completedAt: "2026-10-22T05:00:00.000Z", pointsAwarded: 250 }],
    });
    await route.fulfill({ response, json: body });
  });
  await page.goto("/school-lessons?tab=history");
  await expect.poll(() => lessonId).not.toBe("");
  await page.goto(`/school-lessons?tab=history&lesson=${encodeURIComponent(lessonId)}`);

  await expect(page.getByTestId("share-topic")).toBeVisible();
  await expect(page.getByTestId("share-sector")).toBeVisible();
  // No share sheet in the test browser: the card is saved as a picture.
  await page.evaluate(() => { Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); });
  const download = page.waitForEvent("download");
  await page.getByTestId("share-topic").click();
  expect((await download).suggestedFilename()).toBe("maestro-achievement.png");
  await expect(page.getByTestId("share-topic")).toContainText("Готово");
});
