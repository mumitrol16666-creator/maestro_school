import { expect, test, type Page } from "@playwright/test";
import type {
  SchoolOfflineLesson,
  StudentOfflineSummary,
} from "../src/types/school-offline";
import type { StudentLearningHomeworkResponse } from "../src/types/learning-homework";

function lesson(
  id: string,
  date: string,
  extra: Partial<SchoolOfflineLesson> = {},
): SchoolOfflineLesson {
  return {
    crmClassId: id,
    date,
    title: "Индивидуально · Тестовый ученик",
    startTime: "15:30",
    endTime: "16:15",
    status: "scheduled",
    classType: "individual",
    teacherName: "Сидоров Владислав Максимович",
    groupName: null,
    roomName: "Кабинет 1",
    topic: null,
    lessonGoals: null,
    lessonSummary: null,
    homework: null,
    nextLessonFocus: null,
    materials: [],
    attended: null,
    ...extra,
  };
}

function summary(): StudentOfflineSummary {
  const membership = {
    crmMembershipId: "membership",
    type: "individual_1",
    planName: "Индивидуально · 1 месяц",
    directionName: "Гитара",
    groupName: "",
    teacherName: "Сидоров Владислав",
    lessonFormat: "individual",
    classesRemaining: 8,
    totalClasses: 8,
    startDate: "2026-09-01",
    endDate: "2026-10-01",
    totalPriceKzt: 32000,
    paidAmountKzt: 32000,
    remainingAmountKzt: 0,
    paymentStatus: "paid",
  };
  return {
    crmStudentId: "student",
    appUserId: "student",
    profile: { name: "Тестовый ученик", phone: "", groups: [] },
    balanceSnapshot: {
      classesRemainingTotal: 8,
      debtAmountKzt: 0,
      accountBalanceKzt: 32000,
      totalPaidAmountKzt: 32000,
      currentMembership: membership,
      memberships: [membership],
    },
    upcomingLessons: [
      lesson("next", "2026-09-17"),
      lesson("online", "2026-09-17", {
        startTime: "18:00",
        endTime: "18:45",
        deliveryFormat: "online",
        meetingUrl: "https://example.com/lesson",
        topic: "Ритм и переходы",
      }),
      lesson("following", "2026-09-18"),
      lesson("october", "2026-10-01"),
    ],
    lessonHistory: [
      lesson("past", "2026-09-10", {
        status: "completed",
        homework: "Повторить переходы Am–E",
        topic: "Аккорды",
        learningTopicResults: [
          {
            topicId: "topic",
            title: "Аккорды Am–E",
            fromPercent: 25,
            toPercent: 60,
            comment: null,
            occurredAt: "2026-09-10T12:00:00Z",
            mastered: false,
            masteryPointsAwarded: 0,
          },
        ],
      }),
    ],
    monthlyPlan: null,
  };
}

const homework: StudentLearningHomeworkResponse = {
  enabled: true,
  model: "learning_homework_v2",
  assignments: [
    {
      id: "assignment",
      model: "learning_homework_v2",
      recipientId: "recipient",
      state: "assigned",
      currentCycle: 1,
      acceptedAt: null,
      topic: {
        id: "topic",
        title: "Аккорды Am–E",
        masteryCriteria: "Без остановок",
        direction: { id: "guitar", title: "Гитара", crmDirectionId: null },
        scope: "student",
      },
      instructions:
        "Сыграть переходы Am–E под метроном 80 BPM. Повторить куплет и припев.",
      materials: [],
      sourceLessonId: "past",
      dueAt: "2026-09-17T10:30:00Z",
      assignedAt: "2026-09-10T12:00:00Z",
      teacherName: "Сидоров Владислав",
      latestAttempt: null,
      attempts: [],
    },
  ],
};

async function expectCurrentStudentNavigation(
  page: Page,
  active = "Расписание",
) {
  const mobile = (page.viewportSize()?.width ?? 1440) < 1024;
  const navigation = page.getByTestId(
    mobile ? "student-mobile-navigation" : "student-primary-navigation",
  );
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link")).toHaveText([
    /Главная/,
    /Обучение/,
    /Расписание/,
    /Сообщения/,
    /Магазин/,
  ]);
  await expect(navigation.getByRole("link", { name: active })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    navigation.getByRole("link", {
      name: /Профиль|План месяца|Курсы|Тесты|Недельная лига/,
    }),
  ).toHaveCount(0);
}

