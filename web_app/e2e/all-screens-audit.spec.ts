import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const PASSWORD = "QaMaestro2026!";

type Profile = "student" | "parent" | "staff";

type RouteAudit = {
  path: string;
  errors: string[];
};

const studentRoutes = [
  "/dashboard",
  "/learning",
  "/monthly-plan",
  "/tasks",
  "/school-lessons",
  "/online-lessons",
  "/messages",
  "/progress",
  "/league",
  "/rewards",
  "/courses",
  "/tests",
  "/settings",
  "/board",
];

const familyRoutes = ["/family", "/family/messages", "/family/settings"];

const teacherRoutes = [
  "/admin",
  "/admin/my-students",
  "/admin/offline-lessons",
  "/admin/online-lessons",
  "/admin/messages",
  "/admin/settings",
];

const adminRoutes = [
  "/admin",
  "/admin/learning",
  "/admin/offline-lessons",
  "/admin/online-lessons",
  "/admin/homework-review",
  "/admin/courses",
  "/admin/tests",
  "/admin/directions",
  "/admin/lesson-questions",
  "/admin/media",
  "/admin/league",
  "/admin/communications",
  "/admin/messages",
  "/admin/news",
  "/admin/people",
  "/admin/students",
  "/admin/users",
  "/admin/journal",
  "/admin/rewards",
  "/admin/statistics",
  "/admin/statistics/homework",
  "/admin/settings",
];

const publicRoutes = ["/login", "/register", "/trial-lesson"];

async function loginSession(
  request: APIRequestContext,
  login: string,
  profile: Profile,
) {
  const response = await request.post("/api/v1/auth/login", {
    data: { phone: login, password: PASSWORD, profile },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()).data as { token: string; user: unknown };
}

async function installSession(
  context: BrowserContext,
  session: { token: string; user: unknown },
) {
  await context.addInitScript(({ token, user }) => {
    window.localStorage.setItem("maestro_access_token", token);
    window.localStorage.setItem("maestro_auth_user", JSON.stringify(user));
  }, session);
}

async function auditRoute(page: Page, path: string): Promise<RouteAudit> {
  const pageErrors: string[] = [];
  const onPageError = (error: Error) => pageErrors.push(error.message);
  page.on("pageerror", onPageError);

  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.locator("body").waitFor({ state: "visible" });
  await page.waitForTimeout(150);

  const visibleTechnicalFailure = await page
    .getByText(
      /Application error|client-side exception|ChunkLoadError|Cannot read properties of|TypeError:/i,
    )
    .count();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));

  page.off("pageerror", onPageError);

  const errors = [...pageErrors];
  if (response && response.status() >= 500) errors.push(`HTTP ${response.status()}`);
  if (visibleTechnicalFailure > 0) errors.push("На экране показан технический текст ошибки");
  if (dimensions.page > dimensions.viewport + 1) {
    errors.push(`Горизонтальный вылет: ${dimensions.page}px при окне ${dimensions.viewport}px`);
  }
  return { path, errors };
}

async function discoverLinkedRoutes(
  page: Page,
  sources: Array<{ path: string; patterns: RegExp[]; fallbacks: string[] }>,
) {
  const routes = new Set<string>();
  for (const source of sources) {
    await page.goto(source.path, { waitUntil: "domcontentloaded" });
    await page.locator("body").waitFor({ state: "visible" });
    const hrefs = await page.locator("a[href]").evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).getAttribute("href") ?? ""),
    );
    for (const href of hrefs) {
      if (source.patterns.some((pattern) => pattern.test(href))) routes.add(href);
    }
    source.patterns.forEach((pattern, index) => {
      if (!hrefs.some((href) => pattern.test(href))) routes.add(source.fallbacks[index]);
    });
  }
  return [...routes];
}

async function auditRoutes(page: Page, paths: string[]) {
  const results: RouteAudit[] = [];
  for (const path of paths) results.push(await auditRoute(page, path));
  const failures = results.filter((result) => result.errors.length > 0);
  expect(
    failures,
    failures.map((failure) => `${failure.path}: ${failure.errors.join("; ")}`).join("\n"),
  ).toEqual([]);
}

