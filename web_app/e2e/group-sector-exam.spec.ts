import { execFileSync } from "node:child_process";
import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Plan 1.13: the group's sector. The admin prepares the exam for chosen members, CRM books them into
 * one exam lesson, the teacher holds it: one member passes, one goes to a retake, one is counted
 * without an exam; then the group moves on. Needs a fresh qa-seed (QA-GROUP-1 with an open sector).
 */
const PASSWORD = "QaMaestro2026!";
const CRM_URL = process.env.QA_CRM_URL ?? "http://127.0.0.1:5002";
const GROUP = "QA-GROUP-1";
const PASSER = "QA-STUDENT-3";
const RETAKER = "QA-STUDENT-2";
const QA_DB = process.env.QA_PLATFORM_DB ?? "maestro_regression";

async function login(request: APIRequestContext, phone: string, profile: "staff" | "student") {
  const response = await request.post("/api/v1/auth/login", { data: { phone, password: PASSWORD, profile } });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).data as { token: string; user: unknown };
}

async function api<T>(request: APIRequestContext, token: string, method: "GET" | "POST" | "PATCH", path: string, data?: unknown) {
  const response = await request.fetch(`/api/v1${path}`, { method, headers: { Authorization: `Bearer ${token}` }, data });
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBe(true);
  return (await response.json()).data as T;
}

