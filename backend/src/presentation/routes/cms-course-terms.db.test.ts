import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Stage 4, step 5: the course editor sets the price, the «included in the school» flag and the number
// of free lessons — over HTTP and PostgreSQL.
if (!process.env.TEST_DATABASE_URL) {
  test("course terms in the CMS HTTP + PostgreSQL", { skip: "TEST_DATABASE_URL required" }, () => {});
} else {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && /test|qa/.test(url.pathname));
  Object.assign(process.env, {
    DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: "test",
    CRM_SESSION_CACHE_TTL_MS: "0", CRM_SESSION_STALE_MAX_AGE_MS: "0",
    JWT_SECRET: "cms-course-terms-secret", INTEGRATION_SERVICE_SECRET: "cms-course-terms-integration",
    INTEGRATION_SSO_SECRET: "cms-course-terms-bridge", CRM_API_URL: "http://127.0.0.1:9",
  });
  const { default: Fastify } = await import("fastify");
  const { default: fastifyJwt } = await import("@fastify/jwt");
  const { default: bcrypt } = await import("bcryptjs");
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { authRoutes } = await import("./auth.routes.js");
  const { cmsRoutes } = await import("./cms.routes.js");
  const { errorHandler } = await import("../middleware/error-handler.js");

  const app = Fastify();
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const courseIds: string[] = [];
  let directionId = "";
  let token = "";

  async function login(phone: string) {
    const response = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { phone, password: "terms-password" } });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().data.token as string;
  }
  const call = (method: "GET" | "POST" | "PATCH", path: string, payload?: unknown) => app.inject({
    method, url: `/api/v1${path}`, payload: payload as never, headers: { authorization: `Bearer ${token}` },
  });

  test.before(async () => {
    await app.register(fastifyJwt, { secret: process.env.JWT_SECRET!, sign: { expiresIn: "7d" } });
    app.setErrorHandler(errorHandler);
    for (const plugin of [authRoutes, cmsRoutes]) await app.register(plugin, { prefix: "/api/v1" });
    await app.ready();
    const direction = await prisma.direction.create({ data: { title: `Условия ${suffix}`, slug: `cms-terms-${suffix}`, isPublished: true } });
    directionId = direction.id;
    const role = await prisma.role.upsert({ where: { slug: "admin" }, create: { slug: "admin", name: "admin" }, update: {} });
    const permission = await prisma.permission.upsert({ where: { code: "catalog.manage" }, create: { code: "catalog.manage" }, update: {} });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      create: { roleId: role.id, permissionId: permission.id }, update: {},
    });
    const login_ = `terms_${suffix}`;
    const user = await prisma.user.create({ data: {
      login: login_, phone: randomUUID().slice(0, 20), passwordHash: await bcrypt.hash("terms-password", 4),
      firstName: "Условия", lastName: "Курса", roleId: role.id,
    } });
    userIds.push(user.id);
    token = await login(login_);
  });

  test.after(async () => {
    await app.close();
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: courseIds } }] } });
    if (directionId) await prisma.course.deleteMany({ where: { directionId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (directionId) await prisma.direction.delete({ where: { id: directionId } });
    await prisma.$disconnect();
  });

  test("a new course is free by default; the editor sets a price, the school flag and free lessons, and clears the price", async () => {
    const created = await call("POST", "/admin/courses", { directionId, title: `Курс ${suffix}` });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().data.id as string;
    courseIds.push(id);
    assert.deepEqual(
      [created.json().data.priceKzt, created.json().data.includedInSchool, created.json().data.freeLessonsCount],
      [null, false, 2],
    );

    const priced = await call("PATCH", `/admin/courses/${id}`, { priceKzt: 12000, includedInSchool: true, freeLessonsCount: 3 });
    assert.equal(priced.statusCode, 200, priced.body);
    const read = (await call("GET", `/admin/courses/${id}`)).json().data;
    assert.deepEqual([read.priceKzt, read.includedInSchool, read.freeLessonsCount], [12000, true, 3]);

    // The editor reads the terms with the course tree.
    const tree = (await call("GET", `/admin/courses/${id}/tree`)).json().data;
    assert.deepEqual([tree.priceKzt, tree.includedInSchool, tree.freeLessonsCount], [12000, true, 3]);

    // A patch without the fields leaves the terms alone.
    await call("PATCH", `/admin/courses/${id}`, { title: `Курс ${suffix} (новое имя)` });
    const untouched = (await call("GET", `/admin/courses/${id}`)).json().data;
    assert.deepEqual([untouched.priceKzt, untouched.includedInSchool, untouched.freeLessonsCount], [12000, true, 3]);

    // null empties the price: the course is free again.
    const freed = await call("PATCH", `/admin/courses/${id}`, { priceKzt: null });
    assert.equal(freed.statusCode, 200, freed.body);
    assert.equal((await call("GET", `/admin/courses/${id}`)).json().data.priceKzt, null);

    // The log names the terms the course was created with, and for each change the previous and the new terms.
    const terms = async (action: "create" | "update") => (await prisma.auditLog.findMany({ where: { entityId: id, action }, orderBy: { createdAt: "asc" } }))
      .map((row) => (row.payload as { terms?: unknown } | null)?.terms);
    assert.deepEqual(await terms("create"), [{ before: null, after: { priceKzt: null, includedInSchool: false, freeLessonsCount: 2 } }]);
    // The rename without terms writes no terms; the price change and the price clearing each write one.
    assert.deepEqual((await terms("update")).filter(Boolean), [
      { before: { priceKzt: null, includedInSchool: false, freeLessonsCount: 2 }, after: { priceKzt: 12000, includedInSchool: true, freeLessonsCount: 3 } },
      { before: { priceKzt: 12000, includedInSchool: true, freeLessonsCount: 3 }, after: { priceKzt: null, includedInSchool: true, freeLessonsCount: 3 } },
    ]);

    // Saving the same terms again changes nothing and logs no terms.
    await call("PATCH", `/admin/courses/${id}`, { includedInSchool: true, freeLessonsCount: 3 });
    assert.equal((await terms("update")).filter(Boolean).length, 2);
  });

  test("a price must be a whole number above zero and free lessons 0..50; nothing is saved on a refusal", async () => {
    const created = await call("POST", "/admin/courses", { directionId, title: `Курс границ ${suffix}`, priceKzt: 9000, freeLessonsCount: 0 });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().data.id as string;
    courseIds.push(id);
    assert.deepEqual([created.json().data.priceKzt, created.json().data.freeLessonsCount], [9000, 0]);

    for (const bad of [
      { priceKzt: 0 }, { priceKzt: -5 }, { priceKzt: 1500.5 }, { priceKzt: "12000" }, { priceKzt: 1_000_000_000 },
      { freeLessonsCount: -1 }, { freeLessonsCount: 51 }, { freeLessonsCount: 1.5 }, { freeLessonsCount: null },
      { includedInSchool: "yes" },
    ]) {
      const response = await call("PATCH", `/admin/courses/${id}`, bad);
      assert.equal(response.statusCode, 400, `${JSON.stringify(bad)} → ${response.statusCode} ${response.body}`);
    }
    const edge = await call("PATCH", `/admin/courses/${id}`, { priceKzt: 1, freeLessonsCount: 50 });
    assert.equal(edge.statusCode, 200, edge.body);
    const read = (await call("GET", `/admin/courses/${id}`)).json().data;
    assert.deepEqual([read.priceKzt, read.freeLessonsCount], [1, 50]);
  });
}
