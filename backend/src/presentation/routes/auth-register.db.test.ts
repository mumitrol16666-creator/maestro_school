import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Stage 4, step 7: registration in the app. A person outside the school becomes an external student
// with no CRM link and gets a lead in CRM (not a CRM student); a parent registers the child and the
// link in one transaction; a CRM link later makes a student of the school.
if (!process.env.TEST_DATABASE_URL) {
  test("registration HTTP + PostgreSQL", { skip: "TEST_DATABASE_URL required" }, () => {});
} else {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && /test|qa/.test(url.pathname));
  Object.assign(process.env, {
    DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: "test",
    CRM_SESSION_CACHE_TTL_MS: "0", CRM_SESSION_STALE_MAX_AGE_MS: "0",
    JWT_SECRET: "register-test-secret", INTEGRATION_SERVICE_SECRET: "register-integration-secret",
    INTEGRATION_SSO_SECRET: "register-bridge-secret", CRM_API_URL: "http://crm.test:5002",
  });
  delete process.env.CRM_OUTBOUND_SECRET;
  const { default: Fastify } = await import("fastify");
  const { default: fastifyJwt } = await import("@fastify/jwt");
  const { default: multipart } = await import("@fastify/multipart");
  const { default: bcrypt } = await import("bcryptjs");
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { authRoutes } = await import("./auth.routes.js");
  const { catalogRoutes } = await import("./catalog.routes.js");
  const { learningRoutes } = await import("./learning.routes.js");
  const { coursePaymentsRoutes } = await import("./course-payments.routes.js");
  const { errorHandler } = await import("../middleware/error-handler.js");
  const { getLessonAccess } = await import("../../application/services/course-access.service.js");
  const { applyUserLink } = await import("../../application/repositories/user-link.repository.js");
  const weekly = await import("../../application/services/weekly-league.service.js");

  const app = Fastify();
  const suffix = randomUUID().replace(/\D/g, "").padEnd(7, "7").slice(0, 7);
  const userIds: string[] = [];
  const bookingUrl = "http://crm.test:5002/api/integration/v1/bookings/online-lesson";
  let directionId = "";
  let counter = 0;
  /** A unique 11-digit Kazakh-looking number: +7 7<suffix 7 digits><counter 2 digits>. */
  const phone = () => `+77${suffix}${String((counter += 1)).padStart(2, "0")}`;

  type Sent = { url: string; headers: Record<string, string>; body: Record<string, unknown> };
  const sent: Sent[] = [];
  let crmMode: "ok" | "down" | "error" = "ok";
  const realFetch = globalThis.fetch;
  const realError = console.error;
  const logged: string[] = [];

  const register = (payload: unknown) => app.inject({ method: "POST", url: "/api/v1/auth/register", payload: payload as never });
  const registerParent = (payload: unknown) => app.inject({ method: "POST", url: "/api/v1/auth/register/parent", payload: payload as never });
  const call = (token: string, method: "GET" | "POST", path: string) => app.inject({
    method, url: `/api/v1${path}`, headers: { authorization: `Bearer ${token}` },
  });
  /** The lead is sent after the answer, without waiting: give it a moment. */
  async function leads(count: number) {
    for (let attempt = 0; attempt < 40 && sent.length < count; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 25));
    return sent;
  }

  test.before(async () => {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const target = String(input);
      if (!target.startsWith("http://crm.test:5002")) return realFetch(input as never, init);
      sent.push({ url: target, headers: Object.fromEntries(new Headers(init?.headers).entries()), body: JSON.parse(String(init?.body ?? "{}")) });
      if (crmMode === "down") throw new TypeError("fetch failed");
      if (crmMode === "error") return new Response(JSON.stringify({ success: false, error: "boom" }), { status: 500 });
      return new Response(JSON.stringify({ success: true, data: { crmBookingId: "b1", externalSourceId: "x", status: "new" } }), { status: 200 });
    }) as typeof fetch;
    console.error = (...args: unknown[]) => { logged.push(args.map(String).join(" ")); };
    await app.register(fastifyJwt, { secret: process.env.JWT_SECRET!, sign: { expiresIn: "7d" } });
    await app.register(multipart, { limits: { fileSize: 1024 * 1024, files: 1 } });
    app.setErrorHandler(errorHandler);
    for (const plugin of [authRoutes, catalogRoutes, learningRoutes, coursePaymentsRoutes]) {
      await app.register(plugin, { prefix: "/api/v1" });
    }
    await app.ready();
    for (const slug of ["student", "parent"]) {
      const role = await prisma.role.upsert({ where: { slug }, create: { slug, name: slug }, update: {} });
      const codes = slug === "student"
        ? ["courses.read", "lessons.read", "progress.read", "progress.write", "homework.submit"]
        : ["family.read", "courses.read"];
      for (const code of codes) {
        const permission = await prisma.permission.upsert({ where: { code }, create: { code }, update: {} });
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
          create: { roleId: role.id, permissionId: permission.id }, update: {},
        });
      }
    }
    const direction = await prisma.direction.create({ data: { title: `Регистрация ${suffix}`, slug: `register-${suffix}`, isPublished: true } });
    directionId = direction.id;
  });

  test.beforeEach(() => {
    sent.length = 0;
    logged.length = 0;
    crmMode = "ok";
  });

  test.after(async () => {
    globalThis.fetch = realFetch;
    console.error = realError;
    await app.close();
    const ids = (await prisma.user.findMany({ where: { phoneNormalized: { startsWith: `77${suffix}` } }, select: { id: true } })).map((row) => row.id);
    const all = [...new Set([...userIds, ...ids])];
    await prisma.userNotification.deleteMany({ where: { userId: { in: all } } });
    await prisma.leagueXpEvent.deleteMany({ where: { studentId: { in: all } } });
    await prisma.lessonProgress.deleteMany({ where: { studentId: { in: all } } });
    await prisma.studentCourse.deleteMany({ where: { studentId: { in: all } } });
    await prisma.parentStudentLink.deleteMany({ where: { OR: [{ parentUserId: { in: all } }, { studentUserId: { in: all } }] } });
    await prisma.appUsageEvent.deleteMany({ where: { userId: { in: all } } });
    if (directionId) await prisma.course.deleteMany({ where: { directionId } });
    await prisma.user.deleteMany({ where: { id: { in: all } } });
    if (directionId) await prisma.direction.delete({ where: { id: directionId } });
    await prisma.$disconnect();
  });

  async function paidCourse() {
    const course = await prisma.course.create({ data: {
      directionId, title: `Курс регистрации ${suffix} ${randomUUID().slice(0, 4)}`, isPublished: true, priceKzt: 15000, includedInSchool: true,
    } });
    const module = await prisma.courseModule.create({ data: { courseId: course.id, title: "Модуль", sortOrder: 1 } });
    const lessons = [];
    for (const index of [1, 2, 3]) {
      lessons.push(await prisma.lesson.create({ data: { moduleId: module.id, title: `Урок ${index}`, sortOrder: index, isPublished: true } }));
    }
    return { course, lessons };
  }

  test("registration makes an external student, outside the league, and sends a lead to CRM — not a CRM student", async () => {
    const number = phone();
    const answer = await register({ firstName: "Алия", lastName: "Новикова", phone: number, password: "password-1234" });
    assert.equal(answer.statusCode, 201, answer.body);
    const { token, user } = answer.json().data;
    userIds.push(user.id);
    assert.deepEqual([user.audience, user.role], ["external", "student"]);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.deepEqual([row.crmStudentId, row.leagueEligible, row.externalLinkStatus], [null, false, null]);
    assert.equal(row.phoneNormalized, number.replace(/\D/g, ""));

    // CRM got one lead with the right body and the integration headers; no student was synced.
    const [lead] = await leads(1);
    assert.equal(sent.length, 1);
    assert.equal(lead.url, bookingUrl);
    assert.equal(lead.headers.authorization, "Bearer register-integration-secret");
    assert.equal(lead.headers["x-integration-system"], "learning-platform");
    assert.deepEqual(lead.body, {
      requestType: "app_registration",
      externalSourceId: `app-registration:${user.id}`,
      name: "Алия",
      lastName: "Новикова",
      phone: number.replace(/\D/g, ""),
    });
    assert.ok(!sent.some((item) => item.url.includes("sync-from-app")));

    // The same account on /auth/me.
    const me = await call(token, "GET", "/auth/me");
    assert.equal(me.json().data.audience, "external");

    // A paid course that is included in school stays closed for them from lesson 3 on; school students open it.
    const { course, lessons } = await paidCourse();
    assert.equal((await call(token, "POST", `/courses/${course.id}/enroll`)).statusCode, 200);
    for (const lesson of lessons.slice(0, 2)) {
      assert.equal((await call(token, "POST", `/lessons/${lesson.id}/start`)).statusCode, 200);
      assert.equal((await call(token, "POST", `/lessons/${lesson.id}/complete`)).statusCode, 200);
    }
    assert.equal((await getLessonAccess(user.id, lessons[1].id)).open, true);
    assert.equal((await getLessonAccess(user.id, lessons[2].id)).open, false, "closed from lesson 3");
    const paywall = await call(token, "GET", `/lessons/${lessons[2].id}`);
    assert.equal(paywall.json().data.access.kind, "locked");

    // No XP for a passed test, and not in the league.
    const xp = await weekly.awardPreparedTestXp({ studentId: user.id, testId: `t-${suffix}`, attemptNumber: 1, testTitle: "Тест" });
    assert.deepEqual([xp.awarded, xp.status], [false, "not_eligible"]);
    assert.equal(await prisma.leagueXpEvent.count({ where: { studentId: user.id } }), 0);
    assert.equal((await weekly.getWeeklyLeagueOverview(user.id)).currentStudent?.eligible, false);
  });

  test("a student of the school who registers on their own stays external until CRM links them", async () => {
    const number = phone();
    // The school already has this person: a student account linked to a CRM card on the same phone.
    const schoolRole = await prisma.role.findUniqueOrThrow({ where: { slug: "student" } });
    const school = await prisma.user.create({ data: {
      login: `school_${suffix}`, phone: number.replace(/\D/g, ""), phoneNormalized: number.replace(/\D/g, ""),
      passwordHash: await bcrypt.hash("password-1234", 4), firstName: "Школьник", lastName: "Старый", roleId: schoolRole.id,
      crmStudentId: `crm-old-${suffix}`, externalLinkStatus: "linked", linkedAt: new Date(),
    } });
    userIds.push(school.id);

    const answer = await register({ firstName: "Школьник", lastName: "Старый", phone: number, password: "password-5678" });
    assert.equal(answer.statusCode, 201, answer.body);
    const created = answer.json().data.user;
    userIds.push(created.id);
    assert.equal(created.audience, "external");
    const row = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
    assert.deepEqual([row.crmStudentId, row.leagueEligible], [null, false]);
    await leads(1);
    assert.deepEqual(sent.map((item) => item.url), [bookingUrl], "only a lead went to CRM, no link and no student");
  });

  test("CRM down or failing: the registration still succeeds and the error is logged", async () => {
    for (const mode of ["down", "error"] as const) {
      crmMode = mode;
      sent.length = 0;
      logged.length = 0;
      const answer = await register({ firstName: "Сеть", lastName: mode, phone: phone(), password: "password-1234" });
      assert.equal(answer.statusCode, 201, `${mode}: ${answer.body}`);
      userIds.push(answer.json().data.user.id);
      await leads(1);
      for (let attempt = 0; attempt < 40 && !logged.some((line) => line.includes("[app-registration] ERROR")); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 25));
      assert.ok(logged.some((line) => line.includes("[app-registration] ERROR") && line.includes(answer.json().data.user.id)), `${mode}: logged with the user id`);
      assert.equal((await prisma.user.count({ where: { id: answer.json().data.user.id } })), 1);
    }
  });

  test("a parent registers the parent, the child and the link at once; the parent sees the child's courses; one lead names the child", async () => {
    const parentPhone = phone();
    const childPhone = phone();
    const { course } = await paidCourse();
    const answer = await registerParent({
      parent: { firstName: "Ольга", lastName: "Петрова", phone: parentPhone, password: "parent-pass-1" },
      child: { firstName: "Лена", lastName: "Петрова", phone: childPhone, password: "child-pass-12" },
    });
    assert.equal(answer.statusCode, 201, answer.body);
    const data = answer.json().data;
    userIds.push(data.user.id, data.child.id);
    assert.deepEqual([data.user.role, data.user.audience], ["parent", "school"], "the answer is the parent's session");

    const parent = await prisma.user.findUniqueOrThrow({ where: { id: data.user.id }, include: { role: true } });
    const child = await prisma.user.findUniqueOrThrow({ where: { id: data.child.id }, include: { role: true } });
    assert.deepEqual([parent.role.slug, child.role.slug], ["parent", "student"]);
    assert.deepEqual([parent.leagueEligible, child.leagueEligible, child.crmStudentId, parent.crmStudentId], [false, false, null, null]);
    assert.equal(child.phoneNormalized, childPhone.replace(/\D/g, ""));
    const links = await prisma.parentStudentLink.findMany({ where: { parentUserId: parent.id } });
    assert.deepEqual(links.map((link) => [link.studentUserId, link.isActive, link.relationship]), [[child.id, true, "guardian"]]);

    // The parent opens the child's courses; the child is external, so the school-included course is not free.
    const courses = await call(data.token, "GET", `/parents/me/children/${child.id}/courses`);
    assert.equal(courses.statusCode, 200, courses.body);
    const entry = courses.json().data.find((item: { id: string }) => item.id === course.id);
    assert.deepEqual([entry.access.kind, entry.priceKzt], ["none", 15000]);
    assert.equal((await call(data.token, "GET", `/parents/me/children/${randomUUID()}/courses`)).statusCode, 404);

    // The child signs in with their own phone and is an external student.
    const childLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { phone: childPhone, password: "child-pass-12", profile: "student" } });
    assert.equal(childLogin.statusCode, 200, childLogin.body);
    assert.equal(childLogin.json().data.user.audience, "external");

    // One lead, from the parent, with the child in the comment.
    const [lead] = await leads(1);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(sent.length, 1);
    assert.deepEqual(lead.body, {
      requestType: "app_registration",
      externalSourceId: `app-registration:${parent.id}`,
      name: "Ольга",
      lastName: "Петрова",
      phone: parentPhone.replace(/\D/g, ""),
      comment: `Ребёнок: Лена Петрова, телефон ${childPhone.replace(/\D/g, "")}`,
    });
  });

  test("the child's phone must be there and differ from the parent's; a taken phone is a 409; nothing is created on a refusal", async () => {
    const parentPhone = phone();
    const childPhone = phone();
    const person = (number: string, name: string) => ({ firstName: name, lastName: "Семья", phone: number, password: "family-pass-1" });
    const created = async () => prisma.user.count({ where: { phoneNormalized: { startsWith: `77${suffix}` } } });
    const before = await created();

    const same = await registerParent({ parent: person(parentPhone, "Папа"), child: person(parentPhone.replace("+7", "8"), "Сын") });
    assert.equal(same.statusCode, 400, same.body);
    assert.equal(same.json().error.code, "CHILD_PHONE_SAME_AS_PARENT");

    const noPhone = await registerParent({ parent: person(parentPhone, "Папа"), child: { firstName: "Сын", lastName: "Семья", password: "family-pass-1" } });
    assert.equal(noPhone.statusCode, 400, noPhone.body);
    assert.match(noPhone.json().error.message, /телефон ребёнка/i);
    assert.equal((await registerParent({ parent: person(parentPhone, "Папа"), child: person("123", "Сын") })).statusCode, 400);
    assert.equal(await created(), before, "refusals create nothing");

    // The parent's phone is taken: 409, and the child is not created either (one transaction).
    const first = await registerParent({ parent: person(parentPhone, "Мама"), child: person(childPhone, "Дочь") });
    assert.equal(first.statusCode, 201, first.body);
    userIds.push(first.json().data.user.id, first.json().data.child.id);
    const afterFirst = await created();
    assert.equal(afterFirst, before + 2);

    const otherChild = phone();
    const parentTaken = await registerParent({ parent: person(parentPhone, "Другая"), child: person(otherChild, "Сын") });
    assert.equal(parentTaken.statusCode, 409, parentTaken.body);
    assert.equal(parentTaken.json().error.code, "PHONE_ALREADY_REGISTERED");
    const otherParent = phone();
    const childTaken = await registerParent({ parent: person(otherParent, "Другой"), child: person(childPhone, "Сын") });
    assert.equal(childTaken.statusCode, 409, childTaken.body);
    assert.equal(await created(), afterFirst, "a refused registration leaves nothing behind");
    assert.equal(await prisma.user.count({ where: { phoneNormalized: otherChild.replace(/\D/g, "") } }), 0);
    assert.equal(await prisma.user.count({ where: { phoneNormalized: otherParent.replace(/\D/g, "") } }), 0);
  });

  test("if the link cannot be written, neither the parent nor the child is left behind", async () => {
    const parentPhone = phone();
    const childPhone = phone();
    const fn = `fail_link_${suffix}`;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION ${fn}() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'link refused'; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${fn} BEFORE INSERT ON parent_student_links FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
    try {
      const failed = await registerParent({
        parent: { firstName: "Мама", lastName: "Откат", phone: parentPhone, password: "family-pass-1" },
        child: { firstName: "Сын", lastName: "Откат", phone: childPhone, password: "family-pass-1" },
      });
      assert.equal(failed.statusCode, 500, failed.body);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER ${fn} ON parent_student_links`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION ${fn}()`);
    }
    assert.equal(await prisma.user.count({ where: { phoneNormalized: { in: [parentPhone, childPhone].map((value) => value.replace(/\D/g, "")) } } }), 0, "the parent and the child were rolled back");
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(sent.length, 0, "no lead for a registration that did not happen");
  });

  test("a CRM link makes the student a student of the school and puts them in the league; the old session is closed on purpose; unlinking takes them out", async () => {
    const answer = await register({ firstName: "Связь", lastName: "Школьная", phone: phone(), password: "password-1234" });
    const { token, user } = answer.json().data;
    userIds.push(user.id);
    const crmStudentId = `crm-link-${suffix}`;

    const linked = await applyUserLink({ appUserId: user.id, phoneNormalized: user.phone, crmStudentId, crmRole: "student" });
    assert.equal(linked.success, true);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.deepEqual([row.crmStudentId, row.leagueEligible, row.externalLinkStatus], [crmStudentId, true, "linked"]);

    // Setting the link bumps the account's session version (a database trigger, as for every change of
    // the CRM link): the session issued while external is closed on purpose, the person signs in again
    // with the same phone and password and then sees the school interface.
    assert.equal((await call(token, "GET", "/auth/me")).statusCode, 401, "the old session is closed by the link");
    const relogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { phone: user.phone, password: "password-1234" } });
    assert.equal(relogin.statusCode, 200, relogin.body);
    assert.equal(relogin.json().data.user.audience, "school");
    const schoolToken = relogin.json().data.token as string;
    assert.equal((await call(schoolToken, "GET", "/auth/me")).json().data.audience, "school");
    const xp = await weekly.awardPreparedTestXp({ studentId: user.id, testId: `t2-${suffix}`, attemptNumber: 1, testTitle: "Тест" });
    assert.equal(xp.awarded, true, "now XP is paid");
    assert.equal((await weekly.getWeeklyLeagueOverview(user.id)).currentStudent?.eligible, true);

    // A repeated link to the same card does not undo an exclusion the school made by hand.
    await prisma.user.update({ where: { id: user.id }, data: { leagueEligible: false } });
    await applyUserLink({ appUserId: user.id, phoneNormalized: user.phone, crmStudentId, crmRole: "student" });
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).leagueEligible, false);
    await prisma.user.update({ where: { id: user.id }, data: { leagueEligible: true } });

    // The card moves to another account by force: the first one loses the link and the league, its session lives.
    const other = await register({ firstName: "Другой", lastName: "Аккаунт", phone: phone(), password: "password-1234" });
    userIds.push(other.json().data.user.id);
    const moved = await applyUserLink({ appUserId: other.json().data.user.id, phoneNormalized: other.json().data.user.phone, crmStudentId, crmRole: "student", force: true });
    assert.equal(moved.success, true);
    const first = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.deepEqual([first.crmStudentId, first.leagueEligible], [null, false]);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: other.json().data.user.id } })).leagueEligible, true);
    assert.equal((await call(schoolToken, "GET", "/auth/me")).statusCode, 401, "losing the link closes the session too");
    const again = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { phone: user.phone, password: "password-1234" } });
    assert.equal(again.json().data.user.audience, "external", "and the person is external again");
  });
}