test("a group sector: each member's exam in one CRM lesson, pass, retake, count without exam, the group moves on", async ({ page, request, context, browser }, testInfo) => {
  test.setTimeout(120_000);
  const admin = await login(request, "qa_admin", "staff");
  const teacher = await login(request, "qa_teacher_1", "staff");

  // 1. The admin prepares the group's exam for two members.
  type Board = { groupSectors: Array<{ planId: string; crmGroupId: string; direction: { crmDirectionId: string }; members: Array<{ crmStudentId: string; pass: unknown; exam: { id: string; status: string } | null }> }> };
  const board = await api<Board>(request, admin.token, "GET", "/admin/sector-exams");
  const sector = board.groupSectors.find((row) => row.crmGroupId === GROUP);
  test.skip(!sector, "У QA-GROUP-1 нет открытого сектора: перезапустите qa-seed");
  for (const member of sector!.members) {
    if (member.exam && ["draft", "awaiting_schedule", "scheduled"].includes(member.exam.status)) {
      await api(request, admin.token, "POST", `/admin/sector-exams/${member.exam.id}/cancel`, { reason: "QA повтор" });
    }
  }
  const template = await api<{ items: unknown[] }>(request, admin.token, "GET", `/admin/sector-exams/template/${sector!.planId}`);
  const created = await api<{ created: Array<{ id: string; crmStudentId: string; crmGroupId: string }> }>(
    request, admin.token, "POST", "/admin/sector-exams/group",
    { planId: sector!.planId, crmStudentIds: [PASSER, RETAKER], items: template.items, send: true },
  );
  expect(created.created.map((exam) => exam.crmGroupId)).toEqual([GROUP, GROUP]);

  // 2. CRM shows them as the group's exams and books both into one free exam lesson.
  const crmLogin = await request.post(`${CRM_URL}/api/auth/login`, { data: { phone: "+77000000001", password: PASSWORD } });
  const crmToken = (await crmLogin.json()).token as string;
  const pending = await (await request.get(`${CRM_URL}/api/sector-exams/pending`, { headers: { Authorization: `Bearer ${crmToken}` } })).json();
  const queued = pending.exams.filter((exam: { examId: string }) => created.created.some((item) => item.id === exam.examId));
  expect(queued).toHaveLength(2);
  expect(queued[0].title).toMatch(/^Экзамен сектора группы \d+ · Гитара · QA Ансамбль$/);
  expect(queued[0].suggestedTeacherId).toBe("QA-TEACHER-1");
  let booked: { class: { title: string }; platformConfirmed: boolean } | null = null;
  for (let offset = 2; offset <= 12 && !booked; offset += 1) {
    const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const [startTime, endTime] of [["07:00", "07:45"], ["07:45", "08:30"]]) {
      const response = await request.post(`${CRM_URL}/api/sector-exams/book`, {
        headers: { Authorization: `Bearer ${crmToken}` },
        data: { examIds: created.created.map((exam) => exam.id), date, startTime, endTime, teacherId: "QA-TEACHER-1", roomId: "QA-ROOM-1" },
      });
      if (response.status() === 201) { booked = await response.json(); break; }
      expect((await response.json()).code, "only a busy slot is acceptable").toBe("CLASS_SCHEDULE_CONFLICT");
    }
  }
  expect(booked?.class.title).toMatch(/^Экзамен сектора группы \d+ · Гитара · 2 ученика$/);
  expect(booked?.platformConfirmed).toBe(true);

  // 3. The group's topics reach 100 % — on group lessons in real life; here straight in the QA database.
  // qa-seed keeps the sector's id, so a previous run's 250 for it is removed first.
  execFileSync("psql", ["-h", "localhost", "-U", "vladislav", "-d", QA_DB, "-At", "-c",
    `delete from points_transactions where source_key like 'learning-plan-completion:${sector!.planId}:%'`]);
  execFileSync("psql", ["-h", "localhost", "-U", "vladislav", "-d", QA_DB, "-At", "-c",
    `update learning_topics set progress_percent = 100 where id in (select topic_id from learning_plan_topics lpt join learning_plan_versions v on v.id = lpt.plan_version_id join learning_plans p on p.id = v.plan_id and v.version = p.published_version_number where p.id = '${sector!.planId}')`]);

  // 4. The teacher holds the exam on the group's page.
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, teacher);
  await page.goto(`/admin/my-students/group/${GROUP}/plan`);
  const panel = page.getByTestId("group-sector-exam-card").first();
  await expect(panel).toContainText("Экзамен сектора группы");
  const row = (name: string) => panel.getByTestId("group-sector-member").filter({ hasText: name });

  const passer = row("Ахметов Максим");
  await passer.getByRole("button", { name: "Начать экзамен" }).click();
  await expect(passer.getByRole("button", { name: "Сделано", exact: true }).first()).toBeVisible();
  for (const button of await passer.getByRole("button", { name: "Сделано", exact: true }).all()) await button.click();
  await passer.getByRole("button", { name: "Сдал", exact: true }).click();
  await expect(passer).toContainText("Сдал экзамен");
  await expect(passer).toContainText("+250");

  const retaker = row("Серикова Алина");
  await retaker.getByRole("button", { name: "Начать экзамен" }).click();
  await expect(retaker.getByRole("button", { name: "Не сделано", exact: true }).first()).toBeVisible();
  for (const button of await retaker.getByRole("button", { name: "Не сделано", exact: true }).all()) await button.click();
  await retaker.getByRole("button", { name: "Пересдача" }).click();
  await expect(retaker).toContainText("Пересдача 1");

  const counted = row("Казыбаев Камбар");
  await counted.getByRole("button", { name: "Засчитать без экзамена" }).click();
  await counted.getByRole("button", { name: "Засчитать", exact: true }).click();
  await expect(counted).toContainText("Засчитан без экзамена");

  await panel.getByRole("button", { name: /Группа идёт дальше/ }).click();
  await expect(panel.getByRole("alertdialog")).toContainText("Сдали 2 из 3");
  await panel.getByRole("button", { name: "Закрыть сектор группы" }).click();
  await expect(page.getByText(/Открываем сектор группы \d+/)).toBeVisible();
  const closedCard = page.getByTestId("group-sector-exam-card").first();
  await expect(closedCard).toContainText("Группа перешла дальше");
  await expect(closedCard.getByTestId("group-sector-member").filter({ hasText: "Серикова Алина" })).toContainText("Ждёт назначения в CRM");

  // 5. Each member sees their own result.
  const student = await login(request, "qa_student_3", "student");
  const { plans } = await api<{ plans: Array<{ id: string; scope: string; memberPass: { method: string; points: number } | null }> }>(
    request, student.token, "GET", "/students/me/monthly-plans?history=1",
  );
  const own = plans.find((plan) => plan.id === sector!.planId);
  expect(own?.scope).toBe("group");
  expect(own?.memberPass).toMatchObject({ method: "exam", points: 250 });

  const studentContext = await browser.newContext({ ...testInfo.project.use, baseURL: testInfo.project.use.baseURL });
  await studentContext.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, student);
  const studentPage = await studentContext.newPage();
  await studentPage.goto("/monthly-plan");
  // The group has moved on: its sector is among the closed ones.
  await studentPage.getByRole("button", { name: /Закрытые секторы/ }).click();
  await expect(studentPage.getByText(/Сектор группы \d+ · Гитара/).first()).toBeVisible();
  await expect(studentPage.getByTestId("group-sector-pass").first()).toContainText("Сектор группы сдан на экзамене · +250 баллов");
  const overflow = await studentPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await studentContext.close();
});
