import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Plan 1.14: summary and homework phrases — a teacher's own and the school's per direction.
if (!process.env.TEST_DATABASE_URL) {
  test("lesson templates HTTP + PostgreSQL", { skip: "TEST_DATABASE_URL required" }, () => {});
} else {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && /test|qa/.test(url.pathname));
  Object.assign(process.env, {
    DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: "test",
    JWT_SECRET: "lesson-templates-test-secret", INTEGRATION_SERVICE_SECRET: "lesson-templates-integration-secret",
    INTEGRATION_SSO_SECRET: "lesson-templates-bridge-secret", CRM_API_URL: "http://127.0.0.1:9",
  });
  const { default: Fastify } = await import("fastify");
  const { default: fastifyJwt } = await import("@fastify/jwt");
  const { default: bcrypt } = await import("bcryptjs");
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { authRoutes } = await import("./auth.routes.js");
  const { lessonTemplateRoutes } = await import("./lesson-template.routes.js");
  const { errorHandler } = await import("../middleware/error-handler.js");

  const app = Fastify();
  const suffix = randomUUID().slice(0, 8);
  const users: string[] = [];
  const direction = `DIR-${suffix}`;

  async function makeUser(slug: string, permissions: string[]) {
    const roleRow = await prisma.role.upsert({ where: { slug }, create: { slug, name: slug }, update: {} });
    for (const code of permissions) {
      const permission = await prisma.permission.upsert({ where: { code }, create: { code }, update: {} });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: roleRow.id, permissionId: permission.id } },
        create: { roleId: roleRow.id, permissionId: permission.id },
        update: {},
      });
    }
    const user = await prisma.user.create({ data: {
      login: `tpl_${slug}_${randomUUID().slice(0, 8)}`, phone: randomUUID().slice(0, 20),
      passwordHash: await bcrypt.hash("template-password", 4), firstName: "Шаблон", lastName: slug, roleId: roleRow.id,
    } });
    users.push(user.id);
    return user;
  }

  async function token(user: { login: string | null }) {
    const response = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { phone: user.login, password: "template-password" } });
    assert.equal(response.statusCode, 200, response.body);
    return { authorization: `Bearer ${response.json().data.token as string}` };
  }

  test.before(async () => {
    await app.register(fastifyJwt, { secret: process.env.JWT_SECRET!, sign: { expiresIn: "7d" } });
    app.setErrorHandler(errorHandler);
    await app.register(authRoutes, { prefix: "/api/v1" });
    await app.register(lessonTemplateRoutes, { prefix: "/api/v1" });
    await app.ready();
  });

  test.after(async () => {
    await app.close();
    await prisma.lessonTextTemplate.deleteMany({ where: { OR: [{ ownerId: { in: users } }, { text: { contains: suffix } }] } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  test("a teacher keeps own phrases, sees the school's for the lesson direction, and cannot edit the school's", async () => {
    const teacher = await makeUser("teacher", ["offline_school.read", "offline_school.write"]);
    const colleague = await makeUser("teacher", ["offline_school.read", "offline_school.write"]);
    const admin = await makeUser("admin", []);
    const teacherAuth = await token(teacher);
    const colleagueAuth = await token(colleague);
    const adminAuth = await token(admin);

    const own = await app.inject({ method: "POST", url: "/api/v1/teachers/me/lesson-templates", headers: teacherAuth,
      payload: { kind: "summary", text: `  Разобрали   бой ${suffix} ` } });
    assert.equal(own.statusCode, 201, own.body);
    assert.equal(own.json().data.text, `Разобрали бой ${suffix}`, "spaces are tidied");
    assert.equal(own.json().data.scope, "own");
    const again = await app.inject({ method: "POST", url: "/api/v1/teachers/me/lesson-templates", headers: teacherAuth,
      payload: { kind: "summary", text: `Разобрали бой ${suffix}` } });
    assert.equal(again.statusCode, 200);
    assert.equal(again.json().duplicate, true, "the same phrase stays one template");

    const forTeacher = await app.inject({ method: "POST", url: "/api/v1/admin/lesson-templates", headers: teacherAuth,
      payload: { kind: "homework", text: `Нельзя ${suffix}` } });
    assert.equal(forTeacher.statusCode, 403, "teachers do not edit the school's phrases");

    const guitar = await app.inject({ method: "POST", url: "/api/v1/admin/lesson-templates", headers: adminAuth,
      payload: { kind: "homework", text: `Аккорды 5 минут ${suffix}`, crmDirectionId: direction } });
    assert.equal(guitar.statusCode, 201, guitar.body);
    const shared = await app.inject({ method: "POST", url: "/api/v1/admin/lesson-templates", headers: adminAuth,
      payload: { kind: "summary", text: `Сыграли под метроном ${suffix}` } });
    const vocal = await app.inject({ method: "POST", url: "/api/v1/admin/lesson-templates", headers: adminAuth,
      payload: { kind: "summary", text: `Распевки ${suffix}`, crmDirectionId: `OTHER-${suffix}` } });
    assert.equal(vocal.statusCode, 201);

    const list = await app.inject({ method: "GET", url: `/api/v1/teachers/me/lesson-templates?crmDirectionId=${direction}`, headers: teacherAuth });
    assert.equal(list.statusCode, 200, list.body);
    const texts = (rows: Array<{ text: string }>) => rows.map((row) => row.text).filter((text) => text.includes(suffix));
    assert.deepEqual(texts(list.json().data.own), [`Разобрали бой ${suffix}`]);
    assert.deepEqual(texts(list.json().data.school).sort(), [`Аккорды 5 минут ${suffix}`, `Сыграли под метроном ${suffix}`].sort(),
      "the lesson direction and the shared phrases, not another direction's");
    const colleagueList = await app.inject({ method: "GET", url: `/api/v1/teachers/me/lesson-templates?crmDirectionId=${direction}`, headers: colleagueAuth });
    assert.deepEqual(texts(colleagueList.json().data.own), [], "own phrases are private");

    const foreign = await app.inject({ method: "DELETE", url: `/api/v1/teachers/me/lesson-templates/${own.json().data.id}`, headers: colleagueAuth });
    assert.equal(foreign.statusCode, 403);
    const schoolByTeacher = await app.inject({ method: "DELETE", url: `/api/v1/teachers/me/lesson-templates/${shared.json().data.id}`, headers: teacherAuth });
    assert.equal(schoolByTeacher.statusCode, 403, "a teacher cannot delete a school phrase");
    const removed = await app.inject({ method: "DELETE", url: `/api/v1/teachers/me/lesson-templates/${own.json().data.id}`, headers: teacherAuth });
    assert.equal(removed.statusCode, 200);

    const renamed = await app.inject({ method: "PATCH", url: `/api/v1/admin/lesson-templates/${guitar.json().data.id}`, headers: adminAuth,
      payload: { text: `Аккорды 10 минут ${suffix}`, crmDirectionId: null } });
    assert.equal(renamed.statusCode, 200, renamed.body);
    assert.equal(renamed.json().data.crmDirectionId, null);
    await app.inject({ method: "DELETE", url: `/api/v1/admin/lesson-templates/${shared.json().data.id}`, headers: adminAuth });
    const after = await app.inject({ method: "GET", url: `/api/v1/teachers/me/lesson-templates?crmDirectionId=${direction}`, headers: teacherAuth });
    assert.deepEqual(texts(after.json().data.own), []);
    assert.deepEqual(texts(after.json().data.school), [`Аккорды 10 минут ${suffix}`]);
  });
}
