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
  const { familyRoutes } = await import("./family.routes.js");
  const { errorHandler } = await import("../middleware/error-handler.js");
  const { getLessonAccess } = await import("../../application/services/course-access.service.js");
  const { applyUserLink } = await import("../../application/repositories/user-link.repository.js");
  const weekly = await import("../../application/services/weekly-league.service.js");
  const { retryPendingAppRegistrationLeads } = await import("../../application/services/app-registration-lead-job.service.js");
  const { default: rateLimit } = await import("@fastify/rate-limit");

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
    for (const plugin of [authRoutes, catalogRoutes, learningRoutes, coursePaymentsRoutes, familyRoutes]) {
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

  /** The lead and its flag are written after the answer, without waiting: poll until the check holds. */
  async function until(check: () => Promise<boolean>) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (await check()) return true;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return false;
  }
  const pendingSince = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id }, select: { crmLeadPendingSince: true } })).crmLeadPendingSince;
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000);

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
    // The flag is set at registration and cleared when CRM answers.
    assert.ok(await until(async () => (await pendingSince(user.id)) === null), "CRM accepted the lead: the flag is cleared");

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

  test("a phone that an active account already has is a 409 PHONE_ALREADY_REGISTERED; a deleted or switched-off account does not hold the phone", async () => {
    const number = phone();
    const digits = number.replace(/\D/g, "");
    // The school already has this person: a student account linked to a CRM card on the same phone.
    const schoolRole = await prisma.role.findUniqueOrThrow({ where: { slug: "student" } });
    const school = await prisma.user.create({ data: {
      login: `school_${suffix}`, phone: digits, phoneNormalized: digits,
      passwordHash: await bcrypt.hash("password-1234", 4), firstName: "Школьник", lastName: "Старый", roleId: schoolRole.id,
      crmStudentId: `crm-old-${suffix}`, externalLinkStatus: "linked", linkedAt: new Date(),
    } });
    userIds.push(school.id);

    const refused = await register({ firstName: "Школьник", lastName: "Старый", phone: number, password: "password-5678" });
    assert.equal(refused.statusCode, 409, refused.body);
    assert.equal(refused.json().error.code, "PHONE_ALREADY_REGISTERED");
    // Any spelling of the same number is the same phone.
    const spelled = await register({ firstName: "Школьник", lastName: "Старый", phone: number.replace("+7", "8"), password: "password-5678" });
    assert.equal(spelled.statusCode, 409, spelled.body);
    assert.equal(await prisma.user.count({ where: { phoneNormalized: digits } }), 1, "nothing was created");
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(sent.length, 0, "no lead for a refused registration");

    // A deleted account, or a switched-off one, does not hold the phone.
    await prisma.user.update({ where: { id: school.id }, data: { deletedAt: new Date() } });
    const afterDelete = await register({ firstName: "Новый", lastName: "Владелец", phone: number, password: "password-5678" });
    assert.equal(afterDelete.statusCode, 201, afterDelete.body);
    userIds.push(afterDelete.json().data.user.id);
    await prisma.user.update({ where: { id: afterDelete.json().data.user.id }, data: { isActive: false } });
    const afterOff = await register({ firstName: "Ещё", lastName: "Владелец", phone: number, password: "password-5678" });
    assert.equal(afterOff.statusCode, 201, afterOff.body);
    userIds.push(afterOff.json().data.user.id);
  });

  test("two registrations on one phone at once: exactly one is created; same for the parent form and for crossed phones", async () => {
    const solo = phone();
    const results = await Promise.all([1, 2, 3, 4].map((n) => register({ firstName: `Гонка${n}`, lastName: "Один", phone: solo, password: "password-1234" })));
    for (const r of results) if (r.statusCode === 201) userIds.push(r.json().data.user.id);
    assert.deepEqual(results.map((r) => r.statusCode).sort(), [201, 409, 409, 409], results.map((r) => r.body).join("\n"));
    assert.equal(await prisma.user.count({ where: { phoneNormalized: solo.replace(/\D/g, ""), deletedAt: null } }), 1);

    // Two parent registrations that name the same two phones in opposite order: one wins, no deadlock.
    const [first, second] = [phone(), phone()];
    const person = (number: string, name: string) => ({ firstName: name, lastName: "Гонка", phone: number, password: "family-pass-1" });
    const family = await Promise.all([
      registerParent({ parent: person(first, "А"), child: person(second, "Б") }),
      registerParent({ parent: person(second, "В"), child: person(first, "Г") }),
      register({ firstName: "Д", lastName: "Гонка", phone: second, password: "password-1234" }),
    ]);
    for (const r of family) if (r.statusCode === 201) userIds.push(r.json().data.user.id, ...(r.json().data.child ? [r.json().data.child.id] : []));
    assert.equal(family.filter((r) => r.statusCode === 201).length, 1, family.map((r) => `${r.statusCode} ${r.body}`).join("\n"));
    assert.ok(family.every((r) => [201, 409].includes(r.statusCode)), "refusals are 409, not 500");
    assert.equal(await prisma.user.count({ where: { phoneNormalized: { in: [first, second].map((value) => value.replace(/\D/g, "")) }, deletedAt: null } }), family.some((r) => r.statusCode === 201 && r.json().data.child) ? 2 : 1);
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
      await new Promise((resolve) => setTimeout(resolve, 60));
      assert.ok(await pendingSince(answer.json().data.user.id), `${mode}: the lead is still to be sent, the flag stays`);
    }
  });

  test("the retry job sends a lead that CRM did not take, with the same externalSourceId, once; the flag goes", async () => {
    crmMode = "down";
    const answer = await register({ firstName: "Повтор", lastName: "Заявки", phone: phone(), password: "password-1234" });
    const id = answer.json().data.user.id as string;
    userIds.push(id);
    await leads(1);
    assert.ok(await until(async () => logged.some((line) => line.includes(id))));
    const firstAttempt = sent[0];
    assert.equal(firstAttempt.body.externalSourceId, `app-registration:${id}`);
    assert.ok(await pendingSince(id));

    // A fresh registration is left alone: the first attempt may still be in flight.
    sent.length = 0;
    await retryPendingAppRegistrationLeads();
    assert.equal(sent.filter((item) => item.body.externalSourceId === `app-registration:${id}`).length, 0, "younger than two minutes");

    // CRM still down: tried, flag stays, nothing is logged for a failed retry.
    await prisma.user.update({ where: { id }, data: { crmLeadPendingSince: minutesAgo(3) } });
    logged.length = 0;
    const failedRun = await retryPendingAppRegistrationLeads();
    assert.ok(failedRun.failed >= 1);
    assert.ok(await pendingSince(id), "CRM down: the flag stays");
    assert.equal(logged.filter((line) => line.includes(id)).length, 0, "a failed retry is not logged every ten minutes");

    // CRM is back: the lead goes with the same id and the flag is cleared; the next run sends nothing.
    crmMode = "ok";
    sent.length = 0;
    const okRun = await retryPendingAppRegistrationLeads();
    assert.ok(okRun.sent >= 1);
    const mine = sent.filter((item) => item.body.externalSourceId === `app-registration:${id}`);
    assert.equal(mine.length, 1);
    assert.deepEqual(mine[0].body, firstAttempt.body, "the same request as the first time");
    assert.equal(await pendingSince(id), null);
    sent.length = 0;
    await retryPendingAppRegistrationLeads();
    assert.equal(sent.filter((item) => item.body.externalSourceId === `app-registration:${id}`).length, 0, "a sent lead is not sent again");
  });

  test("the retry job sends a parent's lead with the child in the comment; gives up after seven days with one log line; skips linked and deleted users", async () => {
    crmMode = "down";
    const childPhone = phone();
    const answer = await registerParent({
      parent: { firstName: "Мама", lastName: "Повтор", phone: phone(), password: "family-pass-1" },
      child: { firstName: "Сын", lastName: "Повтор", phone: childPhone, password: "family-pass-1" },
    });
    const parentId = answer.json().data.user.id as string;
    userIds.push(parentId, answer.json().data.child.id);
    assert.ok(await pendingSince(parentId), "the flag is the parent's");
    assert.equal(await pendingSince(answer.json().data.child.id), null, "the child has none");
    await leads(1);
    await new Promise((resolve) => setTimeout(resolve, 80));
    crmMode = "ok";
    sent.length = 0;
    await prisma.user.update({ where: { id: parentId }, data: { crmLeadPendingSince: minutesAgo(5) } });
    await retryPendingAppRegistrationLeads();
    const lead = sent.find((item) => item.body.externalSourceId === `app-registration:${parentId}`);
    assert.ok(lead, "the parent's lead was re-sent");
    assert.equal(lead.body.comment, `Ребёнок: Сын Повтор, телефон ${childPhone.replace(/\D/g, "")}`);
    assert.equal(await pendingSince(parentId), null);

    // Seven days without luck: stop, one line in the log naming the user, the flag cleared.
    const old = await register({ firstName: "Давно", lastName: "Ждёт", phone: phone(), password: "password-1234" });
    const oldId = old.json().data.user.id as string;
    userIds.push(oldId);
    await leads(1);
    await new Promise((resolve) => setTimeout(resolve, 80));
    await prisma.user.update({ where: { id: oldId }, data: { crmLeadPendingSince: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) } });
    sent.length = 0;
    logged.length = 0;
    await retryPendingAppRegistrationLeads();
    await retryPendingAppRegistrationLeads();
    assert.equal(logged.filter((line) => line.includes(oldId)).length, 1, "logged once");
    assert.equal(sent.filter((item) => item.body.externalSourceId === `app-registration:${oldId}`).length, 0, "not sent after seven days");
    assert.equal(await pendingSince(oldId), null);

    // Linked to a CRM student meanwhile, or deleted: nothing to send.
    const linked = await register({ firstName: "Связан", lastName: "Позже", phone: phone(), password: "password-1234" });
    const gone = await register({ firstName: "Удалён", lastName: "Позже", phone: phone(), password: "password-1234" });
    const [linkedId, goneId] = [linked.json().data.user.id as string, gone.json().data.user.id as string];
    userIds.push(linkedId, goneId);
    await leads(2);
    await new Promise((resolve) => setTimeout(resolve, 80));
    await prisma.user.update({ where: { id: linkedId }, data: { crmStudentId: `crm-late-${suffix}`, crmLeadPendingSince: minutesAgo(5) } });
    await prisma.user.update({ where: { id: goneId }, data: { deletedAt: new Date(), crmLeadPendingSince: minutesAgo(5) } });
    sent.length = 0;
    await retryPendingAppRegistrationLeads();
    assert.equal(sent.filter((item) => [linkedId, goneId].some((value) => item.body.externalSourceId === `app-registration:${value}`)).length, 0);
    assert.equal(await pendingSince(linkedId), null);
    assert.equal(await pendingSince(goneId), null, "a deleted account's flag goes too");

    // Switched off, or a parent whose child the school has linked since: nothing to send, the flag goes.
    const off = await register({ firstName: "Выключен", lastName: "Позже", phone: phone(), password: "password-1234" });
    const offId = off.json().data.user.id as string;
    const family = await registerParent({
      parent: { firstName: "Мама", lastName: "Школа", phone: phone(), password: "family-pass-1" },
      child: { firstName: "Дочь", lastName: "Школа", phone: phone(), password: "family-pass-1" },
    });
    const [familyParentId, familyChildId] = [family.json().data.user.id as string, family.json().data.child.id as string];
    userIds.push(offId, familyParentId, familyChildId);
    await leads(2);
    await new Promise((resolve) => setTimeout(resolve, 80));
    await prisma.user.update({ where: { id: offId }, data: { isActive: false, crmLeadPendingSince: minutesAgo(5) } });
    await prisma.user.update({ where: { id: familyParentId }, data: { crmLeadPendingSince: minutesAgo(5) } });
    await prisma.user.update({ where: { id: familyChildId }, data: { crmStudentId: `crm-child-${suffix}` } });
    sent.length = 0;
    await retryPendingAppRegistrationLeads();
    assert.equal(sent.filter((item) => [offId, familyParentId].some((value) => item.body.externalSourceId === `app-registration:${value}`)).length, 0);
    assert.equal(await pendingSince(offId), null);
    assert.equal(await pendingSince(familyParentId), null);
  });

  test("both registration forms share one limit of 5 a minute per IP", async () => {
    const limited = Fastify();
    await limited.register(fastifyJwt, { secret: process.env.JWT_SECRET!, sign: { expiresIn: "7d" } });
    await limited.register(rateLimit, { global: false });
    limited.setErrorHandler(errorHandler);
    await limited.register(authRoutes, { prefix: "/api/v1" });
    await limited.ready();
    // Invalid bodies: they are refused with 400 after the limiter has counted them.
    const hit = (url: string, remoteAddress: string) => limited.inject({ method: "POST", url: `/api/v1${url}`, payload: {} as never, remoteAddress });
    try {
      const codes: number[] = [];
      for (const url of ["/auth/register", "/auth/register/parent", "/auth/register", "/auth/register/parent", "/auth/register"]) {
        codes.push((await hit(url, "10.9.0.1")).statusCode);
      }
      assert.deepEqual(codes, [400, 400, 400, 400, 400]);
      assert.equal((await hit("/auth/register/parent", "10.9.0.1")).statusCode, 429, "the sixth, on the other form, is refused");
      assert.equal((await hit("/auth/register", "10.9.0.1")).statusCode, 429);
      assert.equal((await hit("/auth/register", "10.9.0.2")).statusCode, 400, "another IP has its own count");
    } finally {
      await limited.close();
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

    // The family page knows the child is external: no school overview, no apology, only courses. A child
    // with a CRM link, added to the same parent, is a school child.
    const schoolRole = await prisma.role.findUniqueOrThrow({ where: { slug: "student" } });
    const schoolDigits = phone().replace(/\D/g, "");
    const schoolChild = await prisma.user.create({ data: {
      login: `fam_school_${suffix}`, phone: schoolDigits, phoneNormalized: schoolDigits, passwordHash: await bcrypt.hash("password-1234", 4),
      firstName: "Школьник", lastName: "Петрова", roleId: schoolRole.id, crmStudentId: `crm-fam-${suffix}`, externalLinkStatus: "linked",
    } });
    userIds.push(schoolChild.id);
    await prisma.parentStudentLink.create({ data: { parentUserId: parent.id, studentUserId: schoolChild.id, relationship: "guardian", createdById: parent.id } });
    const family = await call(data.token, "GET", "/parents/me/children");
    assert.equal(family.statusCode, 200, family.body);
    assert.deepEqual(
      family.json().data.map((item: { id: string; audience: string }) => [item.id, item.audience]),
      [[child.id, "external"], [schoolChild.id, "school"]],
    );
    const overview = await call(data.token, "GET", `/parents/me/children/${child.id}/offline-summary`);
    assert.equal(overview.statusCode, 200, overview.body);
    assert.equal(overview.json().data.child.audience, "external");
    assert.deepEqual(
      [overview.json().data.summary.crmUnavailable, overview.json().data.summary.crmStale, overview.json().data.summary.financialBalance, overview.json().data.summary.visits],
      [false, false, null, []],
    );
    assert.ok(!sent.some((item) => item.url.includes("/students/")), "the school was not asked about an external child");

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

  test("«Добавить ребёнка»: a parent adds another child with their own phone; the child is external; one lead per child names the parent", async () => {
    const parentPhone = phone();
    const answer = await registerParent({
      parent: { firstName: "Анна", lastName: "Второва", phone: parentPhone, password: "parent-pass-1" },
      child: { firstName: "Первый", lastName: "Второв", phone: phone(), password: "child-pass-12" },
    });
    assert.equal(answer.statusCode, 201, answer.body);
    const { token, user, child: first } = answer.json().data;
    userIds.push(user.id, first.id);
    await leads(1);
    await new Promise((resolve) => setTimeout(resolve, 80));
    sent.length = 0;

    const add = (payload: unknown, bearer = token) => app.inject({
      method: "POST", url: "/api/v1/parents/me/children", headers: { authorization: `Bearer ${bearer}` }, payload: payload as never,
    });
    const secondPhone = phone();
    const added = await add({ firstName: " Вторая ", lastName: "Второва", phone: secondPhone, password: "child-pass-34" });
    assert.equal(added.statusCode, 201, added.body);
    const second = added.json().data;
    userIds.push(second.id);
    assert.deepEqual([second.firstName, second.audience, second.relationship], ["Вторая", "external", "guardian"]);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: second.id }, include: { role: true } });
    assert.deepEqual([row.role.slug, row.crmStudentId, row.leagueEligible, row.phoneNormalized], ["student", null, false, secondPhone.replace(/\D/g, "")]);
    const family = await call(token, "GET", "/parents/me/children");
    assert.deepEqual(family.json().data.map((item: { id: string }) => item.id), [first.id, second.id], "both children, in the order they were added");

    // The new child signs in with their own phone and is an external student.
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { phone: secondPhone, password: "child-pass-34", profile: "student" } });
    assert.equal(login.statusCode, 200, login.body);
    assert.equal(login.json().data.user.audience, "external");

    // The lead is the child's own (CRM keeps one per child), with the parent to call.
    const [lead] = await leads(1);
    assert.deepEqual(lead.body, {
      requestType: "app_registration",
      externalSourceId: `app-registration:${second.id}`,
      name: "Анна",
      lastName: "Второва",
      phone: parentPhone.replace(/\D/g, ""),
      comment: `Ребёнок: Вторая Второва, телефон ${secondPhone.replace(/\D/g, "")}`,
    });
    assert.ok(await until(async () => (await pendingSince(second.id)) === null), "the lead went, the flag is cleared");

    // CRM down: the child keeps the flag, and the retry job sends the same lead with the parent.
    crmMode = "down";
    const thirdPhone = phone();
    const third = await add({ firstName: "Третий", lastName: "Второв", phone: thirdPhone, password: "child-pass-56" });
    assert.equal(third.statusCode, 201, third.body);
    const thirdId = third.json().data.id as string;
    userIds.push(thirdId);
    await leads(1);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.ok(await pendingSince(thirdId));
    crmMode = "ok";
    sent.length = 0;
    await prisma.user.update({ where: { id: thirdId }, data: { crmLeadPendingSince: minutesAgo(5) } });
    await retryPendingAppRegistrationLeads();
    const retried = sent.find((item) => item.body.externalSourceId === `app-registration:${thirdId}`);
    assert.ok(retried, "the job re-sent the added child's lead");
    assert.deepEqual([retried.body.name, retried.body.phone, retried.body.comment], ["Анна", parentPhone.replace(/\D/g, ""), `Ребёнок: Третий Второв, телефон ${thirdPhone.replace(/\D/g, "")}`]);
    assert.equal(await pendingSince(thirdId), null);
  });

  test("«Добавить ребёнка» refuses the parent's phone, a taken phone, a student and a sixth child; a refusal creates nothing", async () => {
    const parentPhone = phone();
    const answer = await registerParent({
      parent: { firstName: "Лимит", lastName: "Семья", phone: parentPhone, password: "parent-pass-1" },
      child: { firstName: "Ребёнок", lastName: "Один", phone: phone(), password: "child-pass-12" },
    });
    assert.equal(answer.statusCode, 201, answer.body);
    const { token, user, child } = answer.json().data;
    userIds.push(user.id, child.id);
    const add = (payload: unknown, bearer = token) => app.inject({
      method: "POST", url: "/api/v1/parents/me/children", headers: { authorization: `Bearer ${bearer}` }, payload: payload as never,
    });
    const person = (number: string, name = "Новый") => ({ firstName: name, lastName: "Семья", phone: number, password: "family-pass-1" });
    const links = () => prisma.parentStudentLink.count({ where: { parentUserId: user.id } });

    const same = await add(person(parentPhone.replace("+7", "8")));
    assert.equal(same.statusCode, 400, same.body);
    assert.equal(same.json().error.code, "CHILD_PHONE_SAME_AS_PARENT");
    const broken = await add(person("123-45"));
    assert.equal(broken.statusCode, 400, "a broken phone is a 400");
    const firstChildPhone = (await prisma.user.findUniqueOrThrow({ where: { id: child.id } })).phone;
    const busy = await add(person(firstChildPhone));
    assert.equal(busy.statusCode, 409, busy.body);
    assert.equal(busy.json().error.code, "PHONE_ALREADY_REGISTERED");
    assert.doesNotMatch(busy.json().error.message, /Войдите/, "the parent is signed in already");
    const short = await add({ firstName: "Без", lastName: "Пароля", phone: phone(), password: "short" });
    assert.equal(short.statusCode, 400, short.body);
    assert.equal(await links(), 1, "refusals create no child");

    // A student cannot add children.
    const studentLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { phone: firstChildPhone, password: "child-pass-12", profile: "student" } });
    const studentToken = studentLogin.json().data.token as string;
    assert.equal((await add(person(phone()), studentToken)).statusCode, 403);

    // Five children that the parent made themselves (the registration counts); the sixth is refused.
    for (let index = 2; index <= 5; index += 1) {
      const next = await add(person(phone(), `Ребёнок${index}`));
      assert.equal(next.statusCode, 201, next.body);
      userIds.push(next.json().data.id);
    }
    const sixthPhone = phone();
    const sixth = await add(person(sixthPhone));
    assert.equal(sixth.statusCode, 409, sixth.body);
    assert.equal(sixth.json().error.code, "CHILD_LIMIT_REACHED");
    assert.equal(await prisma.user.count({ where: { phoneNormalized: sixthPhone.replace(/\D/g, "") } }), 0);
    assert.equal(await links(), 5);

    // A child the school unlinked frees the place.
    const anyAdded = await prisma.parentStudentLink.findFirstOrThrow({ where: { parentUserId: user.id, studentUserId: { not: child.id } } });
    await prisma.parentStudentLink.update({ where: { id: anyAdded.id }, data: { isActive: false, revokedAt: new Date() } });
    const again = await add(person(phone(), "Снова"));
    assert.equal(again.statusCode, 201, again.body);
    userIds.push(again.json().data.id);
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
