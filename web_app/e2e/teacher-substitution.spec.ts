import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Plan item 1.9: a substitute sees the lesson's student in full until the lesson is approved,
 * with a «Замена» mark in «Сегодня» and on the student card; the dialog closes with the lesson.
 */

const user = { id: "00000000-0000-4000-8000-000000000012", firstName: "Джулия", lastName: "QA", role: "teacher", permissions: ["offline_school.read"] };

async function mockTeacher(context: BrowserContext, page: Page, responses: Record<string, unknown>, fallback: unknown) {
  await context.addInitScript((value) => {
    window.localStorage.setItem("maestro_access_token", "substitution-fixture");
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(value));
  }, user);
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api\/v1/, "");
    if (path === "/auth/me") return route.fulfill({ json: { data: user } });
    for (const [suffix, data] of Object.entries(responses)) {
      if (path.endsWith(suffix)) return route.fulfill({ json: { data } });
    }
    return route.fulfill({ json: fallback });
  });
}

const workspace = {
  generatedAt: "2026-10-19T05:30:00.000Z",
  access: { kind: "substitute", crmClassId: "QA-CLASS-SUB", lessonDate: "2026-10-19T03:00:00.000Z", originalTeacherName: "Сидоров Владислав" },
  student: {
    crmStudentId: "QA-STUDENT-1", appUserId: "10000000-0000-4000-8000-000000000021", name: "Казыбаев Камбар",
    phone: null, avatarUrl: null, learningLevel: null, directions: ["Гитара"], groups: [],
    appActivity: { lastActiveAt: null, lastLoginAt: null, linked: true }, parents: [],
  },
  sectors: [], proposals: [], homework: { available: true, waitingCount: 0, items: [] },
  recentLessons: { available: true, items: [] }, tests: [], courses: [],
  weekXp: { weekKey: "2026-10-19", total: 0, bySource: [], events: [] },
  dynamics: null,
};

test("the substitute's student card says whose lesson it is and until when", async ({ page, context }) => {
  await mockTeacher(context, page, { "/workspace": workspace }, { data: [] });
  await page.goto("/admin/my-students/student/QA-STUDENT-1");
  const banner = page.getByTestId("workspace-substitute");
  await expect(banner).toContainText("Замена");
  await expect(banner).toContainText("19 октября");
  await expect(banner).toContainText("Сидоров Владислав");
  await expect(banner).toContainText("до утверждения урока");
  const tabs = page.getByRole("navigation", { name: "Разделы карточки ученика" });
  await expect(tabs.getByRole("button", { name: /Активность/ })).toBeVisible();
  await expect(tabs.getByRole("button", { name: /Диалог/ })).toBeVisible();
});

test("«Сегодня» marks a covered lesson as a substitution", async ({ page, context }) => {
  await mockTeacher(context, page, {
    "/teachers/me/today": {
      generatedAt: "2026-10-19T05:30:00.000Z", date: "2026-10-19",
      crm: { agendaAvailable: true, agendaFromCache: false, rosterAvailable: true },
      attention: [],
      lessons: [{
        crmClassId: "QA-CLASS-SUB", title: "Урок на замене", startTime: "08:00", endTime: "09:00", status: "scheduled",
        phase: "upcoming", kind: "individual", groupName: null, studentName: "Казыбаев Камбар", roomName: "QA кабинет",
        deliveryFormat: "offline", studentsCount: 1, homeworkToCheck: 0, reportOpen: false, substitution: true,
      }],
      reports: [], proposals: { total: 0, items: [] }, messages: { unread: 0 }, birthdays: [],
    },
  }, { data: { items: [], tasks: [], notifications: [], count: 0, unreadCount: 0 }, meta: { total: 0 } });
  await page.goto("/admin");
  await expect(page.getByTestId("today-lessons").getByTestId("today-substitution")).toHaveText("Замена");
});
