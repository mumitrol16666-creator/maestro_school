import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

if (!process.env.TEST_DATABASE_URL) {
  test("platform session revocation HTTP + PostgreSQL", { skip: "TEST_DATABASE_URL required" }, () => {});
} else {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && /test|qa/.test(url.pathname));
  Object.assign(process.env, { DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: "test",
    CRM_SESSION_CACHE_TTL_MS: "0", CRM_SESSION_STALE_MAX_AGE_MS: "0",
    JWT_SECRET: "platform-session-test-secret", INTEGRATION_SERVICE_SECRET: "platform-integration-test-secret",
    INTEGRATION_SSO_SECRET: "platform-bridge-test-secret", CRM_API_URL: "http://127.0.0.1:9" });
  const { default: Fastify } = await import("fastify");
  const { default: fastifyJwt } = await import("@fastify/jwt");
  const { default: jwt } = await import("jsonwebtoken");
  const { default: bcrypt } = await import("bcryptjs");
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { authenticate, optionalAuthenticate } = await import("./auth.guards.js");
  const { authRoutes } = await import("../routes/auth.routes.js");
  const { integrationRoutes } = await import("../routes/integration.routes.js");
  const { errorHandler } = await import("../middleware/error-handler.js");
  const app = Fastify();
  const users: string[] = [];
  const makeUser = async (roleSlug = "parent", linked = false) => {
    const role = await prisma.role.upsert({ where: { slug: roleSlug }, create: { slug: roleSlug, name: roleSlug }, update: {} });
    const user = await prisma.user.create({ data: { login: `session_${randomUUID().slice(0, 8)}`, phone: randomUUID().slice(0, 20),
      passwordHash: await bcrypt.hash("previous-password", 4), firstName: "Session", lastName: "Test", roleId: role.id,
      ...(linked ? { crmTeacherId: randomUUID(), externalLinkStatus: "linked" } : {}),
    }, include: { role: true } });
    users.push(user.id);
    return user;
  };
  test.before(async () => {
    await app.register(fastifyJwt, { secret: process.env.JWT_SECRET!, sign: { expiresIn: "7d" } });
    app.setErrorHandler(errorHandler);
    await app.register(authRoutes, { prefix: "/api" });
    await app.register(integrationRoutes, { prefix: "/api/integration/v1" });
    app.get("/protected", { preHandler: authenticate }, async request => ({ id: request.user!.id }));
    app.get("/optional", { preHandler: optionalAuthenticate }, async request => ({ id: request.user?.id || null }));
    await app.ready();
  });
  test.after(async () => {
    await app.close();
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });
  const get = (token: string, path = "/protected") => app.inject({ method: "GET", url: path, headers: { authorization: `Bearer ${token}` } });

  test("password change renews this session and invalidates old and optional sessions", async () => {
    const user = await makeUser();
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { phone: user.login, password: "previous-password" } });
    assert.equal(login.statusCode, 200, login.body);
    const old = login.json().data.token;
    assert.equal((await get(old)).statusCode, 200);
    const claims = jwt.decode(old) as { exp: number; iat: number; sessionVersion: number };
    assert.equal(claims.exp - claims.iat, 7 * 86400);
    assert.equal(claims.sessionVersion, 0);
    const change = await app.inject({ method: "PATCH", url: "/api/auth/me/password", headers: { authorization: `Bearer ${old}` },
      payload: { currentPassword: "previous-password", newPassword: "replacement-password" } });
    assert.equal(change.statusCode, 200, change.body);
    assert.equal((await get(old)).statusCode, 401);
    assert.equal((await get(old, "/optional")).json().id, null);
    assert.equal((await get(change.json().data.token)).statusCode, 200);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(updated.sessionVersion, 1);
    assert.equal(await bcrypt.compare("replacement-password", updated.passwordHash), true);
  });

  test("legacy JWTs have a bounded lifetime; inactive, restored and malformed sessions are rejected", async () => {
    const user = await makeUser();
    const legacy = jwt.sign({ sub: user.id }, process.env.JWT_SECRET!);
    assert.equal((await get(legacy)).statusCode, 200);
    assert.equal((await get(jwt.sign({ sub: user.id, iat: Math.floor(Date.now() / 1000) - 8 * 86400 }, process.env.JWT_SECRET!))).statusCode, 401);
    for (const sessionVersion of [null, "0", -1, 0.5, {}]) {
      assert.equal((await get(app.jwt.sign({ sub: user.id, sessionVersion }))).statusCode, 401);
    }
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    assert.equal((await get(legacy)).statusCode, 401);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
    assert.equal((await get(legacy)).statusCode, 401);
    const fresh = app.jwt.sign({ sub: user.id, sessionVersion: 2 });
    assert.equal((await get(fresh)).statusCode, 200);
    await prisma.$executeRaw`UPDATE users SET password_hash = 'administrative-reset' WHERE id = ${user.id}::uuid`;
    assert.equal((await get(fresh)).statusCode, 401);
    await assert.rejects(prisma.user.update({ where: { id: user.id }, data: { sessionVersion: 0 } }));
  });

  test("linked teacher revocation in CRM blocks ordinary sessions and both SSO exchange endpoints", async t => {
    const user = await makeUser("teacher", true);
    let crmVersion = 0, disabled = false, unavailable = false;
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request, options?: RequestInit) => {
      assert.match(String(input), new RegExp(`/users/${user.crmTeacherId}/session-state`));
      assert.equal((options?.headers as Record<string, string>).Authorization, `Bearer ${process.env.INTEGRATION_SERVICE_SECRET}`);
      if (unavailable) throw new Error("CRM offline");
      return new Response(JSON.stringify(disabled ? { success: false, error: "disabled" } : { success: true,
        data: { crmUserId: user.crmTeacherId, appUserId: user.id, role: "teacher", sessionVersion: crmVersion } }),
      { status: disabled ? 401 : 200, headers: { "Content-Type": "application/json" } });
    });
    const bridge = () => jwt.sign({ purpose: "sso-bridge", crmStudentId: user.crmTeacherId, appUserId: user.id,
      role: "teacher", sessionVersion: 0, crmSessionVersion: 0 }, process.env.INTEGRATION_SSO_SECRET!, { expiresIn: 300 });
    const token = bridge();
    const exchange = (integration = false, bridgeToken = token) => app.inject({ method: "POST",
      url: integration ? "/api/integration/v1/auth/sso-exchange" : "/api/auth/sso-exchange",
      headers: integration ? { authorization: `Bearer ${process.env.INTEGRATION_SERVICE_SECRET}`, "x-integration-system": "crm" } : {},
      payload: { token: bridgeToken } });
    const initial = await exchange();
    assert.equal(initial.statusCode, 200, initial.body);
    const session = initial.json().data.token;
    assert.equal((await get(session)).statusCode, 200);
    assert.equal((await exchange(true)).statusCode, 200);
    disabled = true;
    assert.equal((await get(session)).statusCode, 401);
    assert.equal((await exchange()).statusCode, 401);
    disabled = false; crmVersion = 2;
    assert.equal((await get(session)).statusCode, 401);
    assert.equal((await exchange(true)).statusCode, 401);
    crmVersion = 0;
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: "local-reset" } });
    assert.equal((await exchange()).statusCode, 401);
    assert.equal((await exchange(true)).statusCode, 401);
    unavailable = true;
    const fresh = app.jwt.sign({ sub: user.id, sessionVersion: 1, crmSessionVersion: 0 });
    assert.equal((await get(fresh)).statusCode, 502);
  });

  test("registration returns a usable session after linking; school enrollment does not own online student access", async t => {
    await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
      calls++;
      assert.match(String(input), /users\/sync-from-app$/);
      return new Response(JSON.stringify({ success: true, data: { crmStudentId: randomUUID() } }), { status: 200 });
    });
    const result = await app.inject({ method: "POST", url: "/api/auth/register", payload: {
      phone: `77${String(Date.now()).slice(-9)}`, firstName: "Session", lastName: "Registration",
      password: "registration-password", login: `test_${randomUUID().slice(0, 8)}`,
    } });
    assert.equal(result.statusCode, 201, result.body);
    users.push(result.json().data.user.id);
    const token = result.json().data.token;
    assert.equal((jwt.decode(token) as { sessionVersion: number }).sessionVersion, 1);
    assert.equal((await get(token)).statusCode, 200);
    assert.equal(calls, 1);
  });

  test("a linked teacher promoted to curator can log in with a legacy student ID still present", async t => {
    let user = await makeUser("teacher", true);
    const role = await prisma.role.upsert({ where: { slug: "curator" }, create: { slug: "curator", name: "curator" }, update: {} });
    user = await prisma.user.update({ where: { id: user.id }, data: { roleId: role.id, crmStudentId: randomUUID() }, include: { role: true } });
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
      assert.match(String(input), new RegExp(`/users/${user.crmTeacherId}/session-state`));
      return new Response(JSON.stringify({ success: true, data: {
        crmUserId: user.crmTeacherId, appUserId: user.id, role: "teacher", sessionVersion: 0,
      } }), { status: 200 });
    });
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { phone: user.login, password: "previous-password" } });
    assert.equal(login.statusCode, 200, login.body);
    assert.equal(login.json().data.user.role, "curator");
    assert.equal((await get(login.json().data.token)).statusCode, 200);
    const state = await app.inject({ method: "GET", url: `/api/integration/v1/users/${user.id}/session-state?crmUserId=${user.crmTeacherId}`,
      headers: { authorization: `Bearer ${process.env.INTEGRATION_SERVICE_SECRET}`, "x-integration-system": "crm" } });
    assert.equal(state.statusCode, 200);
    const bridge = jwt.sign({ purpose: "sso-bridge", crmStudentId: user.crmTeacherId, appUserId: user.id,
      role: "teacher", sessionVersion: user.sessionVersion, crmSessionVersion: 0 }, process.env.INTEGRATION_SSO_SECRET!, { expiresIn: 300 });
    const exchange = await app.inject({ method: "POST", url: "/api/auth/sso-exchange", payload: { token: bridge } });
    assert.equal(exchange.statusCode, 200, exchange.body);
    assert.equal(exchange.json().data.user.role, "curator");
  });

  test("self password change has no fallible CRM request after the password commit", async t => {
    const user = await makeUser("teacher", true);
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
      calls++;
      if (calls > 1) throw new Error("CRM became unavailable");
      return new Response(JSON.stringify({ success: true, data: {
        crmUserId: user.crmTeacherId, appUserId: user.id, role: "teacher", sessionVersion: 0,
      } }), { status: 200 });
    });
    const old = app.jwt.sign({ sub: user.id, sessionVersion: 0, crmSessionVersion: 0 });
    const result = await app.inject({ method: "PATCH", url: "/api/auth/me/password", headers: { authorization: `Bearer ${old}` },
      payload: { currentPassword: "previous-password", newPassword: "replacement-password" } });
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(calls, 1);
    assert.ok(result.json().data.token);
    assert.equal((await get(old)).statusCode, 401);
    calls = 0;
    assert.equal((await get(result.json().data.token)).statusCode, 200);
  });
}
