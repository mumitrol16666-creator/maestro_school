import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Stage 4: a parent can make a «child» account in the app with any phone and name. When the school later
// gives the matching CRM student that account (provision-student, kind «reuse»), the parent who made it
// must not see the school's data until the school has checked them; a parent the school confirms gets
// the child back.
if (!process.env.TEST_DATABASE_URL) {
  test("parent links on hold at school provisioning HTTP + PostgreSQL", { skip: "TEST_DATABASE_URL required" }, () => {});
} else {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && /test|qa/.test(url.pathname));
  Object.assign(process.env, {
    DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: "test",
    CRM_SESSION_CACHE_TTL_MS: "0", CRM_SESSION_STALE_MAX_AGE_MS: "0",
    JWT_SECRET: "parent-hold-test-secret", INTEGRATION_SERVICE_SECRET: "parent-hold-integration-secret",
    INTEGRATION_SSO_SECRET: "parent-hold-bridge-secret", CRM_API_URL: "http://crm.test:5002",
    FEATURE_CURATOR_WORKSPACE_V2: "true",
  });
  delete process.env.CRM_OUTBOUND_SECRET;
  const { default: Fastify } = await import("fastify");
  const { default: fastifyJwt } = await import("@fastify/jwt");
  const { default: bcrypt } = await import("bcryptjs");
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { authRoutes } = await import("./auth.routes.js");
  const { familyRoutes } = await import("./family.routes.js");
  const { coursePaymentsRoutes } = await import("./course-payments.routes.js");
  const { integrationRoutes } = await import("./integration.routes.js");
  const { errorHandler } = await import("../middleware/error-handler.js");

  const app = Fastify();
  const suffix = randomUUID().replace(/\D/g, "").padEnd(7, "3").slice(0, 7);
  const crmIds: string[] = [];
  let counter = 0;
  const phone = () => `+77${suffix}${String((counter += 1)).padStart(2, "0")}`;
  const realFetch = globalThis.fetch;
  const realError = console.error;

  const registerParent = (payload: unknown) => app.inject({ method: "POST", url: "/api/v1/auth/register/parent", payload: payload as never });
  const login = (phoneValue: string, password: string) => app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { phone: phoneValue, password } });
  const call = (token: string, path: string) => app.inject({ method: "GET", url: `/api/v1${path}`, headers: { authorization: `Bearer ${token}` } });
  const crm = (method: "GET" | "POST", path: string, payload?: object) => app.inject({
    method, url: `/api/integration/v1${path}`, payload,
    headers: { authorization: "Bearer parent-hold-integration-secret", "x-integration-system": "crm" },
  });
  const crmStudentId = () => {
    const id = `crm-hold-${suffix}-${crmIds.length + 1}`;
    crmIds.push(id);
    return id;
  };

  test.before(async () => {
    // The school's data lives in CRM; here CRM is unreachable, so a confirmed parent gets the fallback.
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).startsWith("http://crm.test:5002")) throw new TypeError("fetch failed");
      return realFetch(input as never, init);
    }) as typeof fetch;
    console.error = () => {};
    await app.register(fastifyJwt, { secret: process.env.JWT_SECRET!, sign: { expiresIn: "7d" } });
    app.setErrorHandler(errorHandler);
    for (const plugin of [authRoutes, familyRoutes, coursePaymentsRoutes]) await app.register(plugin, { prefix: "/api/v1" });
    await app.register(integrationRoutes, { prefix: "/api/integration/v1" });
    await app.ready();
    for (const slug of ["student", "parent"]) {
      const role = await prisma.role.upsert({ where: { slug }, create: { slug, name: slug }, update: {} });
      const codes = slug === "student" ? ["courses.read", "lessons.read", "progress.read"] : ["family.read", "courses.read"];
      for (const code of codes) {
        const permission = await prisma.permission.upsert({ where: { code }, create: { code }, update: {} });
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
          create: { roleId: role.id, permissionId: permission.id }, update: {},
        });
      }
    }
  });

  test.after(async () => {
    globalThis.fetch = realFetch;
    console.error = realError;
    await app.close();
    const ids = (await prisma.user.findMany({ where: { phoneNormalized: { startsWith: `77${suffix}` } }, select: { id: true } })).map((row) => row.id);
    const links = await prisma.parentStudentLink.findMany({ where: { OR: [{ parentUserId: { in: ids } }, { studentUserId: { in: ids } }] }, select: { id: true } });
    await prisma.adminJournalEntry.deleteMany({ where: { linkedEntityId: { in: links.map((link) => link.id) } } });
    await prisma.crmFamilyProvision.deleteMany({ where: { crmStudentId: { in: crmIds } } });
    await prisma.userNotification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.parentStudentLink.deleteMany({ where: { id: { in: links.map((link) => link.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  async function parentWithChild(child: { firstName: string; lastName: string }) {
    const parentPhone = phone();
    const childPhone = phone();
    const answer = await registerParent({
      parent: { firstName: "Родитель", lastName: child.lastName, phone: parentPhone, password: "parent-pass-1" },
      child: { ...child, phone: childPhone, password: "child-pass-12" },
    });
    assert.equal(answer.statusCode, 201, answer.body);
    const data = answer.json().data;
    return { parentToken: data.token as string, parentId: data.user.id as string, childId: data.child.id as string, childPhone };
  }

  test("someone registers a «child» with a real student's phone and name: after the school's link they see nothing of the school and cannot sign in as the child", async () => {
    const { parentToken, parentId, childId, childPhone } = await parentWithChild({ firstName: "Алина", lastName: "Ким" });
    const oldChildSession = (await login(childPhone, "child-pass-12")).json().data.token as string;
    // Notifications were switched on on the device where the parent signed in as the child.
    await prisma.pushSubscription.create({ data: {
      userId: childId, endpoint: `https://push.test/${suffix}/${childId}`, p256dh: "key", auth: "auth",
    } });
    const studentCard = crmStudentId();

    // The enrollment step of CRM asks to keep the existing password; it is replaced anyway.
    const provision = await crm("POST", "/users/provision-student", {
      crmStudentId: studentCard, phone: childPhone, firstName: "Алина", lastName: "Ким",
      password: "school-pass-1", preserveExistingPassword: true,
    });
    assert.equal(provision.statusCode, 200, provision.body);
    const result = provision.json().data;
    assert.deepEqual([result.created, result.appUserId, result.passwordReplaced, result.temporaryPassword], [false, childId, true, undefined]);
    const link = await prisma.parentStudentLink.findFirstOrThrow({ where: { parentUserId: parentId, studentUserId: childId } });
    assert.deepEqual(result.heldParentLinks.map((held: { linkId: string; parentUserId: string; relationship: string }) => [held.linkId, held.parentUserId, held.relationship]),
      [[link.id, parentId, "guardian"]], "CRM gets the held link to confirm or drop");
    assert.equal(link.isActive, false);
    assert.ok(link.revokedAt);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: childId } })).crmStudentId, studentCard);

    // No school data for that parent: the child is gone from the family, every child route is a 404.
    const family = await call(parentToken, "/parents/me/children");
    assert.equal(family.statusCode, 200, family.body);
    assert.deepEqual(family.json().data, []);
    for (const path of [
      `/parents/me/children/${childId}/offline-summary`,
      `/parents/me/children/${childId}/monthly-plans?month=2026-11`,
      `/parents/me/children/${childId}/courses`,
    ]) {
      assert.equal((await call(parentToken, path)).statusCode, 404, path);
    }
    // CRM does not show them as the child's parent either.
    const access = await crm("GET", `/family/${studentCard}`);
    assert.equal(access.statusCode, 200, access.body);
    assert.deepEqual([access.json().data.student.id, access.json().data.parents], [childId, []]);

    // The password the parent set and the session they had as the child are both dead; the school's works.
    assert.equal((await login(childPhone, "child-pass-12")).statusCode, 401);
    assert.equal((await call(oldChildSession, "/auth/me")).statusCode, 401);
    assert.equal(await prisma.pushSubscription.count({ where: { userId: childId } }), 0, "no school push to that device");
    const schoolLogin = await login(childPhone, "school-pass-1");
    assert.equal(schoolLogin.statusCode, 200, schoolLogin.body);
    assert.equal(schoolLogin.json().data.user.audience, "school");

    // The administrator sees the hold in the journal.
    const entry = await prisma.adminJournalEntry.findUniqueOrThrow({ where: { sourceKey: `parent-access:${link.id}:held` } });
    assert.deepEqual([entry.status, entry.type, entry.linkedEntityId], ["new", "parent_access", link.id]);

    // A retry of CRM finds the linked card and does not give the access back.
    const again = await crm("POST", "/users/provision-student", {
      crmStudentId: studentCard, phone: childPhone, firstName: "Алина", lastName: "Ким", password: "school-pass-1", preserveExistingPassword: true,
    });
    assert.equal(again.statusCode, 200, again.body);
    assert.equal((await prisma.parentStudentLink.findUniqueOrThrow({ where: { id: link.id } })).isActive, false);
    assert.deepEqual((await call(parentToken, "/parents/me/children")).json().data, []);
  });

  test("CRM's «Связать» on the student card (/users/link) holds the parent the same way, also with force", async () => {
    const { parentToken, parentId, childId, childPhone } = await parentWithChild({ firstName: "Дана", lastName: "Омарова" });
    const studentCard = crmStudentId();
    const linked = await crm("POST", "/users/link", {
      appUserId: childId, phoneNormalized: childPhone.replace(/\D/g, ""), crmStudentId: studentCard, crmRole: "student",
    });
    assert.equal(linked.statusCode, 200, linked.body);
    const hold = linked.json().data.parentHold;
    assert.equal(hold.passwordReplaced, true);
    assert.deepEqual(hold.heldParentLinks.map((held: { parentUserId: string }) => held.parentUserId), [parentId]);
    assert.equal(typeof hold.temporaryPassword, "string", "no password came from CRM: the new one is in the answer");
    assert.deepEqual((await call(parentToken, "/parents/me/children")).json().data, []);
    assert.equal((await call(parentToken, `/parents/me/children/${childId}/offline-summary`)).statusCode, 404);
    assert.equal((await login(childPhone, "child-pass-12")).statusCode, 401);
    // A repeated link to the same card holds nothing more and keeps the password.
    const repeated = await crm("POST", "/users/link", {
      appUserId: childId, phoneNormalized: childPhone.replace(/\D/g, ""), crmStudentId: studentCard, crmRole: "student",
    });
    assert.deepEqual([repeated.json().data.parentHold.passwordReplaced, repeated.json().data.parentHold.heldParentLinks], [false, []]);
    assert.equal((await login(childPhone, hold.temporaryPassword)).statusCode, 200);

    // The card is moved by force to another parent-made account: that parent is held too.
    const other = await parentWithChild({ firstName: "Дана", lastName: "Омарова" });
    const moved = await crm("POST", "/users/link", {
      appUserId: other.childId, phoneNormalized: other.childPhone.replace(/\D/g, ""), crmStudentId: studentCard, crmRole: "student", force: true,
    });
    assert.equal(moved.statusCode, 200, moved.body);
    assert.deepEqual(moved.json().data.parentHold.heldParentLinks.map((held: { parentUserId: string }) => held.parentUserId), [other.parentId]);
    assert.deepEqual((await call(other.parentToken, "/parents/me/children")).json().data, []);
  });

  test("the real parent: after the school's link the child waits for the school; the school confirms the parent and the child is back as a school child", async () => {
    const { parentToken, parentId, childId, childPhone } = await parentWithChild({ firstName: "Тимур", lastName: "Сейтов" });
    // A parent the school linked itself (CRM, no creator) is not put on hold.
    const parentRole = await prisma.role.findUniqueOrThrow({ where: { slug: "parent" } });
    const schoolPhone = phone().replace(/\D/g, "");
    const schoolParent = await prisma.user.create({ data: {
      login: `hold_school_${suffix}`, phone: schoolPhone, phoneNormalized: schoolPhone, passwordHash: await bcrypt.hash("password-1234", 4),
      firstName: "Школьный", lastName: "Родитель", roleId: parentRole.id,
    } });
    const schoolLink = await prisma.parentStudentLink.create({ data: { parentUserId: schoolParent.id, studentUserId: childId, relationship: "mother" } });
    const studentCard = crmStudentId();

    // No password from CRM: the account gets a new one and CRM gets it.
    const provision = await crm("POST", "/users/provision-student", { crmStudentId: studentCard, phone: childPhone, firstName: "Тимур", lastName: "Сейтов" });
    assert.equal(provision.statusCode, 200, provision.body);
    const result = provision.json().data;
    assert.equal(result.passwordReplaced, true);
    assert.equal(typeof result.temporaryPassword, "string");
    assert.equal((await login(childPhone, result.temporaryPassword)).statusCode, 200);
    assert.equal((await login(childPhone, "child-pass-12")).statusCode, 401);
    const [held] = result.heldParentLinks;
    assert.equal(result.heldParentLinks.length, 1);
    assert.equal(held.parentUserId, parentId);
    assert.equal((await prisma.parentStudentLink.findUniqueOrThrow({ where: { id: schoolLink.id } })).isActive, true);
    assert.deepEqual((await call(parentToken, "/parents/me/children")).json().data, []);

    // The administrator checks the parent's identity and links them in CRM: the same link is active again.
    const confirmed = await crm("POST", "/family/parent", {
      crmStudentId: studentCard, crmActorId: "crm-admin-1", operationId: `enrollment:${studentCard}:parent`, mode: "link",
      login: held.login, parentUserId: held.parentUserId, identityVerified: true, relationship: "father",
    });
    assert.equal(confirmed.statusCode, 200, confirmed.body);
    assert.equal(confirmed.json().data.linkId, held.linkId);
    const link = await prisma.parentStudentLink.findUniqueOrThrow({ where: { id: held.linkId } });
    assert.deepEqual([link.isActive, link.revokedAt, link.relationship], [true, null, "father"]);

    // The parent's own session was not touched: the child is back, now a school child.
    const family = await call(parentToken, "/parents/me/children");
    assert.equal(family.statusCode, 200, family.body);
    assert.deepEqual(family.json().data.map((child: { id: string; audience: string }) => [child.id, child.audience]), [[childId, "school"]]);
    const overview = await call(parentToken, `/parents/me/children/${childId}/offline-summary`);
    assert.equal(overview.statusCode, 200, overview.body);
    assert.equal(overview.json().data.child.audience, "school");
    assert.equal((await call(parentToken, `/parents/me/children/${childId}/courses`)).statusCode, 200);
  });

  test("an account with no parent from the app keeps its password when CRM asks so, and the answer holds nothing", async () => {
    const studentRole = await prisma.role.findUniqueOrThrow({ where: { slug: "student" } });
    const ownPhone = phone().replace(/\D/g, "");
    const own = await prisma.user.create({ data: {
      login: `hold_own_${suffix}`, phone: ownPhone, phoneNormalized: ownPhone, passwordHash: await bcrypt.hash("own-password-1", 4),
      firstName: "Самостоятельный", lastName: "Ученик", roleId: studentRole.id,
    } });
    const provision = await crm("POST", "/users/provision-student", {
      crmStudentId: crmStudentId(), phone: ownPhone, firstName: "Самостоятельный", lastName: "Ученик",
      password: "school-pass-1", preserveExistingPassword: true,
    });
    assert.equal(provision.statusCode, 200, provision.body);
    assert.deepEqual([provision.json().data.appUserId, provision.json().data.passwordReplaced, provision.json().data.heldParentLinks], [own.id, false, []]);
    assert.equal((await login(ownPhone, "own-password-1")).statusCode, 200);
  });
}
