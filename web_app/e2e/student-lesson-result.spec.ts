import { expect, test } from "@playwright/test";

/**
 * Plan 2.7: a confirmed lesson tells the student what it gave (Points, XP, the teacher's bonus of
 * the day, the streak), how the sector moved, how the previous homework was checked, and when the
 * next lesson is. The figures are injected into the summary response, so the test does not depend
 * on which QA lesson was rewarded.
 */
const PASSWORD = "QaMaestro2026!";

test("the lesson result shows what was earned, the sector step, the homework check and the next lesson", async ({ page, request, context }, testInfo) => {
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
    const history = body.data.lessonHistory as Array<Record<string, unknown>>;
    const completed = history.find((lesson) => lesson.status === "completed");
    expect(completed, "the QA student has a completed lesson").toBeTruthy();
    lessonId = completed!.crmClassId as string;
    Object.assign(completed!, {
      lessonPointsAwarded: 0,
      learningTopicResults: [
        { topicId: "t1", title: "Стабильный бой восьмыми", fromPercent: 45, toPercent: 100, comment: null, occurredAt: "2026-10-22T05:00:00.000Z", mastered: true, masteryPointsAwarded: 100 },
      ],
      lessonRewards: { xp: 20, bonusXp: 3 },
      sectorProgress: { planId: "p1", sequence: 1, direction: "Гитара", fromPercent: 25, toPercent: 50, completed: 2, total: 4 },
      homeworkChecks: [{ topicTitle: "Переходы между аккордами", completionPercent: 70, comment: "Переходы чище, темп держи", reviewedAt: "2026-10-22T05:00:00.000Z" }],
    });
    body.data.streakWeeks = 3;
    body.data.upcomingLessons = [
      { crmClassId: "NEXT-1", title: "Индивидуальный урок", date: "2026-12-30T07:00:00.000Z", startTime: "12:00", endTime: "13:00", status: "scheduled", groupName: null, teacherName: "Сидоров Владислав", roomName: "QA кабинет", topic: null, lessonGoals: null, lessonSummary: null, homework: null, nextLessonFocus: null, materials: [], attended: null },
      ...(body.data.upcomingLessons as unknown[]),
    ];
    await route.fulfill({ response, json: body });
  });

  await page.goto("/school-lessons?tab=history");
  await expect.poll(() => lessonId).not.toBe("");
  await page.goto(`/school-lessons?tab=history&lesson=${encodeURIComponent(lessonId)}`);

  const earned = page.getByTestId("lesson-earned");
  await expect(earned).toContainText("+100 баллов");
  await expect(earned).toContainText("+20 XP");
  await expect(earned).toContainText("бонус от преподавателя +3 XP");
  await expect(earned).toContainText("серия 3 нед.");
  await expect(earned).not.toContainText("Coin");

  const sector = page.getByTestId("lesson-sector-progress");
  await expect(sector).toContainText("Сектор 1 · Гитара");
  await expect(sector).toContainText("25 % → 50 %");
  await expect(sector).toContainText("Освоено тем: 2 из 4");

  const checks = page.getByTestId("lesson-homework-checks");
  await expect(checks).toContainText("Переходы между аккордами");
  await expect(checks).toContainText("выполнено на 70 %");
  await expect(checks).toContainText("Переходы чище, темп держи");

  await expect(page.getByTestId("lesson-next")).toContainText(/Следующий урок: 30 декабря( 2026 г\.)? · 12:00/);

  await page.getByTestId("lesson-earned").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("lesson-result.png") });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
