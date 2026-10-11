import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
if (!process.env.TEST_DATABASE_URL) {
  test("CRM family enrollment HTTP + PostgreSQL", { skip: "TEST_DATABASE_URL required" }, () => {});
} else {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && /test|qa/.test(url.pathname));
  Object.assign(process.env, { DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: "test", JWT_SECRET: "family-tests-secret",
    INTEGRATION_SERVICE_SECRET: "family-integration-secret", INTEGRATION_SSO_SECRET: "family-sso-secret", CRM_API_URL: "http://127.0.0.1:9" });
  const { default: Fastify } = await import("fastify");
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { default: bcrypt } = await import("bcryptjs");
  const { integrationRoutes } = await import("../../presentation/routes/integration.routes.js");
  const { errorHandler } = await import("../../presentation/middleware/error-handler.js");
  const app = Fastify(); const users: string[] = []; const operations: string[] = [];
  const post = (path: string, payload: unknown, authorized = true) => app.inject({ method: "POST", url: `/api/integration/v1${path}`, payload,
    headers: authorized ? { authorization: "Bearer family-integration-secret", "x-integration-system": "crm" } : {} });
  const make = async (slug: string, crmStudentId?: string) => {
    const role = await prisma.role.upsert({ where: { slug }, create: { slug, name: slug }, update: {} });
    const user = await prisma.user.create({ data: { login: `qa_${randomUUID().slice(0, 8)}`, firstName: "Тест", lastName: "Семья", phone: "77770001122",
      phoneNormalized: "77770001122", passwordHash: await bcrypt.hash("original-password", 4), roleId: role.id, crmStudentId } });
    users.push(user.id); return user;
  };
  test.before(async () => { app.setErrorHandler(errorHandler); await app.register(integrationRoutes, { prefix: "/api/integration/v1" }); await app.ready();
    await prisma.role.upsert({ where: { slug: "parent" }, create: { slug: "parent", name: "parent" }, update: {} }); });
  test.after(async () => { await app.close(); await prisma.crmFamilyProvision.deleteMany({ where: { operationId: { in: operations } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } }); await prisma.$disconnect(); });
  test("parent create is durable across concurrent retries and never resets the password", async () => {
    const crmStudentId = randomUUID(); const student = await make("student", crmStudentId);
    const operationId = randomUUID(); operations.push(operationId);
    const payload = { crmStudentId, operationId, crmActorId: "crm-admin-one", mode: "create", login: `parent_${randomUUID().slice(0, 8)}`,
      firstName: "Родитель", lastName: "Семья", phone: "87770001122", password: "first-password", relationship: "mother", identityVerified: true };
    const [a, b] = await Promise.all([post("/family/parent", payload), post("/family/parent", { ...payload, crmActorId: "crm-admin-two", password: "must-not-reset" })]);
    assert.equal(a.statusCode, 200, a.body); assert.equal(b.statusCode, 200, b.body);
    const parentId = a.json().data.parent.id; users.push(parentId);
    assert.equal(parentId, b.json().data.parent.id); assert.notEqual(parentId, student.id);
    assert.equal(await prisma.parentStudentLink.count({ where: { parentUserId: parentId, studentUserId: student.id } }), 1);
    const parent = await prisma.user.findUniqueOrThrow({ where: { id: parentId } });
    const winnerPassword = a.json().data.created ? payload.password : "must-not-reset";
    assert.equal(await bcrypt.compare(winnerPassword, parent.passwordHash), true);
    const version = parent.sessionVersion;
    const replay = await post("/family/parent", { ...payload, password: "another-password" }); assert.equal(replay.statusCode, 200);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: parentId } })).sessionVersion, version);
    assert.equal((await post("/family/parent", { ...payload, firstName: "Someone else" })).statusCode, 409);
    const state = await app.inject({ method: "GET", url: `/api/integration/v1/family/${crmStudentId}`, headers: { authorization: "Bearer family-integration-secret", "x-integration-system": "crm" } });
    assert.equal(state.json().data.parents[0].id, parentId);
    const stranger = await make("student", randomUUID());
    assert.equal(await prisma.parentStudentLink.count({ where: { parentUserId: parentId, studentUserId: stranger.id } }), 0);
  });
  test("existing parent explicitly links to a second child; shared phone alone and staff roles never bind", async () => {
    const parent = await make("parent"); const child1 = await make("student", randomUUID()); const child2 = await make("student", randomUUID());
    const preview = await post("/family/parent-preview", { login: parent.login }); assert.equal(preview.statusCode, 200);
    for (const child of [child1, child2]) {
      const operationId = randomUUID(); operations.push(operationId);
      const body = { crmStudentId: child.crmStudentId, operationId, crmActorId: "admin", mode: "link", login: parent.login,
        parentUserId: parent.id, relationship: "father", identityVerified: true };
      assert.equal((await post("/family/parent", { ...body, identityVerified: false })).statusCode, 400);
      assert.equal((await post("/family/parent", { ...body, parentUserId: undefined })).statusCode, 409);
      const linked = await post("/family/parent", body); assert.equal(linked.statusCode, 200, linked.body);
      assert.equal((await post("/family/parent", body, false)).statusCode, 401);
    }
    assert.equal(await prisma.parentStudentLink.count({ where: { parentUserId: parent.id } }), 2);
    assert.equal(await bcrypt.compare("original-password", (await prisma.user.findUniqueOrThrow({ where: { id: parent.id } })).passwordHash), true);
    const teacher = await make("teacher"); assert.equal((await post("/family/parent-preview", { login: teacher.login })).statusCode, 404);
  });
  test("enrollment student retry preserves password while initial creation uses the supplied password", async () => {
    const crmStudentId = randomUUID();
    const body = { crmStudentId, firstName: "Separate", lastName: randomUUID(), phone: "77770003344", password: "student-password", preserveExistingPassword: true };
    const created = await post("/users/provision-student", body); assert.equal(created.statusCode, 201, created.body);
    const id = created.json().data.appUserId; users.push(id);
    const replay = await post("/users/provision-student", { ...body, password: "must-not-change" }); assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(await bcrypt.compare("student-password", (await prisma.user.findUniqueOrThrow({ where: { id } })).passwordHash), true);
  });
}
