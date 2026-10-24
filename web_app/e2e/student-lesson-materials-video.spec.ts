import { expect, test } from "@playwright/test";

/**
 * A confirmed lesson's materials for the student: YouTube / Vimeo links play in an embedded
 * player whatever type they were saved with, uploaded video files play natively, other links
 * open on their site. The lesson comes from a real completed QA lesson; the materials are
 * injected into the summary response, so the test does not depend on CRM data.
 */
const PASSWORD = "QaMaestro2026!";

test("YouTube links in lesson materials are embedded, not fed to a native player", async ({ page, request, context }) => {
  const login = await request.post("/api/v1/auth/login", { data: { phone: "qa_student_1", password: PASSWORD, profile: "student" } });
  expect(login.ok(), await login.text()).toBe(true);
  const session = (await login.json()).data as { token: string; user: unknown };
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, session);

  const materials = [
    { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12s#google_vignette", type: "video", title: "Бой восьмыми, разбор" },
    { url: "https://youtu.be/3JZ_D3ELwOQ", type: "link", title: "Переходы Am–E" },
    { url: "https://www.youtube.com/live/5qap5aO4i9A", type: "video", title: "Прямой эфир урока" },
    { url: "/api/v1/media/files/qa-demo.mp4", type: "video", title: "Запись с урока" },
    { url: "https://mychords.net/ru/tatyana-kurtukova/247535.html", type: "link", title: "Аккорды «Одного»" },
  ];
  let lessonId = "";
  await page.route("**/api/v1/students/me/offline-summary", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const completed = (body.data.lessonHistory as Array<{ crmClassId: string; status: string; materials?: unknown }>)
      .find((lesson) => lesson.status === "completed");
    expect(completed, "the QA student has at least one completed lesson").toBeTruthy();
    lessonId = completed!.crmClassId;
    completed!.materials = materials;
    await route.fulfill({ response, json: body });
  });

  await page.goto("/school-lessons?tab=history");
  await expect.poll(() => lessonId).not.toBe("");
  await page.goto(`/school-lessons?tab=history&lesson=${encodeURIComponent(lessonId)}`);
  await expect(page.getByText("Материалы урока")).toBeVisible();

  const embeds = page.getByTestId("material-embed").locator("iframe");
  await expect(embeds).toHaveCount(3);
  for (const id of ["dQw4w9WgXcQ", "3JZ_D3ELwOQ", "5qap5aO4i9A"]) {
    await expect(page.locator(`iframe[src*="youtube.com/embed/${id}"]`)).toHaveCount(1);
  }
  await expect(page.locator('video[src*="youtube"]')).toHaveCount(0);
  await expect(page.getByTestId("material-video-file")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Открыть видео на сайте" })).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Открыть материал" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Скачать файл" })).toHaveCount(1);
});

test("a notification link to a lesson older than the history says so", async ({ page, request, context }) => {
  const login = await request.post("/api/v1/auth/login", { data: { phone: "qa_student_1", password: PASSWORD, profile: "student" } });
  const session = (await login.json()).data as { token: string; user: unknown };
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, session);
  await page.goto("/school-lessons?tab=history&lesson=QA-CLASS-THAT-FELL-OUT");
  await expect(page.getByTestId("history-lesson-missing")).toContainText("старше последних");
});
