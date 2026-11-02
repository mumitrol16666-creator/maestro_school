import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

if (!process.env.TEST_DATABASE_URL) {
  test("password changed in the app reaches CRM HTTP + PostgreSQL", { skip: "TEST_DATABASE_URL required" }, () => {});
} else {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && /test|qa/.test(url.pathname));
  Object.assign(process.env, { DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: "test",
    CRM_SESSION_CACHE_TTL_MS: "0", CRM_SESSION_STALE_MAX_AGE_MS: "0",
    JWT_SECRET: "app-password-change-test-secret", INTEGRATION_SERVICE_SECRET: "app-password-change-integration",
    CRM_API_URL: "http://127.0.0.1:9" });
  const { default: Fastify } = await import("fastify");
  const { default: fastifyJwt } = await import("@fastify/jwt");
  const { default: bcrypt } = await import("bcryptjs");
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { authRoutes } = await import("./auth.routes.js");
  const { integrationRoutes } = await import("./integration.routes.js");
  const { errorHandler } = await import("../middleware/error-handler.js");
  const app = Fastify();
  const users: string[] = [];
  const SECRET = process.env.INTEGRATION_SERVICE_SECRET!;

  const makeUser = async (slug: string, link: "student" | "teacher" | null) => {
    const role = await prisma.role.upsert({ where: { slug }, create: { slug, name: slug }, update: {} });
    const crmUserId = randomUUID();
    const user = await prisma.user.create({ data: { login: `apppass_${randomUUID().slice(0, 8)}`, phone: randomUUID().slice(0, 20),
      passwordHash: await bcrypt.hash("previous-password", 4), firstName: "App", lastName: "Password", roleId: role.id,
      ...(link === "student" ? { crmStudentId: crmUserId, externalLinkStatus: "linked" } : {}),
      ...(link === "teacher" ? { crmTeacherId: crmUserId, externalLinkStatus: "linked" } : {}),
    }, include: { role: true } });
    users.push(user.id);
    return { user, crmUserId };
  };
  type Sent = { url: string; body: Record<string, unknown> | null };
  // CRM answers the session check; the password notice either succeeds or fails.
  const fakeCrm = (t: { mock: { method: Function } }, user: { id: string; role: { slug: string } }, crmUserId: string, noticeFails = false) => {
    const sent: Sent[] = [];
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request, options?: RequestInit) => {
      const target = String(input);
      sent.push({ url: target, body: options?.body ? JSON.parse(String(options.body)) : null });
      if (target.includes("/password-changed-in-app")) {
        if (noticeFails) throw new Error("CRM offline");
        return new Response(JSON.stringify({ success: true, data: { cleared: true } }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, data: { crmUserId, appUserId: user.id, role: user.role.slug, sessionVersion: 0 } }), { status: 200 });
    });
    return sent;
  };
  const changeOwn = (userId: string, newPassword = "replacement-password") => app.inject({ method: "PATCH", url: "/api/auth/me/password",
    headers: { authorization: `Bearer ${app.jwt.sign({ sub: userId, sessionVersion: 0, crmSessionVersion: 0 })}` },
    payload: { currentPassword: "previous-password", newPassword } });
  const fromCrm = (method: "GET" | "POST", path: string, payload?: object) => app.inject({ method, url: `/api/integration/v1${path}`,
    headers: { authorization: `Bearer ${SECRET}`, "x-integration-system": "crm" }, payload });
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  test.before(async () => {
    await app.register(fastifyJwt, { secret: process.env.JWT_SECRET!, sign: { expiresIn: "7d" } });
    app.setErrorHandler(errorHandler);
    await app.register(authRoutes, { prefix: "/api" });
    await app.register(integrationRoutes, { prefix: "/api/integration/v1" });
    await app.ready();
  });
  test.after(async () => {
    await app.close();
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  test("a linked student's own change tells CRM the time, never the password, and CRM can read it back", async (t) => {
    const { user, crmUserId } = await makeUser("student", "student");
    const sent = fakeCrm(t, user, crmUserId);
    const result = await changeOwn(user.id, "my-own-secret-77");
    assert.equal(result.statusCode, 200, result.body);
    await settle();

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.ok(row.passwordChangedInAppAt instanceof Date);
    const notices = sent.filter((call) => call.url.endsWith("/api/integration/v1/users/password-changed-in-app"));
    assert.equal(notices.length, 1);
    assert.deepEqual(notices[0].body, { appUserId: user.id, crmUserId, changedAt: row.passwordChangedInAppAt!.toISOString() });
    assert.ok(!JSON.stringify(sent).includes("my-own-secret-77"));

    const state = await fromCrm("GET", `/users/${user.id}/session-state?crmUserId=${crmUserId}`);
    assert.equal(state.statusCode, 200, state.body);
    assert.equal(state.json().data.passwordChangedInAppAt, row.passwordChangedInAppAt!.toISOString());
  });

  test("CRM out of reach does not fail the change; the time stays for CRM to check later", async (t) => {
    const { user, crmUserId } = await makeUser("teacher", "teacher");
    const sent = fakeCrm(t, user, crmUserId, true);
    const result = await changeOwn(user.id);
    assert.equal(result.statusCode, 200, result.body);
    await settle();
    assert.equal(sent.filter((call) => call.url.includes("/password-changed-in-app")).length, 1);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(await bcrypt.compare("replacement-password", row.passwordHash), true);
    assert.ok(row.passwordChangedInAppAt);
  });

  test("an account without a CRM card sends nothing", async (t) => {
    const { user } = await makeUser("parent", null);
    const sent = fakeCrm(t, user, "");
    assert.equal((await changeOwn(user.id)).statusCode, 200);
    await settle();
    assert.equal(sent.length, 0);
  });

  test("a password CRM sets is not a change in the app; short or masked passwords are refused", async () => {
    const { user, crmUserId } = await makeUser("student", "student");
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    for (const password of ["1234567", "[скрыто]"]) {
      const refused = await fromCrm("POST", "/users/update-password", { crmStudentId: crmUserId, password });
      assert.equal(refused.statusCode, 400, `${password}: ${refused.body}`);
    }
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash, before.passwordHash);

    const set = await fromCrm("POST", "/users/update-password", { crmStudentId: crmUserId, password: "12345678" });
    assert.equal(set.statusCode, 200, set.body);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(await bcrypt.compare("12345678", row.passwordHash), true);
    assert.equal(row.passwordChangedInAppAt, null);
    const state = await fromCrm("GET", `/users/${user.id}/session-state?crmUserId=${crmUserId}`);
    assert.equal(state.json().data.passwordChangedInAppAt, null);
  });
}