test("public screens load without a client crash", async ({ page }) => {
  test.setTimeout(60_000);
  await auditRoutes(page, publicRoutes);
});

test("root opens the login screen", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: /Вход/ })).toBeVisible();
});

test("student screens and available cards load cleanly", async ({ page, request, context }) => {
  test.setTimeout(120_000);
  await installSession(context, await loginSession(request, "qa_student_1", "student"));
  const dynamicRoutes = await discoverLinkedRoutes(page, [
    { path: "/courses", patterns: [/^\/courses\/[^/]+$/], fallbacks: ["/courses/qa-route-audit"] },
    { path: "/tests", patterns: [/^\/tests\/[^/]+$/], fallbacks: ["/tests/qa-route-audit"] },
    { path: "/school-lessons", patterns: [/^\/lessons\/[^/]+$/], fallbacks: ["/lessons/qa-route-audit"] },
    { path: "/online-lessons", patterns: [/^\/online-lessons\/[^/]+$/], fallbacks: ["/online-lessons/qa-route-audit"] },
  ]);
  await auditRoutes(page, [...studentRoutes, ...dynamicRoutes]);
});

test("family screens load cleanly", async ({ page, request, context }) => {
  test.setTimeout(60_000);
  await installSession(context, await loginSession(request, "qa_parent_1", "parent"));
  await auditRoutes(page, familyRoutes);
});

test("teacher screens and available lesson cards load cleanly", async ({ page, request, context }) => {
  test.setTimeout(90_000);
  await installSession(context, await loginSession(request, "qa_teacher_1", "staff"));
  const dynamicRoutes = await discoverLinkedRoutes(page, [
    {
      path: "/admin/my-students",
      patterns: [
        /^\/admin\/my-students\/group\/[^/]+\/plan$/,
        /^\/admin\/my-students\/student\/[^/]+\/plan$/,
      ],
      fallbacks: [
        "/admin/my-students/group/qa-route-audit/plan",
        "/admin/my-students/student/qa-route-audit/plan",
      ],
    },
    { path: "/admin/offline-lessons", patterns: [/^\/admin\/offline-lessons\/[^/]+$/], fallbacks: ["/admin/offline-lessons/qa-route-audit"] },
    { path: "/admin/online-lessons", patterns: [/^\/admin\/online-lessons\/[^/]+$/], fallbacks: ["/admin/online-lessons/qa-route-audit"] },
  ]);
  await auditRoutes(page, [...teacherRoutes, ...dynamicRoutes]);
});

test("admin screens and available records load cleanly", async ({ page, request, context }) => {
  test.setTimeout(150_000);
  await installSession(context, await loginSession(request, "qa_admin", "staff"));
  const dynamicRoutes = await discoverLinkedRoutes(page, [
    { path: "/admin/courses", patterns: [/^\/admin\/courses\/[^/]+$/], fallbacks: ["/admin/courses/qa-route-audit"] },
    { path: "/admin/homework-review", patterns: [/^\/admin\/homework-review\/[^/]+$/], fallbacks: ["/admin/homework-review/qa-route-audit"] },
    { path: "/admin/offline-lessons", patterns: [/^\/admin\/offline-lessons\/[^/]+$/], fallbacks: ["/admin/offline-lessons/qa-route-audit"] },
    { path: "/admin/online-lessons", patterns: [/^\/admin\/online-lessons\/[^/]+$/], fallbacks: ["/admin/online-lessons/qa-route-audit"] },
    { path: "/admin/students", patterns: [/^\/admin\/students\/[^/]+$/], fallbacks: ["/admin/students/qa-route-audit"] },
    { path: "/admin/users", patterns: [/^\/admin\/users\/[^/]+$/], fallbacks: ["/admin/users/qa-route-audit"] },
    { path: "/admin/tests", patterns: [/^\/admin\/tests\/[^/]+\/preview$/], fallbacks: ["/admin/tests/qa-route-audit/preview"] },
  ]);
  await auditRoutes(page, [...adminRoutes, ...dynamicRoutes]);
});
