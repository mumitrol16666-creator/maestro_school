import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Stage 4, step 3: «Я оплатил», the decisions of the administrator, access by hand, payment details,
// the table for Excel and the message to Telegram — over HTTP and PostgreSQL. The new economy is off
// here (see course-completion-points.db.test.ts for it).
if (!process.env.TEST_DATABASE_URL) {
  test("course payments HTTP + PostgreSQL", { skip: "TEST_DATABASE_URL required" }, () => {});
} else {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && /test|qa/.test(url.pathname));
  Object.assign(process.env, {
    DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: "test",
    CRM_SESSION_CACHE_TTL_MS: "0", CRM_SESSION_STALE_MAX_AGE_MS: "0",
    JWT_SECRET: "course-payments-test-secret", INTEGRATION_SERVICE_SECRET: "course-payments-integration-secret",
    INTEGRATION_SSO_SECRET: "course-payments-bridge-secret", CRM_API_URL: "http://127.0.0.1:9",
    APP_PUBLIC_URL: "https://app.test.maestro.kz",
  });
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  const { default: Fastify } = await import("fastify");
  const { default: fastifyJwt } = await import("@fastify/jwt");
  const { default: multipart } = await import("@fastify/multipart");
  const { default: bcrypt } = await import("bcryptjs");
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { authRoutes } = await import("./auth.routes.js");
  const { catalogRoutes } = await import("./catalog.routes.js");
  const { learningRoutes } = await import("./learning.routes.js");
  const { homeworkRoutes } = await import("./homework.routes.js");
  const { coursePaymentsRoutes } = await import("./course-payments.routes.js");
  const { errorHandler } = await import("../middleware/error-handler.js");
  const { getCourseAccessState, getLessonAccess } = await import("../../application/services/course-access.service.js");
  const { createPaymentRequest } = await import("../../application/services/course-payment.service.js");
  const { addCalendarMonths, paidAccessExpiry } = await import("../../domain/course-payments.js");

  const STUDENT_PERMISSIONS = ["courses.read", "lessons.read", "progress.read", "progress.write", "homework.submit"];
  const app = Fastify();
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const requestIds: string[] = [];
  let directionId = "";
  let adminToken = "";
  let admin: { id: string; login: string | null };
  let staff: { id: string; login: string | null };
  let originalSettings: Awaited<ReturnType<typeof prisma.coursePaymentSettings.findUnique>> = null;

  async function role(slug: string, permissions: string[], custom = false) {
    const row = await prisma.role.upsert({ where: { slug }, create: { slug, name: slug }, update: {} });
    if (custom) roleIds.push(row.id);
    for (const code of permissions) {
      const permission = await prisma.permission.upsert({ where: { code }, create: { code }, update: {} });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: row.id, permissionId: permission.id } },
        create: { roleId: row.id, permissionId: permission.id }, update: {},
      });
    }
    return row;
  }
  async function makeUser(
    slug: string,
    permissions: string[],
    options: { crmStudentId?: string | null; firstName?: string; lastName?: string; phone?: string; custom?: boolean } = {},
  ) {
    const roleRow = await role(slug, permissions, options.custom);
    const user = await prisma.user.create({ data: {
      login: `cp_${slug}_${randomUUID().slice(0, 8)}`.slice(0, 60), phone: options.phone ?? randomUUID().slice(0, 20),
      passwordHash: await bcrypt.hash("payment-password", 4),
      firstName: options.firstName ?? "Оплата", lastName: options.lastName ?? slug, roleId: roleRow.id,
      crmStudentId: options.crmStudentId ?? null,
    } });
    userIds.push(user.id);
    return user;
  }
  const makeStudent = (options: Parameters<typeof makeUser>[2] = {}) => makeUser("student", STUDENT_PERMISSIONS, options);
  const makeParent = (options: Parameters<typeof makeUser>[2] = {}) => makeUser("parent", ["family.read", "courses.read"], options);
  async function linkParent(parentId: string, studentId: string, isActive = true) {
    return prisma.parentStudentLink.create({ data: { parentUserId: parentId, studentUserId: studentId, isActive } });
  }
  async function login(user: { login: string | null }) {
    const response = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { phone: user.login, password: "payment-password" } });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().data.token as string;
  }
  /**
   * A payer always sends the price on the screen. The helper adds the current price of the course in
   * the path to a request body that does not name one, so most tests need not repeat it; pass
   * `expectedPriceKzt` (even `undefined`) to send exactly that.
   */
  async function call(token: string | null, method: "GET" | "POST" | "PUT", path: string, payload?: unknown) {
    let body = payload;
    const target = /\/courses\/([0-9a-f-]{36})\/payment-requests$/.exec(path);
    if (method === "POST" && target && body && typeof body === "object" && !("expectedPriceKzt" in body)) {
      const course = await prisma.course.findUnique({ where: { id: target[1] }, select: { priceKzt: true } });
      body = { ...body, expectedPriceKzt: course?.priceKzt ?? 1 };
    }
    return app.inject({
      method, url: `/api/v1${path}`, payload: body as never,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }
  const adminCall = (method: "GET" | "POST" | "PUT", path: string, payload?: unknown) => call(adminToken, method, path, payload);

  /** Three lessons in one module; the first two are the free ones. */
  async function makeCourse(terms: { priceKzt: number | null; includedInSchool?: boolean; isPublished?: boolean; title?: string; coinsReward?: number }) {
    const course = await prisma.course.create({ data: {
      directionId, title: terms.title ?? `Курс ${suffix} ${randomUUID().slice(0, 4)}`, isPublished: terms.isPublished ?? true,
      priceKzt: terms.priceKzt, includedInSchool: terms.includedInSchool ?? false, completionCoinsReward: terms.coinsReward ?? 0,
    } });
    const module = await prisma.courseModule.create({ data: { courseId: course.id, title: "Модуль 1", sortOrder: 1 } });
    const lessons = [];
    for (const index of [1, 2, 3]) {
      lessons.push(await prisma.lesson.create({ data: { moduleId: module.id, title: `Урок ${index}`, sortOrder: index, isPublished: true } }));
    }
    return { course, lessons };
  }
  const requestOf = async (id: string) => {
    requestIds.push(id);
    return prisma.coursePaymentRequest.findUniqueOrThrow({ where: { id } });
  };
  /** A pending request made through the API; returns its id. */
  async function ask(token: string, courseId: string, payerNote?: string) {
    const response = await call(token, "POST", `/courses/${courseId}/payment-requests`, payerNote ? { payerNote } : {});
    assert.equal(response.statusCode, 201, response.body);
    requestIds.push(response.json().data.id);
    return response.json().data.id as string;
  }
  const notifications = (userId: string, type: string) => prisma.userNotification.findMany({ where: { userId, type: type as never }, orderBy: { createdAt: "asc" } });
  const eventsOf = async (entityId: string) => (await prisma.auditLog.findMany({ where: { entityId }, orderBy: { createdAt: "asc" } }))
    .map((row) => (row.payload as { event?: string } | null)?.event ?? row.action);

  /** Small CSV reader: `;`, quoted cells with doubled quotes. */
  function parseCsv(text: string) {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; } else if (char === '"') quoted = false; else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === ";") { row.push(cell); cell = ""; }
      else if (char === "\r") { /* CRLF */ }
      else if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += char;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  test.before(async () => {
    await app.register(fastifyJwt, { secret: process.env.JWT_SECRET!, sign: { expiresIn: "7d" } });
    await app.register(multipart, { limits: { fileSize: 1024 * 1024, files: 1 } });
    app.setErrorHandler(errorHandler);
    for (const plugin of [authRoutes, catalogRoutes, learningRoutes, homeworkRoutes, coursePaymentsRoutes]) {
      await app.register(plugin, { prefix: "/api/v1" });
    }
    await app.ready();
    const direction = await prisma.direction.create({ data: { title: `Оплата ${suffix}`, slug: `course-payments-${suffix}`, isPublished: true } });
    directionId = direction.id;
    originalSettings = await prisma.coursePaymentSettings.findUnique({ where: { id: 1 } });
    admin = await makeUser(`cp_admin_${suffix}`, ["course_payments.manage", "courses.read"], { custom: true, firstName: "Админ", lastName: "Оплат" });
    staff = await makeUser(`cp_staff_${suffix}`, ["users.manage", "courses.read", "catalog.manage"], { custom: true, firstName: "Без", lastName: "Права" });
    adminToken = await login(admin);
  });

  test.after(async () => {
    await app.close();
    const dedupe = requestIds.map((id) => ({ dedupeKey: { contains: id } }));
    if (dedupe.length) await prisma.userNotification.deleteMany({ where: { OR: dedupe } });
    await prisma.userNotification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: requestIds } }] } });
    await prisma.leagueXpEvent.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.pointsTransaction.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.maestroCoinTransaction.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.studentCoinBalance.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.homeworkSubmission.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.lessonProgress.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.studentCourse.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.courseAccess.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.coursePaymentRequest.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.parentStudentLink.deleteMany({ where: { OR: [{ parentUserId: { in: userIds } }, { studentUserId: { in: userIds } }] } });
    if (directionId) await prisma.course.deleteMany({ where: { directionId } });
    await prisma.coursePaymentSettings.deleteMany({});
    if (originalSettings) await prisma.coursePaymentSettings.create({ data: { ...originalSettings, updatedById: null } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    if (directionId) await prisma.direction.delete({ where: { id: directionId } });
    await prisma.$disconnect();
  });

  // ── The student ───────────────────────────────────────────────────────────────

  test("«Я оплатил» takes the price of the moment; a second press is a 409, one after another and at once", async () => {
    const { course } = await makeCourse({ priceKzt: 15000 });
    const student = await makeStudent();
    const token = await login(student);

    const before = (await call(token, "GET", `/courses/${course.id}/access`)).json().data;
    assert.deepEqual([before.canRequestPayment, before.blockedBy, before.lastRequest, before.access.kind], [true, null, null, "none"]);
    assert.equal(before.course.priceKzt, 15000);
    assert.deepEqual(Object.keys(before.paymentDetails).sort(), ["configured", "hint", "kaspiPayUrl", "recipientName", "transferPhone"]);

    const created = await call(token, "POST", `/courses/${course.id}/payment-requests`, { payerNote: "Перевёл с Kaspi" });
    assert.equal(created.statusCode, 201, created.body);
    requestIds.push(created.json().data.id);
    assert.deepEqual(
      [created.json().data.amountKzt, created.json().data.status, created.json().data.paidBy, created.json().data.payerNote],
      [15000, "pending", "student", "Перевёл с Kaspi"],
    );

    // The price rises after the request: the request keeps what the student saw.
    await prisma.course.update({ where: { id: course.id }, data: { priceKzt: 20000 } });
    const second = await call(token, "POST", `/courses/${course.id}/payment-requests`, {});
    assert.equal(second.statusCode, 409);
    assert.equal(second.json().error.code, "PAYMENT_REQUEST_PENDING");
    assert.equal((await requestOf(created.json().data.id)).amountKzt, 15000);
    assert.equal(await prisma.coursePaymentRequest.count({ where: { studentId: student.id, courseId: course.id } }), 1);

    const view = (await call(token, "GET", `/courses/${course.id}/access`)).json().data;
    assert.deepEqual([view.canRequestPayment, view.blockedBy, view.lastRequest.id, view.lastRequest.amountKzt], [false, "pending", created.json().data.id, 15000]);
    assert.equal(view.course.priceKzt, 20000, "the card shows today's price, the request the old one");
    const mine = (await call(token, "GET", "/students/me/course-payment-requests")).json().data;
    assert.deepEqual(mine.map((item: { amountKzt: number }) => item.amountKzt), [15000]);

    // Eight presses at once, on a fresh pair: the unique index lets exactly one in.
    const racer = await makeStudent();
    const racerToken = await login(racer);
    const answers = await Promise.all(Array.from({ length: 8 }, () => call(racerToken, "POST", `/courses/${course.id}/payment-requests`, {})));
    const codes = answers.map((answer) => answer.statusCode).sort();
    assert.deepEqual(codes, [201, 409, 409, 409, 409, 409, 409, 409]);
    for (const answer of answers.filter((item) => item.statusCode === 409)) {
      assert.equal(answer.json().error.code, "PAYMENT_REQUEST_PENDING");
    }
    assert.equal(await prisma.coursePaymentRequest.count({ where: { studentId: racer.id, status: "pending" } }), 1);
    for (const answer of answers.filter((item) => item.statusCode === 201)) requestIds.push(answer.json().data.id);
  });

  test("a course with no price, a hidden or missing course, and a course the school already includes refuse a request", async () => {
    const free = await makeCourse({ priceKzt: null });
    const hidden = await makeCourse({ priceKzt: 9000, isPublished: false });
    const included = await makeCourse({ priceKzt: 9000, includedInSchool: true });
    const external = await makeStudent();
    const school = await makeStudent({ crmStudentId: `crm-cp-${suffix}` });
    const externalToken = await login(external);
    const schoolToken = await login(school);

    const notForSale = await call(externalToken, "POST", `/courses/${free.course.id}/payment-requests`, {});
    assert.equal(notForSale.statusCode, 409);
    assert.equal(notForSale.json().error.code, "COURSE_NOT_FOR_SALE");
    const freeView = (await call(externalToken, "GET", `/courses/${free.course.id}/access`)).json().data;
    assert.deepEqual([freeView.canRequestPayment, freeView.blockedBy, freeView.access.fullAccess], [false, "not_for_sale", true]);

    assert.equal((await call(externalToken, "POST", `/courses/${hidden.course.id}/payment-requests`, {})).statusCode, 404);
    assert.equal((await call(externalToken, "GET", `/courses/${hidden.course.id}/access`)).statusCode, 404, "the price of a hidden course is not shown");
    assert.equal((await call(externalToken, "POST", `/courses/${randomUUID()}/payment-requests`, {})).statusCode, 404);
    assert.equal((await call(externalToken, "POST", `/courses/${included.course.id}/payment-requests`, { payerNote: 5 })).statusCode, 400);

    const alreadyOpen = await call(schoolToken, "POST", `/courses/${included.course.id}/payment-requests`, {});
    assert.equal(alreadyOpen.statusCode, 409);
    assert.equal(alreadyOpen.json().error.code, "COURSE_ALREADY_OPEN");
    assert.equal((await call(schoolToken, "GET", `/courses/${included.course.id}/access`)).json().data.blockedBy, "school");
    // The same course is paid for by a person from outside, and a school student pays for a course the school does not include.
    await ask(externalToken, included.course.id);
    const plain = await makeCourse({ priceKzt: 9000 });
    await ask(schoolToken, plain.course.id);
    assert.equal(await prisma.coursePaymentRequest.count({ where: { courseId: free.course.id } }), 0);
  });

  // ── The parent ────────────────────────────────────────────────────────────────

  test("a parent pays for their own child; a stranger's child, a revoked link and the wrong role are refused", async () => {
    const { course } = await makeCourse({ priceKzt: 12000 });
    const child = await makeStudent({ firstName: "Ребёнок", lastName: "Первый" });
    const strangerChild = await makeStudent();
    const parent = await makeParent({ firstName: "Анна", lastName: "Родителева" });
    const stranger = await makeParent();
    await linkParent(parent.id, child.id);
    await linkParent(stranger.id, strangerChild.id);
    const parentToken = await login(parent);
    const childToken = await login(child);

    const list = await call(parentToken, "GET", `/parents/me/children/${child.id}/courses`);
    assert.equal(list.statusCode, 200, list.body);
    const card = list.json().data.find((item: { id: string }) => item.id === course.id);
    assert.deepEqual([card.priceKzt, card.access.kind, card.access.forSale], [12000, "none", true]);
    const access = await call(parentToken, "GET", `/parents/me/children/${child.id}/courses/${course.id}/access`);
    assert.equal(access.statusCode, 200);
    assert.deepEqual([access.json().data.canRequestPayment, access.json().data.course.priceKzt], [true, 12000]);

    // A stranger's child: 404 on all three routes, and nothing is stored.
    for (const [method, path] of [
      ["GET", `/parents/me/children/${strangerChild.id}/courses`],
      ["GET", `/parents/me/children/${strangerChild.id}/courses/${course.id}/access`],
      ["POST", `/parents/me/children/${strangerChild.id}/courses/${course.id}/payment-requests`],
    ] as const) {
      const response = await call(parentToken, method, path, method === "POST" ? {} : undefined);
      assert.equal(response.statusCode, 404, `${method} ${path}`);
    }
    assert.equal(await prisma.coursePaymentRequest.count({ where: { studentId: strangerChild.id } }), 0);

    const paid = await call(parentToken, "POST", `/parents/me/children/${child.id}/courses/${course.id}/payment-requests`, { payerNote: "Оплатила мама" });
    assert.equal(paid.statusCode, 201, paid.body);
    requestIds.push(paid.json().data.id);
    const stored = await requestOf(paid.json().data.id);
    assert.deepEqual([stored.studentId, stored.payerUserId, stored.amountKzt], [child.id, parent.id, 12000]);
    assert.equal(paid.json().data.paidBy, "parent");
    const childSees = (await call(childToken, "GET", `/courses/${course.id}/access`)).json().data;
    assert.deepEqual([childSees.blockedBy, childSees.lastRequest.paidBy, childSees.lastRequest.paidByViewer], ["pending", "parent", false]);
    const parentSees = (await call(parentToken, "GET", `/parents/me/children/${child.id}/courses/${course.id}/access`)).json().data;
    assert.deepEqual([parentSees.blockedBy, parentSees.lastRequest.paidByViewer], ["pending", true]);

    // The child presses too: the same pending request holds, the second one is a 409.
    const again = await call(childToken, "POST", `/courses/${course.id}/payment-requests`, {});
    assert.equal(again.statusCode, 409);
    assert.equal(again.json().error.code, "PAYMENT_REQUEST_PENDING");

    // Wrong roles.
    assert.equal((await call(childToken, "GET", `/parents/me/children/${child.id}/courses`)).statusCode, 403);
    assert.equal((await call(parentToken, "POST", `/courses/${course.id}/payment-requests`, {})).statusCode, 403);
    assert.equal((await call(parentToken, "GET", `/courses/${course.id}/access`)).statusCode, 403);
    assert.equal((await call(null, "GET", `/parents/me/children/${child.id}/courses`)).statusCode, 401);

    // A revoked link is as good as none.
    await prisma.parentStudentLink.updateMany({ where: { parentUserId: parent.id, studentUserId: child.id }, data: { isActive: false } });
    assert.equal((await call(parentToken, "POST", `/parents/me/children/${child.id}/courses/${course.id}/payment-requests`, {})).statusCode, 404);
  });

  test("a parent and the child pressing at the same moment make one request", async () => {
    const { course } = await makeCourse({ priceKzt: 12000 });
    const child = await makeStudent();
    const parent = await makeParent();
    await linkParent(parent.id, child.id);
    const [parentToken, childToken] = [await login(parent), await login(child)];
    const [fromParent, fromChild] = await Promise.all([
      call(parentToken, "POST", `/parents/me/children/${child.id}/courses/${course.id}/payment-requests`, {}),
      call(childToken, "POST", `/courses/${course.id}/payment-requests`, {}),
    ]);
    assert.deepEqual([fromParent.statusCode, fromChild.statusCode].sort(), [201, 409]);
    const loser = fromParent.statusCode === 409 ? fromParent : fromChild;
    assert.equal(loser.json().error.code, "PAYMENT_REQUEST_PENDING");
    assert.equal(await prisma.coursePaymentRequest.count({ where: { studentId: child.id, courseId: course.id } }), 1);
    const winner = fromParent.statusCode === 201 ? fromParent : fromChild;
    requestIds.push(winner.json().data.id);
  });

  // ── The administrator ─────────────────────────────────────────────────────────

  test("confirm opens six months of access once, at the boundary exactly; later decisions are 409", async () => {
    const { course, lessons } = await makeCourse({ priceKzt: 15000 });
    const student = await makeStudent({ firstName: "Иван", lastName: "Подтверждённый", phone: `+7701${suffix.replace(/\D/g, "1").padEnd(7, "1").slice(0, 7)}` });
    const token = await login(student);
    const requestId = await ask(token, course.id);

    assert.equal((await getLessonAccess(student.id, lessons[2].id)).open, false);
    const queue = await adminCall("GET", `/admin/course-payments/requests?status=pending&courseId=${course.id}`);
    assert.equal(queue.statusCode, 200, queue.body);
    assert.equal(queue.json().meta.total, 1);
    const item = queue.json().data[0];
    assert.deepEqual(
      [item.id, item.amountKzt, item.student.name, item.student.linkedToSchool, item.payer.isStudent, item.course.title === course.title, item.repeatPurchase],
      [requestId, 15000, "Подтверждённый Иван", false, true, true, null],
    );
    const pending = await adminCall("GET", "/admin/course-payments/requests/pending-count");
    assert.equal(pending.json().data.count, await prisma.coursePaymentRequest.count({ where: { status: "pending" } }));
    const adminNotes = await notifications(admin.id, "course_payment_requested");
    const note = adminNotes.find((entry) => entry.url?.includes(requestId));
    assert.ok(note, "the administrator is told in the app");
    assert.match(note.body, /Иван Подтверждённый/);
    assert.match(note.body, /15 000 ₸/);

    const confirmed = await adminCall("POST", `/admin/course-payments/requests/${requestId}/confirm`, { note: "Видел перевод" });
    assert.equal(confirmed.statusCode, 200, confirmed.body);
    assert.deepEqual([confirmed.json().data.status, confirmed.json().data.displayStatus, confirmed.json().data.decidedBy.id], ["confirmed", "confirmed", admin.id]);
    const stored = await requestOf(requestId);
    const access = await prisma.courseAccess.findUniqueOrThrow({ where: { paymentRequestId: requestId } });
    assert.deepEqual([access.source, access.studentId, access.courseId, access.grantedById], ["payment", student.id, course.id, admin.id]);
    assert.equal(access.startsAt.getTime(), stored.decidedAt!.getTime());
    assert.equal(access.expiresAt.getTime(), addCalendarMonths(access.startsAt, 6).getTime());
    assert.equal(access.expiresAt.getTime(), paidAccessExpiry(access.startsAt).getTime());
    assert.equal((await getLessonAccess(student.id, lessons[2].id)).open, true);

    // The border: one millisecond before the end the course is open, at the end it is closed.
    const lastMoment = new Date(access.expiresAt.getTime() - 1);
    assert.equal((await getCourseAccessState(student.id, course.id, lastMoment)).kind, "paid");
    assert.equal((await getLessonAccess(student.id, lessons[2].id, lastMoment)).open, true);
    assert.equal((await getCourseAccessState(student.id, course.id, access.expiresAt)).kind, "none");
    assert.equal((await getLessonAccess(student.id, lessons[2].id, access.expiresAt)).open, false);

    // The student is told.
    const told = (await notifications(student.id, "course_access_granted")).find((entry) => entry.dedupeKey?.includes(requestId));
    assert.ok(told);
    assert.match(told.body, /открыт до/);

    // A second confirmation, a rejection and a refund of a request in the wrong state are refused.
    const twice = await adminCall("POST", `/admin/course-payments/requests/${requestId}/confirm`, {});
    assert.equal(twice.statusCode, 409);
    assert.equal(twice.json().error.code, "PAYMENT_REQUEST_NOT_PENDING");
    assert.equal((await adminCall("POST", `/admin/course-payments/requests/${requestId}/reject`, { note: "Поздно" })).statusCode, 409);
    assert.equal(await prisma.courseAccess.count({ where: { paymentRequestId: requestId } }), 1);
    assert.deepEqual(await eventsOf(requestId), ["requested", "confirmed"]);
    assert.equal((await adminCall("POST", `/admin/course-payments/requests/${randomUUID()}/confirm`, {})).statusCode, 404);
  });

  test("two administrators confirming at once: one wins, one access, one entry in the log", async () => {
    const { course } = await makeCourse({ priceKzt: 15000 });
    const student = await makeStudent();
    const requestId = await ask(await login(student), course.id);
    const second = await makeUser(`cp_admin_${suffix}`, ["course_payments.manage"], { custom: true });
    const secondToken = await login(second);
    const answers = await Promise.all([
      adminCall("POST", `/admin/course-payments/requests/${requestId}/confirm`, {}),
      call(secondToken, "POST", `/admin/course-payments/requests/${requestId}/confirm`, {}),
      adminCall("POST", `/admin/course-payments/requests/${requestId}/confirm`, {}),
    ]);
    assert.deepEqual(answers.map((answer) => answer.statusCode).sort(), [200, 409, 409]);
    assert.equal(await prisma.courseAccess.count({ where: { studentId: student.id, courseId: course.id } }), 1);
    assert.deepEqual(await eventsOf(requestId), ["requested", "confirmed"]);

    // A confirm racing a rejection: exactly one decision stands, and access exists only if it was the confirm.
    const rival = await makeStudent();
    const rivalRequest = await ask(await login(rival), course.id);
    const decisions = await Promise.all([
      adminCall("POST", `/admin/course-payments/requests/${rivalRequest}/confirm`, {}),
      adminCall("POST", `/admin/course-payments/requests/${rivalRequest}/reject`, { note: "Нет перевода" }),
    ]);
    assert.deepEqual(decisions.map((answer) => answer.statusCode).sort(), [200, 409]);
    const final = await requestOf(rivalRequest);
    assert.equal(await prisma.courseAccess.count({ where: { paymentRequestId: rivalRequest } }), final.status === "confirmed" ? 1 : 0);
  });

  test("a rejection needs a reason, tells the student why, and the student may ask again; a rejected request cannot be confirmed or refunded", async () => {
    const { course } = await makeCourse({ priceKzt: 15000 });
    const child = await makeStudent();
    const parent = await makeParent();
    await linkParent(parent.id, child.id);
    const [childToken, parentToken] = [await login(child), await login(parent)];
    const paid = await call(parentToken, "POST", `/parents/me/children/${child.id}/courses/${course.id}/payment-requests`, {});
    assert.equal(paid.statusCode, 201);
    const requestId = paid.json().data.id as string;
    requestIds.push(requestId);

    for (const body of [{}, { note: "" }, { note: "да" }]) {
      assert.equal((await adminCall("POST", `/admin/course-payments/requests/${requestId}/reject`, body)).statusCode, 400, JSON.stringify(body));
    }
    assert.equal((await requestOf(requestId)).status, "pending");

    const rejected = await adminCall("POST", `/admin/course-payments/requests/${requestId}/reject`, { note: "Перевод на другую сумму" });
    assert.equal(rejected.statusCode, 200, rejected.body);
    assert.equal(rejected.json().data.displayStatus, "rejected");
    assert.equal(await prisma.courseAccess.count({ where: { studentId: child.id } }), 0);

    // The child and the parent who paid both hear the reason.
    for (const user of [child, parent]) {
      const told = (await notifications(user.id, "course_payment_rejected")).find((entry) => entry.dedupeKey?.includes(requestId));
      assert.ok(told, `notification for ${user.login}`);
      assert.match(told.body, /Перевод на другую сумму/);
    }
    const childView = (await call(childToken, "GET", `/courses/${course.id}/access`)).json().data;
    assert.deepEqual([childView.lastRequest.displayStatus, childView.lastRequest.rejectionReason, childView.canRequestPayment], ["rejected", "Перевод на другую сумму", true]);

    // Wrong order: a rejected request is final.
    const lateConfirm = await adminCall("POST", `/admin/course-payments/requests/${requestId}/confirm`, {});
    assert.equal(lateConfirm.statusCode, 409);
    assert.equal(lateConfirm.json().error.code, "PAYMENT_REQUEST_NOT_PENDING");
    const lateRefund = await adminCall("POST", `/admin/course-payments/requests/${requestId}/refund`, {});
    assert.equal(lateRefund.statusCode, 409);
    assert.equal(lateRefund.json().error.code, "PAYMENT_NOT_REFUNDABLE");
    assert.equal(await prisma.courseAccess.count({ where: { studentId: child.id } }), 0);

    // A new payment is a new request.
    const retry = await ask(childToken, course.id);
    assert.notEqual(retry, requestId);
    assert.equal((await adminCall("POST", `/admin/course-payments/requests/${retry}/confirm`, {})).statusCode, 200);
  });

  test("a refund closes the access the payment opened, once, and leaves Points and progress alone", async () => {
    const { course, lessons } = await makeCourse({ priceKzt: 15000 });
    const child = await makeStudent();
    const parent = await makeParent();
    await linkParent(parent.id, child.id);
    const parentToken = await login(parent);
    const paid = await call(parentToken, "POST", `/parents/me/children/${child.id}/courses/${course.id}/payment-requests`, {});
    const requestId = paid.json().data.id as string;
    requestIds.push(requestId);

    // A refund before the decision is not possible.
    const early = await adminCall("POST", `/admin/course-payments/requests/${requestId}/refund`, {});
    assert.equal(early.statusCode, 409);
    assert.equal(early.json().error.code, "PAYMENT_NOT_REFUNDABLE");

    await adminCall("POST", `/admin/course-payments/requests/${requestId}/confirm`, {});
    // Studies happened and earned Points; neither is taken back.
    const award = await prisma.pointsTransaction.create({ data: {
      studentId: child.id, amount: 250, reason: "За курс", sourceKey: `course-completion:${course.id}:${child.id}`,
    } });
    await prisma.lessonProgress.create({ data: { studentId: child.id, lessonId: lessons[0].id, status: "completed", completedAt: new Date() } });
    assert.equal((await getLessonAccess(child.id, lessons[2].id)).open, true);

    const refunded = await adminCall("POST", `/admin/course-payments/requests/${requestId}/refund`, { note: "Передумали" });
    assert.equal(refunded.statusCode, 200, refunded.body);
    assert.deepEqual([refunded.json().data.status, refunded.json().data.displayStatus, refunded.json().data.refundNote, refunded.json().data.refundedBy.id], ["confirmed", "refunded", "Передумали", admin.id]);
    const access = await prisma.courseAccess.findUniqueOrThrow({ where: { paymentRequestId: requestId } });
    assert.deepEqual([access.revokeReason, access.revokedById, access.revokeNote], ["refund", admin.id, "Передумали"]);
    assert.ok(access.revokedAt);
    assert.equal((await getLessonAccess(child.id, lessons[2].id)).open, false, "the lessons close again");
    assert.equal((await prisma.pointsTransaction.findUniqueOrThrow({ where: { id: award.id } })).amount, 250);
    assert.equal(await prisma.pointsTransaction.count({ where: { studentId: child.id } }), 1, "no correction row");
    assert.equal((await prisma.lessonProgress.count({ where: { studentId: child.id, status: "completed" } })), 1);

    // Twice, and a confirmation after the refund, are refused.
    const again = await adminCall("POST", `/admin/course-payments/requests/${requestId}/refund`, {});
    assert.equal(again.statusCode, 409);
    assert.equal(again.json().error.code, "PAYMENT_NOT_REFUNDABLE");
    assert.equal((await adminCall("POST", `/admin/course-payments/requests/${requestId}/confirm`, {})).statusCode, 409);
    assert.equal((await adminCall("POST", `/admin/course-payments/requests/${randomUUID()}/refund`, {})).statusCode, 404);

    for (const user of [child, parent]) {
      const told = (await notifications(user.id, "course_access_revoked")).find((entry) => entry.dedupeKey?.includes(requestId));
      assert.ok(told, `notification for ${user.login}`);
    }
    assert.deepEqual(await eventsOf(requestId), ["requested", "confirmed", "refunded"]);

    // Two refunds at once: one wins.
    const second = await makeStudent();
    const secondRequest = await ask(await login(second), course.id);
    await adminCall("POST", `/admin/course-payments/requests/${secondRequest}/confirm`, {});
    const answers = await Promise.all([
      adminCall("POST", `/admin/course-payments/requests/${secondRequest}/refund`, {}),
      adminCall("POST", `/admin/course-payments/requests/${secondRequest}/refund`, {}),
    ]);
    assert.deepEqual(answers.map((answer) => answer.statusCode).sort(), [200, 409]);

    // The student may buy the course again after a refund.
    assert.equal((await call(await login(second), "POST", `/courses/${course.id}/payment-requests`, {})).statusCode, 201);
  });

  test("buying again while access runs is allowed and the administrator is warned; the new payment is a second access, not an extension", async () => {
    const { course } = await makeCourse({ priceKzt: 15000 });
    const student = await makeStudent();
    const token = await login(student);
    const first = await ask(token, course.id);
    await adminCall("POST", `/admin/course-payments/requests/${first}/confirm`, {});
    const firstAccess = await prisma.courseAccess.findUniqueOrThrow({ where: { paymentRequestId: first } });

    const view = (await call(token, "GET", `/courses/${course.id}/access`)).json().data;
    assert.deepEqual([view.access.kind, view.canRequestPayment], ["paid", true]);
    const second = await ask(token, course.id);
    const queue = await adminCall("GET", `/admin/course-payments/requests?status=pending&courseId=${course.id}`);
    const warning = queue.json().data.find((entry: { id: string }) => entry.id === second).repeatPurchase;
    assert.equal(new Date(warning.currentExpiresAt).getTime(), firstAccess.expiresAt.getTime());
    assert.equal(warning.source, "payment");

    await adminCall("POST", `/admin/course-payments/requests/${second}/confirm`, {});
    assert.equal(await prisma.courseAccess.count({ where: { studentId: student.id, courseId: course.id } }), 2);
    const state = await getCourseAccessState(student.id, course.id);
    const secondAccess = await prisma.courseAccess.findUniqueOrThrow({ where: { paymentRequestId: second } });
    assert.equal(state.expiresAt!.getTime(), secondAccess.expiresAt.getTime(), "the later end counts");
    assert.ok(secondAccess.startsAt.getTime() >= firstAccess.startsAt.getTime());

    // Refunding the first payment leaves the second access running.
    await adminCall("POST", `/admin/course-payments/requests/${first}/refund`, {});
    assert.equal((await getCourseAccessState(student.id, course.id)).kind, "paid");
  });

  test("an administrator without the right, a student, a parent and a guest cannot touch any of it", async () => {
    const { course } = await makeCourse({ priceKzt: 15000 });
    const student = await makeStudent();
    const requestId = await ask(await login(student), course.id);
    const accessId = (await prisma.courseAccess.create({ data: {
      studentId: student.id, courseId: course.id, source: "admin_grant", startsAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000),
    } })).id;
    const staffToken = await login(staff);
    const parentToken = await login(await makeParent());
    const studentToken = await login(student);

    const routes: Array<[("GET" | "POST" | "PUT"), string, unknown]> = [
      ["GET", "/admin/course-payments/requests", undefined],
      ["GET", "/admin/course-payments/requests/pending-count", undefined],
      ["GET", "/admin/course-payments/requests/export.csv", undefined],
      ["GET", `/admin/course-payments/requests/${requestId}`, undefined],
      ["POST", `/admin/course-payments/requests/${requestId}/confirm`, {}],
      ["POST", `/admin/course-payments/requests/${requestId}/reject`, { note: "Нет перевода" }],
      ["POST", `/admin/course-payments/requests/${requestId}/refund`, {}],
      ["GET", `/admin/students/${student.id}/course-access`, undefined],
      ["POST", `/admin/students/${student.id}/course-access`, { courseId: course.id, note: "Подарок" }],
      ["POST", `/admin/course-access/${accessId}/revoke`, {}],
      ["GET", "/admin/course-payments/settings", undefined],
      ["PUT", "/admin/course-payments/settings", { kaspiPayUrl: "https://pay.kaspi.kz/x" }],
    ];
    for (const [method, path, payload] of routes) {
      for (const [who, token] of [["staff", staffToken], ["parent", parentToken], ["student", studentToken]] as const) {
        const response = await call(token, method, path, payload);
        assert.equal(response.statusCode, 403, `${who} ${method} ${path}: ${response.body}`);
      }
      assert.equal((await call(null, method, path, payload)).statusCode, 401, `guest ${method} ${path}`);
    }
    assert.equal((await requestOf(requestId)).status, "pending");
    assert.equal((await prisma.courseAccess.findUniqueOrThrow({ where: { id: accessId } })).revokedAt, null);
  });

  // ── Access by hand and payment details ────────────────────────────────────────

  test("an administrator gives access with a reason for six months by default and takes it back", async () => {
    const { course, lessons } = await makeCourse({ priceKzt: 15000 });
    const student = await makeStudent();
    const outsider = await makeParent();
    const path = `/admin/students/${student.id}/course-access`;

    assert.equal((await adminCall("POST", path, { courseId: course.id })).statusCode, 400);
    assert.equal((await adminCall("POST", path, { courseId: course.id, note: "  " })).statusCode, 400);
    assert.equal((await adminCall("POST", path, { courseId: course.id, note: "Подарок", expiresAt: new Date(Date.now() - 1000).toISOString() })).statusCode, 400, "the end must be in the future");
    assert.equal((await adminCall("POST", path, { courseId: course.id, note: "Подарок", expiresAt: "2099-01-01T00:00:00.000Z" })).statusCode, 400, "no more than five years");
    assert.equal((await adminCall("POST", path, { courseId: randomUUID(), note: "Подарок" })).statusCode, 404);
    assert.equal((await adminCall("POST", `/admin/students/${outsider.id}/course-access`, { courseId: course.id, note: "Подарок" })).statusCode, 404, "a parent is not a student");
    assert.equal(await prisma.courseAccess.count({ where: { studentId: student.id } }), 0);

    const before = Date.now();
    const granted = await adminCall("POST", path, { courseId: course.id, note: "Победитель конкурса" });
    assert.equal(granted.statusCode, 201, granted.body);
    const body = granted.json().data;
    assert.deepEqual([body.source, body.status, body.grantNote, body.grantedBy.id, body.course.id], ["admin_grant", "active", "Победитель конкурса", admin.id, course.id]);
    const expected = addCalendarMonths(new Date(body.startsAt), 6).getTime();
    assert.equal(new Date(body.expiresAt).getTime(), expected);
    assert.ok(new Date(body.startsAt).getTime() >= before - 1000);
    assert.equal((await getLessonAccess(student.id, lessons[2].id)).open, true);
    assert.equal((await getCourseAccessState(student.id, course.id)).kind, "granted");
    const told = (await notifications(student.id, "course_access_granted")).find((entry) => entry.dedupeKey?.includes(body.id));
    assert.ok(told);

    const list = await adminCall("GET", path);
    assert.equal(list.statusCode, 200);
    assert.deepEqual(list.json().data.map((entry: { id: string }) => entry.id), [body.id]);

    const revoked = await adminCall("POST", `/admin/course-access/${body.id}/revoke`, { note: "Ошибка" });
    assert.equal(revoked.statusCode, 200, revoked.body);
    assert.deepEqual([revoked.json().data.status, revoked.json().data.revokeReason, revoked.json().data.revokeNote], ["revoked", "admin", "Ошибка"]);
    assert.equal((await getLessonAccess(student.id, lessons[2].id)).open, false);
    const again = await adminCall("POST", `/admin/course-access/${body.id}/revoke`, {});
    assert.equal(again.statusCode, 409);
    assert.equal(again.json().error.code, "ACCESS_ALREADY_REVOKED");
    assert.equal((await adminCall("POST", `/admin/course-access/${randomUUID()}/revoke`, {})).statusCode, 404);
    assert.ok((await notifications(student.id, "course_access_revoked")).some((entry) => entry.dedupeKey?.includes(body.id)));
    assert.deepEqual(await eventsOf(body.id), ["granted", "revoked"]);

    // A date the administrator chose is kept.
    const chosen = new Date(Date.now() + 30 * 86_400_000);
    const custom = await adminCall("POST", path, { courseId: course.id, note: "Месяц пробного доступа", expiresAt: chosen.toISOString() });
    assert.equal(custom.statusCode, 201);
    assert.equal(new Date(custom.json().data.expiresAt).getTime(), chosen.getTime());
  });

  test("revoking a paid access by hand leaves the payment confirmed; the refund then finds the access already closed", async () => {
    const { course } = await makeCourse({ priceKzt: 15000 });
    const child = await makeStudent();
    const parent = await makeParent();
    await linkParent(parent.id, child.id);
    const paid = await call(await login(parent), "POST", `/parents/me/children/${child.id}/courses/${course.id}/payment-requests`, {});
    const requestId = paid.json().data.id as string;
    requestIds.push(requestId);
    await adminCall("POST", `/admin/course-payments/requests/${requestId}/confirm`, {});
    const access = await prisma.courseAccess.findUniqueOrThrow({ where: { paymentRequestId: requestId } });

    const shownAs = async (id: string) => (await adminCall("GET", `/admin/course-payments/requests/${id}`)).json().data.displayStatus as string;
    assert.equal(await shownAs(requestId), "confirmed");
    assert.equal((await adminCall("POST", `/admin/course-access/${access.id}/revoke`, {})).statusCode, 200);
    assert.equal((await requestOf(requestId)).status, "confirmed");
    // The money was accepted, the lessons are closed: «Подтверждена, доступ закрыт», not a plain «Подтверждена».
    assert.equal(await shownAs(requestId), "access_revoked");
    const ids = async (status: string) => (await adminCall("GET", `/admin/course-payments/requests?status=${status}&courseId=${course.id}`)).json().data.map((item: { id: string }) => item.id);
    assert.deepEqual(await ids("access_revoked"), [requestId]);
    assert.deepEqual(await ids("confirmed"), [], "the plain «confirmed» filter no longer lists it");
    assert.equal((await call(await login(child), "GET", "/students/me/course-payment-requests")).json().data[0].displayStatus, "access_revoked");
    for (const user of [child, parent]) {
      assert.ok((await notifications(user.id, "course_access_revoked")).some((entry) => entry.dedupeKey?.includes(access.id)), `notification for ${user.login}`);
    }
    assert.equal((await adminCall("POST", `/admin/course-payments/requests/${requestId}/refund`, {})).statusCode, 200);
    assert.equal((await prisma.courseAccess.findUniqueOrThrow({ where: { id: access.id } })).revokeReason, "admin", "the first reason stays");
    assert.equal(await shownAs(requestId), "refunded", "a refund after the revoke is shown as a refund");
    assert.deepEqual(await ids("access_revoked"), []);
  });

  test("payment details: only https links, empty becomes null, and payers see them on the paywall", async () => {
    const { course } = await makeCourse({ priceKzt: 15000 });
    const student = await makeStudent();
    const token = await login(student);
    await prisma.coursePaymentSettings.deleteMany({});

    const empty = await adminCall("GET", "/admin/course-payments/settings");
    assert.equal(empty.statusCode, 200);
    assert.deepEqual([empty.json().data.kaspiPayUrl, empty.json().data.transferPhone, empty.json().data.updatedAt], [null, null, null]);
    assert.equal((await call(token, "GET", `/courses/${course.id}/access`)).json().data.paymentDetails.configured, false);

    for (const bad of ["javascript:alert(1)", "http://pay.example", "pay.kaspi.kz/x", "https://a b"]) {
      assert.equal((await adminCall("PUT", "/admin/course-payments/settings", { kaspiPayUrl: bad })).statusCode, 400, bad);
    }
    const saved = await adminCall("PUT", "/admin/course-payments/settings", {
      kaspiPayUrl: " https://pay.kaspi.kz/pay/maestro ", transferPhone: "+7 701 000 00 00", recipientName: "ИП Маэстро", hint: "",
    });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.deepEqual(
      [saved.json().data.kaspiPayUrl, saved.json().data.transferPhone, saved.json().data.recipientName, saved.json().data.hint, saved.json().data.updatedBy.id],
      ["https://pay.kaspi.kz/pay/maestro", "+7 701 000 00 00", "ИП Маэстро", null, admin.id],
    );
    const seen = (await call(token, "GET", `/courses/${course.id}/access`)).json().data.paymentDetails;
    assert.deepEqual([seen.kaspiPayUrl, seen.transferPhone, seen.recipientName, seen.configured], ["https://pay.kaspi.kz/pay/maestro", "+7 701 000 00 00", "ИП Маэстро", true]);
    assert.equal(await prisma.coursePaymentSettings.count(), 1, "one row for the school");
    assert.deepEqual((await prisma.auditLog.findMany({ where: { entityType: "course_payment_settings", actorId: admin.id } })).length > 0, true);
    // Clearing a field.
    const cleared = await adminCall("PUT", "/admin/course-payments/settings", { kaspiPayUrl: "", transferPhone: "+7 701 000 00 00" });
    assert.equal(cleared.json().data.kaspiPayUrl, null);
  });

  // ── The table ─────────────────────────────────────────────────────────────────

  test("the table: BOM, `;`, quotes and separators escaped, formulas defused, filters and pages", async () => {
    const tag = `Таб${suffix}`;
    const nasty = await makeCourse({ priceKzt: 7000, title: `+SUM(1;2) ${tag}; "курс"` });
    const calm = await makeCourse({ priceKzt: 8000, title: `Спокойный ${tag}` });
    const formulaStudent = await makeStudent({ firstName: `Иван "Железный"; ${tag}`, lastName: "=cmd|' /C calc'!A0", phone: "+7 (701) 555-00-11" });
    const calmStudent = await makeStudent({ firstName: `Мария ${tag}`, lastName: "Тихая", phone: "87012223344" });
    const parent = await makeParent({ firstName: "@Анна", lastName: "Родитель" });
    await linkParent(parent.id, calmStudent.id);

    const formulaRequest = await ask(await login(formulaStudent), nasty.course.id, "перевод");
    const calmRequest = (await call(await login(parent), "POST", `/parents/me/children/${calmStudent.id}/courses/${calm.course.id}/payment-requests`, {})).json().data.id as string;
    requestIds.push(calmRequest);
    await adminCall("POST", `/admin/course-payments/requests/${formulaRequest}/reject`, { note: "-1 перевод не найден; проверьте" });
    await adminCall("POST", `/admin/course-payments/requests/${calmRequest}/confirm`, {});
    await adminCall("POST", `/admin/course-payments/requests/${calmRequest}/refund`, { note: "Передумали" });

    const response = await adminCall("GET", `/admin/course-payments/requests/export.csv?search=${encodeURIComponent(tag)}`);
    assert.equal(response.statusCode, 200, response.body);
    assert.match(String(response.headers["content-type"]), /^text\/csv; charset=utf-8/);
    assert.match(String(response.headers["content-disposition"]), /^attachment; filename="course-payments-\d{4}-\d{2}-\d{2}\.csv"$/);
    const bytes = response.rawPayload;
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], "UTF-8 BOM");
    assert.ok(response.body.includes("\r\n") && !response.body.startsWith("﻿﻿"));
    const rows = parseCsv(response.body.replace(/^﻿/, ""));
    assert.deepEqual(rows[0], ["Дата заявки", "Дата решения", "Ученик", "Телефон", "Плательщик", "Курс", "Сумма, ₸", "Статус", "Кто решил", "Заметка", "Возврат"]);
    assert.equal(rows.length, 3);
    for (const row of rows) assert.equal(row.length, 11, "no cell spilled over the separator");

    const byCourse = (title: string) => rows.find((row) => row[5].includes(title))!;
    const formulaRow = byCourse("курс");
    assert.equal(formulaRow[2], `'=cmd|' /C calc'!A0 Иван "Железный"; ${tag}`, "the name keeps its quotes and `;` and is defused");
    assert.equal(formulaRow[3], "77015550011", "phone as digits only");
    assert.equal(formulaRow[4], formulaRow[2], "the student paid himself");
    assert.equal(formulaRow[5], `'+SUM(1;2) ${tag}; "курс"`, "a formula-looking title is defused too");
    assert.deepEqual([formulaRow[6], formulaRow[7], formulaRow[8]], ["7000", "Отклонена", "Оплат Админ"]);
    assert.equal(formulaRow[9], "'-1 перевод не найден; проверьте");
    assert.equal(formulaRow[10], "");
    const calmRow = byCourse("Спокойный");
    assert.equal(calmRow[4], "Родитель @Анна (родитель)", "the parent paid; the name sits after the surname");
    assert.deepEqual([calmRow[2], calmRow[3], calmRow[6], calmRow[7]], [`Тихая Мария ${tag}`, "87012223344", "8000", "Возвращена"]);
    assert.match(calmRow[0], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    assert.match(calmRow[1], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    assert.match(calmRow[10], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}, Оплат Админ, Передумали$/);
    assert.ok((await prisma.auditLog.findMany({ where: { entityType: "course_payment_export", actorId: admin.id } })).length > 0, "an export is logged");

    // Filters work the same on the list and on the table.
    const listBy = async (query: string) => (await adminCall("GET", `/admin/course-payments/requests?${query}`)).json();
    assert.equal((await listBy(`search=${encodeURIComponent(tag)}`)).meta.total, 2);
    assert.deepEqual((await listBy(`search=${encodeURIComponent(tag)}&status=refunded`)).data.map((item: { id: string }) => item.id), [calmRequest]);
    assert.deepEqual((await listBy(`search=${encodeURIComponent(tag)}&status=rejected`)).data.map((item: { id: string }) => item.id), [formulaRequest]);
    assert.equal((await listBy(`search=${encodeURIComponent(tag)}&status=confirmed`)).meta.total, 0, "a refunded payment is not «confirmed» any more");
    assert.deepEqual((await listBy(`courseId=${calm.course.id}`)).data.map((item: { id: string }) => item.id), [calmRequest]);
    assert.deepEqual((await listBy(`search=${encodeURIComponent("87012223344")}`)).data.map((item: { id: string }) => item.id), [calmRequest], "by the student's phone");
    assert.deepEqual((await listBy(`search=${encodeURIComponent("+7 (701) 555-00-11")}`)).data.map((item: { id: string }) => item.id), [formulaRequest], "a phone typed with punctuation");
    assert.deepEqual((await listBy(`search=${encodeURIComponent(`Родитель ${tag}`)}`)).data.map((item: { id: string }) => item.id), [calmRequest], "by the payer's name, words in any order");
    const today = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
    assert.equal((await listBy(`search=${encodeURIComponent(tag)}&from=${today}&to=${today}`)).meta.total, 2, "today, both ends included");
    assert.equal((await listBy(`search=${encodeURIComponent(tag)}&to=2020-01-01`)).meta.total, 0);
    assert.equal((await listBy(`search=${encodeURIComponent(tag)}&from=2999-01-01`)).meta.total, 0);
    assert.equal((await adminCall("GET", "/admin/course-payments/requests?from=вчера")).statusCode, 400);
    const page1 = await listBy(`search=${encodeURIComponent(tag)}&limit=1&page=1`);
    const page2 = await listBy(`search=${encodeURIComponent(tag)}&limit=1&page=2`);
    assert.deepEqual([page1.meta.pages, page1.data.length, page2.data.length], [2, 1, 1]);
    assert.notEqual(page1.data[0].id, page2.data[0].id);
    const onlyConfirmedCsv = parseCsv((await adminCall("GET", `/admin/course-payments/requests/export.csv?search=${encodeURIComponent(tag)}&status=refunded`)).body.replace(/^﻿/, ""));
    assert.equal(onlyConfirmedCsv.length, 2, "the table follows the filters");
  });

  // ── Before the new economy ────────────────────────────────────────────────────

  test("before the new economy a finished course pays neither Coins nor module or course Points; XP only for the school", async () => {
    const { enrollStudentInCourse } = await import("../../application/services/enrollment.service.js");
    const { startLesson, completeLessonWithoutHomework } = await import("../../application/services/lesson-progress.service.js");
    const { submitHomework } = await import("../../application/services/homework-submit.service.js");
    const { course, lessons } = await makeCourse({ priceKzt: null, coinsReward: 30 });
    const test3 = await prisma.homework.create({ data: {
      lessonId: lessons[2].id, description: "Тест", type: "test", passingScore: 50,
      testQuestions: [{ id: "q1", prompt: "Вопрос", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctOptionId: "a" }],
    } });
    const external = await makeStudent();
    const school = await makeStudent({ crmStudentId: `crm-legacy-${suffix}` });
    for (const student of [external, school]) {
      await enrollStudentInCourse(student.id, course.id);
      for (const lesson of lessons.slice(0, 2)) {
        await startLesson(student.id, lesson.id);
        await completeLessonWithoutHomework(student.id, lesson.id);
      }
      await startLesson(student.id, lessons[2].id);
      await submitHomework({ homeworkId: test3.id, studentId: student.id, testAnswers: { q1: "a" } });
      assert.equal((await prisma.studentCourse.findFirstOrThrow({ where: { studentId: student.id, courseId: course.id } })).status, "completed");
      const coins = await prisma.maestroCoinTransaction.findMany({ where: { studentId: student.id, sourceType: "course" } });
      assert.deepEqual(coins, [], "the old Coins for a finished course are gone, the course still has a Coins reward set");
      assert.equal(await prisma.pointsTransaction.count({ where: { studentId: student.id, sourceKey: { startsWith: "course-" } } }), 0, "no module or course Points");
    }
    assert.equal(await prisma.leagueXpEvent.count({ where: { studentId: school.id, sourceType: "course_homework" } }), 1, "XP as before for the school student");
    assert.equal(await prisma.leagueXpEvent.count({ where: { studentId: external.id } }), 0, "none for a person outside the school");
  });

  // ── Fixes after the reviews ───────────────────────────────────────────────────

  test("a pending request for a course the student now gets free from the school is flagged for the administrator, and can still be confirmed", async () => {
    const included = await makeCourse({ priceKzt: 15000, includedInSchool: true });
    const plain = await makeCourse({ priceKzt: 15000 });
    const student = await makeStudent();
    const token = await login(student);
    const onIncluded = await ask(token, included.course.id);
    const onPlain = await ask(token, plain.course.id);
    const flag = async (id: string) => (await adminCall("GET", `/admin/course-payments/requests/${id}`)).json().data.coveredBySchool as boolean;
    assert.deepEqual([await flag(onIncluded), await flag(onPlain)], [false, false], "an outsider has to pay");

    await prisma.user.update({ where: { id: student.id }, data: { crmStudentId: `crm-covered-${suffix}` } });
    assert.deepEqual([await flag(onIncluded), await flag(onPlain)], [true, false], "now the included course is free: check whether payment is needed");
    const inList = (await adminCall("GET", "/admin/course-payments/requests?status=pending&limit=100")).json().data
      .find((item: { id: string }) => item.id === onIncluded);
    assert.equal(inList.coveredBySchool, true);

    // Not forbidden: the money may have been paid already.
    const confirmed = await adminCall("POST", `/admin/course-payments/requests/${onIncluded}/confirm`, {});
    assert.equal(confirmed.statusCode, 200, confirmed.body);
    assert.equal(confirmed.json().data.coveredBySchool, false, "a decided request carries no warning");
  });

  test("the request is made for the price the payer saw: another price is a 409 with the new one, no request and no log entry", async () => {
    const { course } = await makeCourse({ priceKzt: 15000 });
    const student = await makeStudent();
    const token = await login(student);
    const post = (body: unknown) => app.inject({
      method: "POST", url: `/api/v1/courses/${course.id}/payment-requests`, payload: body as never,
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal((await post({})).statusCode, 400, "the price on the screen is required");
    assert.equal((await post({ expectedPriceKzt: "15000" })).statusCode, 400);
    assert.equal((await post({ expectedPriceKzt: 0 })).statusCode, 400);
    await prisma.course.update({ where: { id: course.id }, data: { priceKzt: 18000 } });
    const changed = await post({ expectedPriceKzt: 15000 });
    assert.equal(changed.statusCode, 409, changed.body);
    assert.equal(changed.json().error.code, "COURSE_PRICE_CHANGED");
    assert.equal(changed.json().error.details.priceKzt, 18000);
    assert.equal(await prisma.coursePaymentRequest.count({ where: { studentId: student.id } }), 0);

    const made = await post({ expectedPriceKzt: 18000 });
    assert.equal(made.statusCode, 201, made.body);
    requestIds.push(made.json().data.id);
    assert.equal(made.json().data.amountKzt, 18000, "the sum is the price the payer saw");

    // The parent route works the same way.
    const child = await makeStudent();
    const parent = await makeParent();
    await linkParent(parent.id, child.id);
    const parentToken = await login(parent);
    const parentPath = `/api/v1/parents/me/children/${child.id}/courses/${course.id}/payment-requests`;
    const wrong = await app.inject({ method: "POST", url: parentPath, payload: { expectedPriceKzt: 15000 }, headers: { authorization: `Bearer ${parentToken}` } });
    assert.equal(wrong.statusCode, 409);
    assert.deepEqual([wrong.json().error.code, wrong.json().error.details.priceKzt], ["COURSE_PRICE_CHANGED", 18000]);
    assert.equal((await app.inject({ method: "POST", url: parentPath, payload: {}, headers: { authorization: `Bearer ${parentToken}` } })).statusCode, 400);
    const right = await app.inject({ method: "POST", url: parentPath, payload: { expectedPriceKzt: 18000 }, headers: { authorization: `Bearer ${parentToken}` } });
    assert.equal(right.statusCode, 201, right.body);
    requestIds.push(right.json().data.id);
  });

  test("the request and its log entry are one transaction: if the entry cannot be written there is no request", async () => {
    const { course } = await makeCourse({ priceKzt: 15000 });
    const student = await makeStudent();
    const token = await login(student);
    const fn = `fail_audit_${suffix}`;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION ${fn}() RETURNS trigger AS $$ BEGIN
      IF NEW.payload->>'event' = 'requested' AND NEW.actor_id = '${student.id}' THEN RAISE EXCEPTION 'audit refused'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${fn} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
    const realError = console.error;
    console.error = () => undefined;
    try {
      const failed = await call(token, "POST", `/courses/${course.id}/payment-requests`, {});
      assert.equal(failed.statusCode, 500, failed.body);
      assert.equal(await prisma.coursePaymentRequest.count({ where: { studentId: student.id } }), 0, "no request without its entry");
    } finally {
      console.error = realError;
      await prisma.$executeRawUnsafe(`DROP TRIGGER ${fn} ON audit_logs`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION ${fn}()`);
    }
    const id = await ask(token, course.id);
    assert.deepEqual(await eventsOf(id), ["requested"], "with the entry writable the pair is made together");
  });

  test("the table says so when it stops at the limit; the administrator's course list needs no catalog right", async () => {
    const { course } = await makeCourse({ priceKzt: 15000, title: `Выгрузка ${suffix}` });
    const first = await makeStudent({ firstName: "Выг", lastName: `Рузка${suffix}` });
    const second = await makeStudent({ firstName: "Выг", lastName: `Рузка${suffix}` });
    await ask(await login(first), course.id);
    await ask(await login(second), course.id);
    const exportUrl = `/admin/course-payments/requests/export.csv?courseId=${course.id}`;
    const previous = process.env.COURSE_PAYMENTS_EXPORT_LIMIT;
    try {
      process.env.COURSE_PAYMENTS_EXPORT_LIMIT = "1";
      const cut = await adminCall("GET", exportUrl);
      assert.equal(cut.statusCode, 200);
      assert.equal(cut.headers["x-export-truncated"], "1");
      assert.equal(parseCsv(cut.body.replace(/^﻿/, "")).length, 2, "header and the one row that fits");
      process.env.COURSE_PAYMENTS_EXPORT_LIMIT = "2";
      const exact = await adminCall("GET", exportUrl);
      assert.equal(exact.headers["x-export-truncated"], undefined, "exactly the limit is not a cut");
      assert.equal(parseCsv(exact.body.replace(/^﻿/, "")).length, 3);
    } finally {
      if (previous === undefined) delete process.env.COURSE_PAYMENTS_EXPORT_LIMIT;
      else process.env.COURSE_PAYMENTS_EXPORT_LIMIT = previous;
    }
    const whole = await adminCall("GET", exportUrl);
    assert.equal(whole.headers["x-export-truncated"], undefined);

    // `admin` holds course_payments.manage and nothing about the catalog.
    const deleted = await makeCourse({ priceKzt: 1000, title: `Удалён ${suffix}` });
    await prisma.course.update({ where: { id: deleted.course.id }, data: { deletedAt: new Date() } });
    const listed = await adminCall("GET", "/admin/course-payments/courses");
    assert.equal(listed.statusCode, 200, listed.body);
    const rows = listed.json().data as Array<{ id: string; title: string; priceKzt: number | null; includedInSchool: boolean }>;
    const mine = rows.find((row) => row.id === course.id);
    assert.deepEqual([mine?.title, mine?.priceKzt, mine?.includedInSchool], [`Выгрузка ${suffix}`, 15000, false]);
    assert.ok(!rows.some((row) => row.id === deleted.course.id), "a deleted course is not offered");
    assert.equal((await call(await login(await makeStudent()), "GET", "/admin/course-payments/courses")).statusCode, 403);
    assert.equal((await call(null, "GET", "/admin/course-payments/courses")).statusCode, 401);
  });

  // ── Telegram ──────────────────────────────────────────────────────────────────

  test("Telegram: without settings nothing is sent; with settings the message goes out after the request; a failure never undoes the request", async () => {
    const { course } = await makeCourse({ priceKzt: 15000, title: `Телеграм ${suffix}` });
    const realFetch = globalThis.fetch;
    const realWarn = console.warn;
    const realError = console.error;
    console.warn = () => undefined;
    console.error = () => undefined;
    const sent: Array<{ url: string; text: string }> = [];
    let mode: "ok" | "throw" | "refuse" = "ok";
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(input), text: JSON.parse(String(init?.body)).text });
      if (mode === "throw") throw new TypeError("fetch failed");
      if (mode === "refuse") return new Response(JSON.stringify({ ok: false }), { status: 403 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    try {
      // No variables: a quiet no-op.
      const silent = await makeStudent();
      const first = await createPaymentRequest({ courseId: course.id, studentId: silent.id, payerUserId: silent.id, expectedPriceKzt: 15000 });
      requestIds.push(first.request.id);
      assert.equal(await first.telegram, false);
      assert.equal(sent.length, 0);
      assert.equal((await requestOf(first.request.id)).status, "pending");

      process.env.TELEGRAM_BOT_TOKEN = "777:test-token";
      process.env.TELEGRAM_CHAT_ID = "-100500";
      const child = await makeStudent({ firstName: "Лена", lastName: "Телеграмова", phone: "+77079998877" });
      const parent = await makeParent({ firstName: "Ольга", lastName: "Телеграмова", phone: "+77071112233" });
      await linkParent(parent.id, child.id);
      const viaParent = await call(await login(parent), "POST", `/parents/me/children/${child.id}/courses/${course.id}/payment-requests`, { payerNote: "мой телефон 87079998877" });
      assert.equal(viaParent.statusCode, 201, viaParent.body);
      const parentRequest = viaParent.json().data.id as string;
      requestIds.push(parentRequest);
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(sent.length, 1);
      assert.equal(sent[0].url, "https://api.telegram.org/bot777:test-token/sendMessage");
      const text = sent[0].text;
      assert.match(text, new RegExp(`Курс: Телеграм ${suffix}`));
      assert.match(text, /Сумма: 15 000 ₸/);
      assert.match(text, /Ученик: Лена Телеграмова/);
      assert.match(text, /Платил: родитель Ольга Телеграмова/);
      assert.ok(text.includes(`https://app.test.maestro.kz/admin/course-payments?request=${parentRequest}`), "link to the request in the admin area");
      assert.ok(!/87079998877|77071112233|телефон/i.test(text), "no phone numbers or notes in the chat");

      // Telegram falls over: the request is stored, the answer is still 201.
      mode = "throw";
      const down = await makeStudent();
      const failed = await call(await login(down), "POST", `/courses/${course.id}/payment-requests`, {});
      assert.equal(failed.statusCode, 201, failed.body);
      requestIds.push(failed.json().data.id);
      mode = "refuse";
      const other = await makeStudent();
      const refused = await createPaymentRequest({ courseId: course.id, studentId: other.id, payerUserId: other.id, expectedPriceKzt: 15000 });
      requestIds.push(refused.request.id);
      assert.equal(await refused.telegram, false);
      assert.equal((await requestOf(failed.json().data.id)).status, "pending");
      assert.equal((await requestOf(refused.request.id)).status, "pending");
      assert.ok(sent.length >= 3, "it was tried");

      // A refused request (409) sends nothing.
      const count = sent.length;
      assert.equal((await call(await login(down), "POST", `/courses/${course.id}/payment-requests`, {})).statusCode, 409);
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.equal(sent.length, count);
    } finally {
      globalThis.fetch = realFetch;
      console.warn = realWarn;
      console.error = realError;
      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_CHAT_ID;
    }
  });
}
