import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Sliding sessions (document 20, V-41): a student stays signed in for 30 days and every
// visit renews it; password change, disabling and archiving still end the session at once.
if (!process.env.TEST_DATABASE_URL) {
  test("session lifetime and refresh HTTP + PostgreSQL", { skip: "TEST_DATABASE_URL required" }, () => {});
} else {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && /test|qa/.test(url.pathname));
  Object.assign(process.env, { DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: "test",
    AUTH_LOGIN_RATE_LIMIT_MAX: "1000", CRM_SESSION_CACHE_TTL_MS: "0", CRM_SESSION_STALE_MAX_AGE_MS: "0",
    JWT_SECRET: "platform-lifetime-test-secret", INTEGRATION_SERVICE_SECRET: "platform-integration-test-secret",
    INTEGRATION_SSO_SECRET: "platform-bridge-test-secret", CRM_API_URL: "http://127.0.0.1:9" });
  const { default: Fastify } = await import("fastify");
  const { default: fastifyJwt } = await import("@fastify/jwt");
  const { default: rateLimit } = await import("@fastify/rate-limit");
  const { default: jwt } = await import("jsonwebtoken");
  const { default: bcrypt } = await import("bcryptjs");
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { authenticate } = await import("./auth.guards.js");
  const { authRoutes } = await import("../routes/auth.routes.js");
  const { archiveStudentAccess } = await import("../../application/services/student-access-archive.service.js");
  const { errorHandler } = await import("../middleware/error-handler.js");
  const app = Fastify();
  const users: string[] = [];
  // Lets a test change the account between authenticate and the refresh handler.
  let betweenAuthAndHandler: (() => Promise<void>) | null = null;
  const DAY = 86400;
  const makeUser = async (roleSlug: string, extra: Record<string, unknown> = {}) => {
    const role = await prisma.role.upsert({ where: { slug: roleSlug }, create: { slug: roleSlug, name: roleSlug }, update: {} });
    const user = await prisma.user.create({ data: { login: `life_${randomUUID().slice(0, 8)}`, phone: randomUUID().slice(0, 20),
      passwordHash: await bcrypt.hash("previous-password", 4), firstName: "Life", lastName: "Test", roleId: role.id, ...extra,
    }, include: { role: true } });
    users.push(user.id);
    return user;
  };
  test.before(async () => {
    await app.register(fastifyJwt, { secret: process.env.JWT_SECRET!, sign: { expiresIn: "7d" } });
    await app.register(rateLimit, { global: false });
    app.setErrorHandler(errorHandler);
    app.addHook("onRoute", (route) => {
      if (route.url === "/api/auth/refresh" && route.method === "POST") {
        const existing = Array.isArray(route.preHandler) ? route.preHandler : route.preHandler ? [route.preHandler] : [];
        route.preHandler = [...existing, async () => { if (betweenAuthAndHandler) await betweenAuthAndHandler(); }] as typeof route.preHandler;
      }
    });
    await app.register(authRoutes, { prefix: "/api" });
    app.get("/protected", { preHandler: authenticate }, async request => ({ id: request.user!.id }));
    await app.ready();
  });
  test.after(async () => {
    await app.close();
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });
  const get = (token: string) => app.inject({ method: "GET", url: "/protected", headers: { authorization: `Bearer ${token}` } });
  const refresh = (token?: string) => app.inject({ method: "POST", url: "/api/auth/refresh",
    headers: token ? { authorization: `Bearer ${token}` } : {} });
  const login = (user: { login: string }) => app.inject({ method: "POST", url: "/api/auth/login",
    payload: { phone: user.login, password: "previous-password" } });
  const cookieMaxAge = (response: { headers: Record<string, unknown> }) =>
    Number(/Max-Age=(\d+)/.exec(String(response.headers["set-cookie"] ?? ""))?.[1]);
  const claimsOf = (token: string) => jwt.decode(token) as { iat: number; exp: number; sessionVersion: number; role: string; crmSessionVersion?: number };
  // A token as if it was issued `days` ago, with no exp: only the iat bound can reject it.
  const issuedDaysAgo = (userId: string, sessionVersion: number, days: number) =>
    jwt.sign({ sub: userId, sessionVersion, iat: Math.floor(Date.now() / 1000) - Math.round(days * DAY) }, process.env.JWT_SECRET!);

  test("student session lasts 30 days, other roles 7; the media cookie has the same term", async () => {
    for (const [roleSlug, days] of [["student", 30], ["parent", 7], ["admin", 7]] as const) {
      const user = await makeUser(roleSlug);
      const result = await login(user);
      assert.equal(result.statusCode, 200, result.body);
      const claims = claimsOf(result.json().data.token);
      assert.equal(claims.exp - claims.iat, days * DAY, roleSlug);
      assert.equal(cookieMaxAge(result), days * DAY, `${roleSlug} cookie`);
    }
  });

  test("a student token 20 days old is accepted, 31 days old is not; other roles stop after 7 days", async () => {
    const student = await makeUser("student");
    assert.equal((await get(issuedDaysAgo(student.id, 0, 20))).statusCode, 200);
    assert.equal((await get(issuedDaysAgo(student.id, 0, 29))).statusCode, 200);
    assert.equal((await get(issuedDaysAgo(student.id, 0, 31))).statusCode, 401);
    assert.equal((await refresh(issuedDaysAgo(student.id, 0, 31))).statusCode, 401);
    // The same token with a 30-day exp counted from its old iat is gone by exp as well.
    const expired = app.jwt.sign({ sub: student.id, sessionVersion: 0, iat: Math.floor(Date.now() / 1000) - 31 * DAY }, { expiresIn: 30 * DAY });
    assert.equal((await get(expired)).statusCode, 401);
    for (const roleSlug of ["parent", "admin"]) {
      const user = await makeUser(roleSlug);
      assert.equal((await get(issuedDaysAgo(user.id, 0, 6))).statusCode, 200, roleSlug);
      assert.equal((await get(issuedDaysAgo(user.id, 0, 8))).statusCode, 401, roleSlug);
      assert.equal((await get(issuedDaysAgo(user.id, 0, 20))).statusCode, 401, roleSlug);
    }
  });

  test("refresh renews a student session for 30 days with a new iat, same claims and a matching cookie", async () => {
    const student = await makeUser("student");
    const old = app.jwt.sign({ sub: student.id, role: "student", sessionVersion: 0, iat: Math.floor(Date.now() / 1000) - 20 * DAY }, { expiresIn: 30 * DAY });
    assert.equal((await get(old)).statusCode, 200);
    const result = await refresh(old);
    assert.equal(result.statusCode, 200, result.body);
    const { token, user } = result.json().data;
    assert.equal(user.id, student.id);
    assert.equal(user.role, "student");
    const before = claimsOf(old), after = claimsOf(token);
    assert.ok(after.iat - before.iat >= 20 * DAY - 5, "new iat");
    assert.equal(after.exp - after.iat, 30 * DAY);
    assert.equal(after.sessionVersion, before.sessionVersion);
    assert.equal(after.role, "student");
    assert.equal(cookieMaxAge(result), 30 * DAY);
    assert.equal((await get(token)).statusCode, 200);
    // The new token is itself renewable, and a legacy token without exp is renewed into one with exp.
    const legacy = issuedDaysAgo(student.id, 0, 25);
    const renewed = await refresh(legacy);
    assert.equal(renewed.statusCode, 200, renewed.body);
    assert.equal(claimsOf(renewed.json().data.token).exp - claimsOf(renewed.json().data.token).iat, 30 * DAY);
  });

  test("refresh is for students only: parent, admin and a linked teacher get 403 and keep a hard 7 days", async t => {
    for (const roleSlug of ["parent", "admin"]) {
      const user = await makeUser(roleSlug);
      const token = (await login(user)).json().data.token;
      const result = await refresh(token);
      assert.equal(result.statusCode, 403, roleSlug);
      assert.match(result.json().error.message, /только ученикам/);
      assert.equal(result.headers["set-cookie"], undefined, "no cookie is set on a refused renewal");
      assert.equal((await get(token)).statusCode, 200, "the session itself is untouched");
    }
    const teacher = await makeUser("teacher", { crmTeacherId: randomUUID(), externalLinkStatus: "linked" });
    t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ success: true,
      data: { crmUserId: teacher.crmTeacherId, appUserId: teacher.id, role: "teacher", sessionVersion: 0 } }),
    { status: 200, headers: { "Content-Type": "application/json" } }));
    const session = (await login(teacher)).json().data.token;
    assert.equal((await refresh(session)).statusCode, 403);
    assert.equal((await refresh()).statusCode, 401);
    assert.equal((await refresh("not-a-token")).statusCode, 401);
  });

  test("the refresh limit counts per token, not per address", async () => {
    const [first, second] = [await makeUser("student"), await makeUser("student")];
    const firstToken = (await login(first)).json().data.token;
    const secondToken = (await login(second)).json().data.token;
    for (let i = 0; i < 30; i++) assert.equal((await refresh(firstToken)).statusCode, 200, `refresh ${i + 1}`);
    assert.equal((await refresh(firstToken)).statusCode, 429);
    assert.equal((await refresh(secondToken)).statusCode, 200, "another student on the same address is not limited");
  });

  test("a renewal is a student login event, but it is not counted as a new login in the statistics", async () => {
    const { REFRESH_LOGIN_EVENT_KEY_PREFIX } = await import("../../application/services/app-usage.service.js");
    const student = await makeUser("student");
    const token = (await login(student)).json().data.token;
    assert.equal((await refresh(token)).statusCode, 200);
    const events = await prisma.appUsageEvent.findMany({ where: { userId: student.id, eventType: "login" }, orderBy: { occurredAt: "asc" } });
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((event) => event.eventKey.startsWith(REFRESH_LOGIN_EVENT_KEY_PREFIX)), [false, true]);
    await prisma.appUsageEvent.deleteMany({ where: { userId: student.id } });
  });

  test("a password change between authenticate and the refresh handler does not mint a live token", async () => {
    const student = await makeUser("student");
    const old = (await login(student)).json().data.token;
    assert.equal(claimsOf(old).sessionVersion, 0);
    betweenAuthAndHandler = async () => {
      await prisma.user.update({ where: { id: student.id }, data: { passwordHash: await bcrypt.hash("new-password", 4) } });
    };
    let result;
    try { result = await refresh(old); } finally { betweenAuthAndHandler = null; }
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: student.id } })).sessionVersion, 1);
    assert.equal(result.statusCode, 401, result.body);
    assert.equal(result.headers["set-cookie"], undefined);
    assert.equal((await get(old)).statusCode, 401);
  });

  test("a token without sub, or a CRM bridge ticket, is not a session: 401 on requests and on refresh", async () => {
    await makeUser("student"); // an active user exists; an undefined id must not resolve to it
    const now = Math.floor(Date.now() / 1000);
    const secret = process.env.JWT_SECRET!;
    const noSub = jwt.sign({ sessionVersion: 0, iat: now }, secret);
    const bridgeShaped = jwt.sign({ purpose: "sso-bridge", sessionVersion: 0, iat: now }, secret);
    const emptySub = jwt.sign({ sub: "", sessionVersion: 0, iat: now }, secret);
    const withPurpose = jwt.sign({ sub: (await makeUser("student")).id, purpose: "sso-bridge", sessionVersion: 0, iat: now }, secret);
    for (const [name, token] of Object.entries({ noSub, bridgeShaped, emptySub, withPurpose })) {
      assert.equal((await get(token)).statusCode, 401, `${name} on a request`);
      assert.equal((await refresh(token)).statusCode, 401, `${name} on refresh`);
    }
    const { findUserWithRoleById } = await import("../../application/repositories/auth.repository.js");
    assert.equal(await findUserWithRoleById(undefined as unknown as string), null);
    assert.equal(await findUserWithRoleById(""), null);
  });

  test("password change ends the old session at once, including refresh", async () => {
    const student = await makeUser("student");
    const old = (await login(student)).json().data.token;
    const change = await app.inject({ method: "PATCH", url: "/api/auth/me/password", headers: { authorization: `Bearer ${old}` },
      payload: { currentPassword: "previous-password", newPassword: "replacement-password" } });
    assert.equal(change.statusCode, 200, change.body);
    const claims = claimsOf(change.json().data.token);
    assert.equal(claims.exp - claims.iat, 30 * DAY, "student keeps 30 days after a password change");
    assert.equal(cookieMaxAge(change), 30 * DAY);
    assert.equal((await get(old)).statusCode, 401);
    assert.equal((await refresh(old)).statusCode, 401);
    assert.equal((await get(change.json().data.token)).statusCode, 200);
    assert.equal((await refresh(change.json().data.token)).statusCode, 200);
  });

  test("a disabled student is out on the next request and on refresh; re-enabling does not bring the old token back", async () => {
    const student = await makeUser("student");
    const token = (await login(student)).json().data.token;
    assert.equal((await refresh(token)).statusCode, 200);
    await prisma.user.update({ where: { id: student.id }, data: { isActive: false } });
    assert.equal((await get(token)).statusCode, 401);
    assert.equal((await refresh(token)).statusCode, 401);
    await prisma.user.update({ where: { id: student.id }, data: { isActive: true } });
    assert.equal((await get(token)).statusCode, 401, "sessionVersion grew twice");
  });

  test("an archived student (CRM archive) is out on the next request and on refresh", async () => {
    const crmStudentId = randomUUID();
    const student = await makeUser("student", { crmStudentId, externalLinkStatus: "linked" });
    const token = (await login(student)).json().data.token;
    assert.equal((await get(token)).statusCode, 200);
    assert.equal((await refresh(token)).statusCode, 200);
    const archived = await archiveStudentAccess({ appUserId: student.id, crmStudentId });
    assert.equal(archived.archived, true);
    assert.equal((await get(token)).statusCode, 401);
    assert.equal((await refresh(token)).statusCode, 401);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    assert.equal(row.isActive, false);
    assert.ok(row.deletedAt);
    const again = await login(student);
    assert.equal(again.statusCode, 401, "the archived login no longer signs in");
  });

  test("unlinking the CRM card changes the account revision and ends the old student session", async () => {
    const student = await makeUser("student", { crmStudentId: randomUUID(), externalLinkStatus: "linked" });
    const signedIn = await login(student);
    assert.equal(signedIn.statusCode, 200, signedIn.body);
    const token = signedIn.json().data.token;
    await prisma.user.update({ where: { id: student.id }, data: { externalLinkStatus: "unlinked" } });
    assert.equal((await get(token)).statusCode, 401);
    assert.equal((await refresh(token)).statusCode, 401);
  });

  test("POST /auth/media-session renews the cookie for the remaining lifetime of the token", async () => {
    const student = await makeUser("student");
    const old = app.jwt.sign({ sub: student.id, role: "student", sessionVersion: 0, iat: Math.floor(Date.now() / 1000) - 20 * DAY }, { expiresIn: 30 * DAY });
    const result = await app.inject({ method: "POST", url: "/api/auth/media-session", headers: { authorization: `Bearer ${old}` } });
    assert.equal(result.statusCode, 200, result.body);
    const age = cookieMaxAge(result);
    assert.ok(age <= 10 * DAY && age >= 10 * DAY - 5, String(age));
  });
}
