import { expect, test } from "@playwright/test";

test("before the lesson separates the assignment from previous checks and opens the check step", async ({ page, context }, testInfo) => {
  const user = { id: "clarity-teacher", role: "teacher", firstName: "Преподаватель", permissions: ["offline_school.read", "offline_school.write"], productFeatures: { learningTopicsV2: true, homeworkFlowV2: true, unifiedLessonV2: true } };
  const studentId = "clarity-student";
  const direction = { id: "clarity-guitar", title: "Гитара", crmDirectionId: "crm-guitar" };
  const topic = { id: "clarity-topic", title: "Учебная песня", masteryCriteria: "Ровный ритм", progressPercent: 75, masteredAt: null, planCompletionRewardPoints: 0 };
  const lesson = { crmClassId: "clarity-lesson", title: "Индивидуальный урок", date: "2026-11-05", startTime: "10:15", endTime: "11:00", duration: 45, status: "started", classType: "individual", crmIndividualStudentId: studentId, teacher: { crmTeacherId: "crm-teacher", name: "Преподаватель" }, startedAt: "2026-11-05T05:15:00Z", group: null, room: null };
  const roster = { crmClassId: lesson.crmClassId, students: [{ crmStudentId: studentId, name: "Ученица Примерова", attended: true, attendanceStatus: "present", recentLessons: [{ crmClassId: "previous-lesson", date: "2026-10-27", title: "Индивидуальный урок", topic: topic.title, homework: "Сыграть куплет и припев под метроном", attendanceStatus: "present" }] }], learningV2: {
    enabled: true, available: true, canApply: true, owner: { kind: "student", id: studentId }, rewardsEnabled: false,
    plans: [{ planId: "clarity-plan", direction, topics: [topic], month: "2026-11", planCompletionRewardPoints: 0 }],
    students: [{ crmStudentId: studentId, name: "Ученица Примерова", appUserId: null,
      pendingHomework: [{ recipientId: "pending-1", assignmentId: "assignment-1", cycleNumber: 1, versionInCycle: 0, topicId: topic.id, topicTitle: topic.title, directionTitle: direction.title, instructions: "Сыграть куплет и припев под метроном", state: "assigned", assignedAt: "2026-10-31T05:00:00Z" }],
      recentHomework: [
        { recipientId: "reviewed-1", topicTitle: topic.title, directionTitle: direction.title, instructions: "Сыграть куплет", assignedAt: "2026-10-07T05:00:00Z", state: "accepted", decision: "accepted", completionPercent: 75, comment: null, reviewedAt: "2026-10-31T05:00:00Z" },
        { recipientId: "unreviewed-2", topicTitle: "Ещё не проверенное задание", assignedAt: "2026-11-05T05:00:00Z", state: "assigned", decision: null, completionPercent: null, reviewedAt: null },
        { recipientId: "revision-3", topicTitle: "Ритм", directionTitle: direction.title, assignedAt: "2026-10-07T05:00:00Z", state: "revision", decision: "revision", completionPercent: null, reviewedAt: "2026-10-30T05:00:00Z" },
        { recipientId: "incomplete-4", topicTitle: "Бой", directionTitle: direction.title, assignedAt: "2026-10-07T05:00:00Z", state: "not_completed", decision: "not_completed", completionPercent: null, reviewedAt: "2026-10-29T05:00:00Z" },
      ],
    }], rewardPreview: [],
  } };
  await context.addInitScript(value => {
    localStorage.setItem("maestro_access_token", "clarity-fixture");
    localStorage.setItem("maestro_auth_user", JSON.stringify(value));
  }, user);
  await page.route("**/api/v1/**", route => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api\/v1/, "");
    let data: unknown = [];
    if (path === "/auth/me") data = user;
    else if (path.endsWith("/clarity-lesson/students")) data = roster;
    else if (path.endsWith("/clarity-lesson")) data = lesson;
    else if (path.endsWith("/draft") || path.endsWith("/report-versions")) data = null;
    else if (path.endsWith("/students-overview")) data = { students: [] };
    else if (path.includes("/lesson-templates")) data = { own: [], school: [] };
    return route.fulfill({ json: { data } });
  });
  await page.goto(`/admin/offline-lessons/${lesson.crmClassId}`);
  const panel = page.getByTestId("lesson-context-step");
  await expect(panel).toContainText("Прошлый урок");
  await expect(panel).toContainText("Сыграть куплет и припев под метроном");
  const history = panel.getByTestId("lesson-recent-homework");
  await expect(history).toContainText("Последние проверки ДЗ");
  await expect(history).toContainText("Результат сохранён 31 окт.");
  await expect(history).toContainText("Выполнено: 75%");
  await expect(history.getByText("На доработку", { exact: true })).toBeVisible();
  await expect(history.getByText("Не выполнено", { exact: true })).toBeVisible();
  await expect(history).not.toContainText("ждёт урока");
  await expect(history).not.toContainText("Ещё не проверенное задание");
  await panel.screenshot({ path: testInfo.outputPath("homework-context.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await panel.getByRole("button", { name: "Проверить ДЗ на уроке: 1" }).click();
  await expect(page.getByLabel(/Процент выполнения ДЗ/)).toBeVisible();
  await expect(page.getByTestId("lesson-context-step")).toHaveCount(0);
});
