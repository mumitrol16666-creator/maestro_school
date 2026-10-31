import { execFileSync } from "node:child_process";
import { startQaLessonForTeacher } from "./qa-start";
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

/**
 * Plan 1.12 tail (task D): the admin keeps materials on a topic of a program step. They are saved with
 * the step, survive a reload, can be taken off, and a teacher who opens a sector from this step for a
 * student sees them under «Материалы темы» in the lesson.
 *
 * Needs a fresh qa-seed (QA-STUDENT-3 without an open sector, QA-DIRECTION-GUITAR «Гитара»).
 * Not idempotent by itself: the sector it opens for QA-STUDENT-3 is closed again in afterAll, so
 * `lesson-1-14` («Открыть сектор») keeps working.
 */
const PASSWORD = "QaMaestro2026!";
const CRM_URL = process.env.QA_CRM_URL ?? "http://127.0.0.1:5002";
const QA_SECRET = process.env.QA_CONTROLLER_SECRET ?? "local-maestro-qa-controller-2026";
const QA_DB = process.env.QA_PLATFORM_DB ?? "maestro_regression";
const DIRECTION = "Гитара";
const STUDENT = "QA-STUDENT-3";
const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 100)}`;
const stepTitle = `Ступень QA материалы ${runId}`;
const topicTitle = `Тема с материалами ${runId}`;
const materialA = `Бой восьмыми QA ${runId}`;
const materialB = `Перебор QA ${runId}`;
const yesterday = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

type Session = { token: string; user: unknown };

async function login(request: APIRequestContext, phone: string): Promise<Session> {
  const response = await request.post("/api/v1/auth/login", { data: { phone, password: PASSWORD, profile: "staff" } });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).data as Session;
}

async function install(context: BrowserContext, session: Session) {
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, session);
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

/** The page picks the first direction itself once the list has loaded; wait for that, then choose ours. */
async function pickDirection(page: Page) {
  const select = page.getByLabel("Направление");
  await expect(select).not.toHaveValue("");
  await select.selectOption({ label: DIRECTION });
  await expect(select.locator("option:checked")).toHaveText(DIRECTION);
}

function psql(sql: string, db = QA_DB) {
  execFileSync("psql", ["-h", "localhost", "-U", "vladislav", "-d", db, "-At", "-c", sql]);
}

const QA_CRM_DB = process.env.QA_CRM_DB ?? "maestro_crm_regression";
/**
 * The sector editor in the lesson takes the student's directions from the teacher's roster, and the seed
 * leaves QA-STUDENT-3 without a teacher. The spec hands the student to QA-TEACHER-1 for the run and takes
 * them back in afterAll.
 */
function assignStudentTo(teacherId: string | null) {
  psql(`update "Student" set "assignedTeacherId" = ${teacherId ? `'${teacherId}'` : "null"} where id = '${STUDENT}'`, QA_CRM_DB);
}

/** QA-STUDENT-3 has no open sector in the seed; whatever this spec opened is closed again. */
function closeStudentSectors() {
  psql(`update learning_plans set status = 'closed', closed_at = now(), close_reason = 'qa-cleanup' where crm_student_id = '${STUDENT}' and status = 'active'`);
}

async function savedStep(request: APIRequestContext, token: string) {
  const response = await request.get("/api/v1/admin/sector-templates", { headers: { Authorization: `Bearer ${token}` } });
  expect(response.ok(), await response.text()).toBe(true);
  const rows = (await response.json()).data as Array<{
    id: string; title: string; isPublished: boolean; topics: Array<{ title: string; materials: Array<{ title: string; url: string }> }>;
  }>;
  return rows.find((row) => row.title === stepTitle);
}

test.describe.configure({ mode: "serial" });

let adminSession: Session;

test.afterAll(async ({ request }) => {
  closeStudentSectors();
  assignStudentTo(null);
  // The step leaves the teachers' list of steps, so later runs and other specs see a clean picker.
  const token = adminSession?.token;
  if (!token) return;
  const step = await savedStep(request, token);
  if (step?.isPublished) {
    await request.post(`/api/v1/admin/sector-templates/${step.id}/publish`, { headers: { Authorization: `Bearer ${token}` }, data: { isPublished: false } });
  }
});

test("the admin adds materials to a topic of a step, saves, and they stay after a reload", async ({ page, request, context }, testInfo) => {
  adminSession = await login(request, "qa_admin");
  const headers = { Authorization: `Bearer ${adminSession.token}` };
  for (const [title, suffix] of [[materialA, "a"], [materialB, "b"]] as const) {
    const added = await request.post("/api/v1/materials/library/links", { headers, data: { url: `https://www.youtube.com/watch?v=tpl${runId}${suffix}`, title } });
    expect(added.ok(), await added.text()).toBe(true);
  }
  await install(context, adminSession);

  await page.goto("/admin/sector-templates");
  await expect(page.getByRole("heading", { name: "Ступени программы" })).toBeVisible();
  await pickDirection(page);
  await page.getByRole("button", { name: "Новая ступень" }).click();
  await page.getByLabel("Название ступени").fill(stepTitle);
  await page.getByPlaceholder("Тема или песня").first().fill(topicTitle);

  // The block of the first topic: empty at first, then two materials picked from the library.
  const block = page.getByTestId("topic-materials").first();
  await expect(block).toContainText("Материалы темы");
  await expect(block.getByTestId("topic-materials-list")).toHaveCount(0);
  for (const title of [materialA, materialB]) {
    await block.getByRole("combobox").fill(title);
    await block.getByRole("option", { name: new RegExp(title) }).click();
  }
  const list = block.getByTestId("topic-materials-list");
  await expect(list).toContainText(materialA);
  await expect(list).toContainText(materialB);
  // Taking one off is a 44 px button with its own name.
  const takeOffB = block.getByRole("button", { name: new RegExp(`^Убрать материал ${materialB}`) });
  const box = await takeOffB.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
  await takeOffB.click();
  await expect(list).not.toContainText(materialB);
  await block.getByRole("combobox").fill(materialB);
  await block.getByRole("option", { name: new RegExp(materialB) }).click();
  await expect(list).toContainText(materialB);
  await noHorizontalScroll(page);
  await page.screenshot({ path: testInfo.outputPath("editor-materials.png"), fullPage: true });

  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  const card = page.locator("article").filter({ hasText: stepTitle });
  await expect(card).toBeVisible({ timeout: 15_000 });

  // Saved with the step: the API gives them back in the order they were added.
  const saved = await savedStep(request, adminSession.token);
  expect(saved?.topics.map((topic) => topic.title)).toEqual([topicTitle]);
  expect(saved?.topics[0]?.materials.map((material) => material.title)).toEqual([materialA, materialB]);

  // After a reload the editor shows them again; one is taken off and the change is saved too.
  await page.reload();
  await pickDirection(page);
  await page.locator("article").filter({ hasText: stepTitle }).getByRole("button", { name: "Изменить" }).click();
  const reopened = page.getByTestId("topic-materials").first();
  await expect(reopened.getByTestId("topic-materials-list")).toContainText(materialA);
  await expect(reopened.getByTestId("topic-materials-list")).toContainText(materialB);
  await reopened.getByRole("button", { name: new RegExp(`^Убрать материал ${materialB}`) }).click();
  await expect(reopened.getByTestId("topic-materials-list")).not.toContainText(materialB);
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByText("Изменить ступень")).toHaveCount(0, { timeout: 15_000 });

  await page.reload();
  await pickDirection(page);
  await page.locator("article").filter({ hasText: stepTitle }).getByRole("button", { name: "Изменить" }).click();
  const afterRemoval = page.getByTestId("topic-materials").first().getByTestId("topic-materials-list");
  await expect(afterRemoval).toContainText(materialA);
  await expect(afterRemoval).not.toContainText(materialB);
  await noHorizontalScroll(page);
  await page.getByRole("button", { name: "Отмена" }).click();

  // The step goes to teachers.
  await page.locator("article").filter({ hasText: stepTitle }).getByRole("button", { name: "Опубликовать" }).click();
  await expect(page.locator("article").filter({ hasText: stepTitle }).getByRole("button", { name: "Снять с публикации" })).toBeVisible({ timeout: 15_000 });
});