async function setup(
  page: Page,
  data = summary(),
  assignments: StudentLearningHomeworkResponse = homework,
  failHomework = false,
) {
  const user = {
    id: "student",
    firstName: "Айару",
    lastName: "Максот",
    role: "student",
    permissions: [],
    points: 100,
    coins: 0,
    // Match the enabled production features, verified on 2026-09-12.
    productFeatures: {
      learningTopicsV2: true,
      studentWorkspaceV2: true,
      homeworkFlowV2: true,
      unifiedLessonV2: true,
      lessonSyncV2: true,
      rewardEconomyV2: true,
      curatorWorkspaceV2: true,
      learningDialogsV2: true,
      roleNavigationV2: true,
    },
  };
  await page.clock.setFixedTime(new Date("2026-09-12T16:00:00Z"));
  await page.addInitScript((user) => {
    localStorage.setItem("maestro_access_token", "local-overview-fixture");
    localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, user);
  await page.route("**/api/v1/**", (route) =>
    route.fulfill({
      json: {
        data: {
          data: {
            items: [],
            counts: { actionRequired: 0, waitingReview: 0, completed: 0 },
          },
          counts: { actionRequired: 0, waitingReview: 0, completed: 0 },
          items: [],
          notifications: [],
          unreadCount: 0,
        },
      },
    }),
  );
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ json: { data: user } }),
  );
  await page.route("**/api/v1/students/me/offline-summary", (route) =>
    route.fulfill({ json: { data } }),
  );
  await page.route("**/api/v1/students/me/homework-assignments", (route) =>
    route.fulfill(
      failHomework
        ? {
            status: 503,
            json: { error: { code: "UNAVAILABLE", message: "Недоступно" } },
          }
        : { json: { data: assignments } },
    ),
  );
  await page.goto("/school-lessons");
  await expect(
    page.getByRole("region", { name: "Календарь уроков" }),
  ).toBeVisible();
  await expectCurrentStudentNavigation(page);
}

test("первой карточкой сегодня остаётся предстоящий урок, а не уже завершённый", async ({
  page,
}) => {
  const data = summary();
  data.lessonHistory.push(
    lesson("earlier-today", "2026-09-12", { status: "completed" }),
  );
  data.upcomingLessons.unshift(
    lesson("later-today", "2026-09-12", {
      startTime: "21:30",
      endTime: "22:15",
      topic: "Вечерний урок",
    }),
  );
  await setup(page, data);
  const calendar = page.getByRole("region", { name: "Календарь уроков" });
  await expect(calendar.getByRole("article")).toHaveCount(1);
  await expect(calendar.getByRole("article")).toContainText("Вечерний урок");
  await calendar
    .getByRole("button", { name: "Ещё занятий в этот день: 1" })
    .click();
  await expect(calendar.getByRole("article")).toHaveCount(2);
});

