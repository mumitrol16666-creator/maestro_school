import { expect, test, type BrowserContext } from "@playwright/test";

async function installStudentSession(context: BrowserContext) {
  const user = {
    id: "00000000-0000-4000-8000-000000000101",
    firstName: "Ученик",
    lastName: "Maestro",
    role: "student",
    permissions: [],
    points: 100,
    coins: 0,
  };
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, { token: "student-history-v2-test-token", user });
  await context.route("**/api/v1/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: user }),
  }));
}

function lesson(
  crmClassId: string,
  title: string,
  learningTopicResults: Array<Record<string, unknown>>,
  learningPlanCompletionResults: Array<Record<string, unknown>> = [],
) {
  return {
    crmClassId,
    title,
    date: "2026-09-05",
    startTime: "10:00",
    endTime: "10:45",
    status: "completed",
    classType: "individual",
    deliveryFormat: "offline",
    meetingUrl: null,
    crmGroupId: null,
    crmTeacherId: "teacher-1",
    groupName: null,
    teacherName: "Преподаватель Maestro",
    roomName: "Кабинет 1",
    topic: null,
    lessonGoals: null,
    lessonSummary: null,
    homework: null,
    nextLessonFocus: null,
    materials: [],
    attended: true,
    learningTopicResults,
    learningPlanCompletionResults,
  };
}

test("история показывает V2-прогресс темы и только фактически начисленные баллы", async ({
  page,
  context,
}) => {
  await installStudentSession(context);
  await page.route("**/api/v1/students/me/offline-summary", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      data: {
        crmStudentId: "QA-STUDENT-1",
        appUserId: "00000000-0000-4000-8000-000000000101",
        linkStatus: "linked",
        profile: { name: "Ученик Maestro", phone: "+7 777 000 00 00", groups: [] },
        balanceSnapshot: {
          classesRemainingTotal: 0,
          debtAmountKzt: 0,
          accountBalanceKzt: 0,
          totalPaidAmountKzt: 0,
          currentMembership: null,
          memberships: [],
        },
        upcomingLessons: [],
        monthlyPlan: null,
        lessonHistory: [
          lesson(
            "LESSON-MASTERED",
            "Урок с освоенной темой",
            [{
              topicId: "topic-mastered",
              title: "Чистые переходы аккордов",
              fromPercent: 75,
              toPercent: 100,
              comment: "Переходы сыграны без остановок.",
              occurredAt: "2026-09-05T08:00:00.000Z",
              mastered: true,
              masteryPointsAwarded: 100,
            }],
            [{
              planId: "plan-september",
              month: "2026-09",
              completedAt: "2026-09-05T08:00:00.000Z",
              pointsAwarded: 250,
            }],
          ),
          lesson("LESSON-IN-PROGRESS", "Урок с темой в работе", [{
            topicId: "topic-in-progress",
            title: "Стабильный бой восьмыми",
            fromPercent: 45,
            toPercent: 75,
            comment: null,
            occurredAt: "2026-09-05T09:00:00.000Z",
            mastered: false,
            masteryPointsAwarded: 0,
          }]),
        ],
      },
    }),
  }));
  await page.route("**/api/v1/students/me/homework-assignments", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: { model: "learning_homework_v2", assignments: [] } }),
  }));

  await page.goto("/school-lessons?tab=history");
  await page.getByRole("heading", { name: "Урок с освоенной темой" }).click();
  await page.getByRole("heading", { name: "Урок с темой в работе" }).click();

  const mastered = page.getByTestId("learning-topic-result").filter({
    hasText: "Чистые переходы аккордов",
  });
  await expect(mastered).toContainText("75% → 100%");
  await expect(mastered).toContainText("Освоено");
  await expect(mastered).toContainText("+100 учебных баллов");
  await expect(mastered).toContainText("Переходы сыграны без остановок.");

  const completedPlan = page.getByTestId("learning-plan-completion-result");
  await expect(completedPlan).toContainText("Учебный план · Сентябрь 2026");
  await expect(completedPlan).toContainText("План месяца завершён");
  await expect(completedPlan).toContainText("+250 учебных баллов");

  const inProgress = page.getByTestId("learning-topic-result").filter({
    hasText: "Стабильный бой восьмыми",
  });
  await expect(inProgress).toContainText("45% → 75%");
  await expect(inProgress).toContainText("В работе");
  await expect(inProgress).not.toContainText("учебных баллов");
  await expect(page.getByRole("heading", { name: "Урок с темой в работе" })
    .locator("xpath=ancestor::article").getByTestId("learning-plan-completion-result"))
    .toHaveCount(0);

  for (const width of [320, 375, 430]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(overflow.page, `lesson history horizontal overflow at ${width}px`)
      .toBeLessThanOrEqual(overflow.viewport);
  }
});