test("a sector opened from the step brings the topic materials into the teacher's lesson", async ({ page, request, context }, testInfo) => {
  closeStudentSectors();
  assignStudentTo("QA-TEACHER-1");
  const teacher = await login(request, "qa_teacher_1");
  await install(context, teacher);

  const created = await request.post(`${CRM_URL}/api/qa/v1/lessons`, {
    headers: { "X-Maestro-QA-Secret": QA_SECRET },
    data: {
      scenarioId: `STM-${runId}`,
      classType: "individual",
      studentId: STUDENT,
      teacherId: "QA-TEACHER-1",
      date: yesterday(),
      startTime: "03:00",
      endTime: "04:00",
      title: `Урок материалы ступени ${runId}`,
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const crmClassId = (await created.json()).data.class.crmClassId as string;
  await startQaLessonForTeacher(request, crmClassId);

  await page.goto(`/admin/offline-lessons/${crmClassId}`);
  const nav = page.getByTestId("lesson-step-nav");
  await nav.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByText("Сектор ещё не открыт")).toBeVisible();
  await page.getByRole("button", { name: "Открыть сектор" }).click();
  const drawer = page.getByTestId("lesson-sector-drawer");
  await expect(drawer).toBeVisible();
  const direction = drawer.getByLabel("Направление");
  if (await direction.count()) await direction.first().selectOption({ label: DIRECTION });
  await drawer.getByRole("button", { name: new RegExp(stepTitle) }).click();
  await expect(drawer.getByPlaceholder("Песня или навык (напр. Кукла колдуна)").first()).toHaveValue(topicTitle);
  page.once("dialog", (dialog) => void dialog.accept());
  await drawer.getByRole("button", { name: "Опубликовать ученику" }).click();
  await expect(drawer.getByText(/Опубликовано ученику/)).toBeVisible({ timeout: 15_000 });
  await drawer.getByRole("button", { name: "Закрыть сектор" }).click();
  await expect(drawer).toHaveCount(0);

  // On the lesson step with the homework topic the material of that topic is offered as a button.
  await page.reload();
  await nav.getByRole("button", { name: "Далее" }).click();
  await nav.getByRole("button", { name: "Далее" }).click();
  await page.locator("#learning-homework-topic").selectOption({ label: topicTitle });
  const suggested = page.getByTestId("lesson-suggested-materials");
  await expect(suggested).toContainText("Материалы темы");
  await expect(suggested.getByRole("button", { name: `+ ${materialA}` })).toBeVisible();
  await expect(suggested).not.toContainText(materialB);
  await suggested.getByRole("button", { name: `+ ${materialA}` }).click();
  await expect(page.getByTestId("lesson-picked-materials")).toContainText(materialA);
  await noHorizontalScroll(page);
  await page.screenshot({ path: testInfo.outputPath("lesson-suggested-materials.png"), fullPage: true });
});