test("календарь выбирает ближайший день, показывает все его уроки и переключает месяцы", async ({
  page,
}) => {
  await setup(page);
  const calendar = page.getByRole("region", { name: "Календарь уроков" });
  const selectedDay = calendar.getByRole("button", {
    name: "17 сентября 2026 г., занятий: 2",
  });
  await expect(selectedDay).toHaveAttribute("aria-pressed", "true");
  await expect(calendar.getByRole("article")).toHaveCount(1);
  await calendar
    .getByRole("button", { name: "Ещё занятий в этот день: 1" })
    .click();
  await expect(calendar.getByRole("article")).toHaveCount(2);
  await expect(
    calendar.getByRole("link", { name: "Подключиться" }),
  ).toHaveAttribute("href", "https://example.com/lesson");
  await expect(calendar).not.toContainText("Тестовый ученик");
  await calendar
    .getByRole("button", { name: "16 сентября 2026 г., занятий: 0" })
    .click();
  await expect(calendar).toContainText("На этот день занятий нет.");
  await calendar.getByRole("button", { name: "Ближайший урок" }).click();
  await expect(selectedDay).toHaveAttribute("aria-pressed", "true");
  await calendar.getByRole("button", { name: "Показать месяц" }).click();
  await calendar.getByRole("button", { name: "Следующий месяц" }).click();
  await expect(
    calendar.getByRole("button", { name: "1 октября 2026 г., занятий: 1" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(calendar.getByRole("article")).toHaveCount(1);
  await calendar.getByRole("button", { name: "Сегодня", exact: true }).click();
  await expect(
    calendar.getByRole("button", { name: "12 сентября 2026 г., занятий: 0" }),
  ).toHaveAttribute("aria-current", "date");
  await calendar.getByRole("button", { name: "Предыдущий месяц" }).click();
  await expect(
    calendar.getByRole("button", {
      name: "1 августа 2026 г., занятий: 0",
      exact: true,
    }),
  ).toBeVisible();
});

test("расписание компактно и не дублирует задания, прогресс и оплату", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await setup(page);
  const tabs = page.getByRole("navigation", { name: "Разделы уроков" });
  await expect(tabs.getByRole("button")).toHaveCount(2);
  await expect(tabs.getByRole("button", { name: "Календарь" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Актуальное домашнее задание" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Баланс и абонемент" }),
  ).toHaveCount(0);
  await expect(
    page.getByText(homework.assignments[0].instructions),
  ).toHaveCount(0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await expectCurrentStudentNavigation(page);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: testInfo.outputPath(`schedule-${width}.png`),
        fullPage: true,
      });
  }
  const formats = page.getByRole("group", { name: "Формат уроков" });
  await formats.getByRole("button", { name: "Онлайн", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Календарь уроков" }).getByRole("article"),
  ).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Подключиться" })).toBeVisible();
  await formats.getByRole("button", { name: "В школе", exact: true }).click();
  await expect(page.getByRole("link", { name: "Подключиться" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("старые ссылки открывают единственную страницу задания в обучении; ответ отправляется", async ({
  page,
}, testInfo) => {
  await setup(page);
  await page.goto("/school-lessons?tab=homework&lesson=assignment");
  await expect(page).toHaveURL(/\/tasks\/school\/assignment$/);
  await expectCurrentStudentNavigation(page, "Обучение");
  await expect(
    page.getByRole("heading", { name: "Аккорды Am–E" }),
  ).toBeVisible();
  await expect(
    page.getByText(homework.assignments[0].instructions),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Разделы уроков" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("task-detail.png"),
    fullPage: true,
  });
  let payload: unknown;
  const waiting = {
    ...homework.assignments[0],
    state: "waiting_review" as const,
  };
  await page.route(
    "**/api/v1/homeworks/assignment/submissions",
    async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({ json: { data: waiting } });
    },
  );
  await page.getByRole("button", { name: "Я подготовил", exact: true }).click();
  await page.route("**/api/v1/students/me/homework-assignments", (route) =>
    route.fulfill({ json: { data: { ...homework, assignments: [waiting] } } }),
  );
  await page
    .getByRole("button", { name: "Отправить преподавателю", exact: true })
    .click();
  await expect(
    page.getByText("Ожидает проверки", { exact: true }),
  ).toBeVisible();
  expect(payload).toMatchObject({ submissionMode: "ready_for_lesson" });
  await page.goto("/school-lessons?tab=homework");
  await expect(page).toHaveURL(/\/tasks\?source=offline$/);
  await expect(page.getByTestId("task-results")).toBeVisible();
  await expectCurrentStudentNavigation(page, "Обучение");
});

test("история и старое ДЗ доступны, а повторного экрана абонементов нет", async ({
  page,
}, testInfo) => {
  await setup(page);
  await page
    .getByRole("navigation", { name: "Разделы уроков" })
    .getByRole("button", { name: "Прошедшие" })
    .click();
  await expect(page).toHaveURL(/tab=history/);
  await expect(
    page.getByRole("heading", { name: "История занятий" }),
  ).toBeVisible();
  await expect(page.getByText("Абонементы", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Открыть подробности: Аккорды", exact: true })
    .click();
  await expect(
    page.getByText("Повторить переходы Am–E", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("history.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Открыть задание" }).click();
  await expect(page).toHaveURL(/\/tasks\/school\/past$/);
  await expectCurrentStudentNavigation(page, "Обучение");
  // A lesson with a V2 assignment resolves to that assignment, not an extra legacy copy.
  await expect(
    page.getByText(homework.assignments[0].instructions),
  ).toBeVisible();
  await page.route("**/api/v1/students/me/homework-assignments", (route) =>
    route.fulfill({
      json: { data: { enabled: false, model: "legacy", assignments: [] } },
    }),
  );
  await page.reload();
  await expect(
    page.getByText("Повторить переходы Am–E", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Я подготовил", exact: true }),
  ).toHaveCount(0);
});

test("ошибка задания не маскируется пустым списком и не ломает календарь", async ({
  page,
}) => {
  const data = summary();
  data.upcomingLessons = [];
  data.lessonHistory = [];
  await setup(page, data, homework, true);
  await expect(
    page.getByRole("region", { name: "Календарь уроков" }),
  ).toContainText("На этот день занятий нет.");
  await page.goto("/tasks/school/assignment");
  await expect(page.getByText("Недоступно", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Задание не найдено", { exact: false }),
  ).toHaveCount(0);
});

test("абонементы доступны в профиле и сохраняют суммы и остатки", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const data = summary();
  data.balanceSnapshot.debtAmountKzt = 2000;
  Object.assign(data.balanceSnapshot.memberships[0], {
    remainingAmountKzt: 2000,
    individualClassesRemaining: 3,
    groupClassesRemaining: 4,
    theoryClassesRemaining: 1,
    emergencyFreezesAvailable: 2,
    emergencyFreezesUsed: 0,
  });
  await setup(page, data);
  await page.route("**/api/v1/directions", route => route.fulfill({ json: { data: [] } }));
  await page.route("**/api/v1/students/me/progress", route => route.fulfill({ json: { data: { enrollments: [] } } }));
  await page.route("**/api/v1/students/me/achievements", route => route.fulfill({ json: { data: [], meta: { earnedCount: 0, totalCount: 0 } } }));
  await page.route("**/api/v1/students/me/economy-profile", route => route.fulfill({ json: { data: { economyV2Enabled: false, level: null } } }));
  await page.goto("/settings");
  const billing = page.getByRole("region", { name: "Абонемент и оплата" });
  await expect(billing).toBeVisible();
  await expect(billing).toContainText("32 000 ₸");
  await expect(billing).toContainText("К оплате: 2 000 ₸");
  await expect(billing).toContainText("8");
  await expect(billing).toContainText("Индивидуальные:");
  await expect(billing).toContainText("Групповые:");
  await expect(billing).toContainText("Теория:");
  await billing.screenshot({ path: testInfo.outputPath("billing.png") });
  expect(errors).toEqual([]);
});

test("ссылка на старый отчёт выбирает его месяц, а календарь сохраняется при возврате", async ({ page }) => {
  const data = summary();
  data.lessonHistory.push(lesson("august", "2026-08-21", {
    status: "completed", topic: "Августовский урок", lessonSummary: "Разобрали ритм",
  }));
  await setup(page, data);
  await page.goto("/school-lessons?tab=history&lesson=august");
  await expect(page.getByRole("combobox", { name: "Месяц истории" })).toHaveValue("2026-08");
  await expect(page.getByText("Разобрали ритм", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Месяц истории" }).selectOption("2026-09");
  await expect(page.getByText("Разобрали ритм", { exact: true })).toHaveCount(0);
  await page.getByText("Отчёт за месяц", { exact: true }).click();
  await expect(page.getByLabel("Месяц отчёта")).toHaveValue("2026-09");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать Excel", exact: true }).click();
  expect((await download).suggestedFilename()).toContain("2026-09");
  await page.getByRole("button", { name: "Открыть отчёт", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("школьная дата не зависит от часового пояса устройства; отменённый урок не выбирается ближайшим", async ({
  browser,
}) => {
  const context = await browser.newContext({
    timezoneId: "America/Los_Angeles",
  });
  const page = await context.newPage();
  const data = summary();
  data.upcomingLessons.unshift(
    lesson("cancelled", "2026-09-13", { status: "cancelled" }),
  );
  await setup(page, data, { enabled: false, model: "legacy", assignments: [] });
  await page.clock.setFixedTime(new Date("2026-09-12T20:30:00Z")); // September 13 in Aqtobe.
  await page.reload();
  const calendar = page.getByRole("region", { name: "Календарь уроков" });
  await expect(
    calendar.getByRole("button", { name: "17 сентября 2026 г., занятий: 2" }),
  ).toHaveAttribute("aria-pressed", "true");
  await calendar.getByRole("button", { name: "Сегодня", exact: true }).click();
  await expect(
    calendar.getByRole("button", { name: "13 сентября 2026 г., занятий: 1" }),
  ).toHaveAttribute("aria-current", "date");
  await expect(calendar).toContainText("Отменён");
  await expect(
    page.getByRole("region", { name: "Актуальное домашнее задание" }),
  ).toHaveCount(0);
  await context.close();
});
