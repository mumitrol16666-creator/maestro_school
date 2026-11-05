import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Plan 1.10: the sector exam. Held live at the school; the admin prepares the list,
 * CRM books the lesson, the teacher marks every point and closes the sector or sends to a retake.
 */

const PASSWORD = "QaMaestro2026!";
const teacher = { id: "00000000-0000-4000-8000-000000000011", firstName: "Учитель", lastName: "QA", role: "teacher", permissions: ["offline_school.read", "offline_school.write"] };

function examFixture(done: Array<boolean | null>) {
  return {
    id: "11111111-1111-4111-8111-111111111111", sessionId:"session-1", planId: "22222222-2222-4222-8222-222222222222", crmStudentId: "QA-STUDENT-1",
    direction: { id: "d", title: "Гитара", crmDirectionId: "QA-DIRECTION-GUITAR" },
    status: "in_progress", attempt: 1, previousExamId: null, sentForScheduleAt: null, crmClassId: "QA-EXAM",
    scheduledAt: "2026-10-20T07:00:00.000Z", startedAt: "2026-10-20T07:05:00.000Z", finishedAt: null,
    outcome: null, decision: null, comment: null, certificate: null, cancelledAt: null, cancelReason: null,
    items: ["Стабильный бой восьмыми", "Чистые переходы аккордов", "Сыграть песню целиком"].map((title, index) => ({
      id: `33333333-3333-4333-8333-33333333333${index}`, kind: "custom", topicId: null,
      title, criteria: "", position: index, done: done[index] ?? null,
    })),
  };
}

async function mockTeacher(context: BrowserContext, page: Page) {
  await context.addInitScript((value) => {
    window.localStorage.setItem("maestro_access_token", "exam-fixture");
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(value));
  }, teacher);
  const marks: Array<boolean | null> = [null, null, null];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^.*\/api\/v1/, "");
    if (path === "/auth/me") return route.fulfill({ json: { data: teacher } });
    if(path==="/exam-sessions/session-1") return route.fulfill({json:{data:{id:"session-1",title:"Один экзамен",program:{items:examFixture(marks).items},participants:[{studentName:"Казыбаев Камбар",ready:true,canConduct:true,canStart:false,exam:examFixture(marks)}]}}});
    if (path.endsWith("/sector-exams") && path.includes("/students/")) {
      return route.fulfill({ json: { data: [{
        planId: "22222222-2222-4222-8222-222222222222", sequence: 1,
        direction: { id: "d", title: "Гитара", crmDirectionId: "QA-DIRECTION-GUITAR" },
        progress: { completed: 2, total: 2, percent: 100, ready: true },
        exam: examFixture(marks), previousExam: null, canStart: false,
      }] } });
    }
    const mark = path.match(/\/sector-exams\/[^/]+\/items\/[^/]+3(\d)$/);
    if (mark && request.method() === "PUT") {
      marks[Number(mark[1])] = (request.postDataJSON() as { done: boolean }).done;
      return route.fulfill({ json: { data: examFixture(marks) } });
    }
    if (path.endsWith("/workspace")) {
      return route.fulfill({ json: { data: {
        generatedAt: "2026-10-20T07:00:00.000Z", access: { kind: "assigned", direct: true },
        student: { crmStudentId: "QA-STUDENT-1", appUserId: null, name: "Казыбаев Камбар", phone: null, avatarUrl: null, learningLevel: null, directions: ["Гитара"], groups: [], appActivity: { lastActiveAt: null, lastLoginAt: null, linked: false }, parents: [] },
        sectors: [], proposals: [], homework: { available: true, waitingCount: 0, items: [] },
        recentLessons: { available: true, items: [] }, tests: [], courses: [], weekXp: null, dynamics: null,
      } } });
    }
    return route.fulfill({ json: { data: [] } });
  });
}

test("the common exam workspace has one pass/retake rule and requires all saved tasks", async ({ page, context }) => {
  await mockTeacher(context, page);
  await page.goto("/admin/exam-sessions/session-1");
  const panel = page.getByTestId("exam-session-participant");
  await expect(panel).toContainText("Казыбаев Камбар");
  const close = panel.getByRole("button", { name: "Сдал экзамен" });
  const retake = panel.getByRole("button", { name: "Пересдача" });
  await expect(close).toBeDisabled();
  await expect(retake).toBeDisabled();

  const items = panel.getByTestId("sector-exam-item");
  await expect(items).toHaveCount(3);
  await items.nth(0).getByRole("button", { name: "Сделано", exact: true }).click();
  await items.nth(1).getByRole("button", { name: "Сделано", exact: true }).click();
  await expect(panel).toContainText("Отмечено 2 из 3");
  await expect(close).toBeDisabled();
  await items.nth(2).getByRole("button", { name: "Не сделано" }).click();
  await expect(items.nth(2).getByRole("button", { name: "Не сделано" })).toHaveAttribute("aria-pressed", "true");
  await expect(close).toBeDisabled();
  await expect(retake).toBeEnabled();
  await items.nth(2).getByRole("button", { name: "Сделано", exact: true }).click();
  await expect(close).toBeEnabled();
});

test("a pupil card only links to the exam and cannot assess it by sector topics",async({page,context})=>{
  await mockTeacher(context,page);
  await page.goto("/admin/my-students/student/QA-STUDENT-1");
  const panel=page.getByTestId("sector-exam-panel");
  await expect(panel.getByRole("link",{name:"Открыть экзамен и результат ученика"})).toHaveAttribute("href","/exams/11111111-1111-4111-8111-111111111111");
  await expect(panel.getByRole("button")).toHaveCount(0);
  await expect(panel.getByTestId("sector-exam-item")).toHaveCount(0);
});
