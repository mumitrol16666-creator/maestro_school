import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
if (!process.env.TEST_DATABASE_URL) {
  test("integration account boundaries HTTP + PostgreSQL", { skip: "TEST_DATABASE_URL required" }, () => {});
} else {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && /test|qa/.test(url.pathname));
  Object.assign(process.env, { DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: "test", JWT_SECRET: "boundary-session-test-secret", INTEGRATION_SERVICE_SECRET: "boundary-service-test" });
  const { default: Fastify } = await import("fastify");
  const { default: bcrypt } = await import("bcryptjs");
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { integrationRoutes } = await import("./integration.routes.js");
  const { errorHandler } = await import("../middleware/error-handler.js");
  const app = Fastify();
  const users: string[] = [];
  const makeUser = async (slug: string, crmStudentId?: string) => {
    const role = await prisma.role.upsert({ where: { slug }, create: { slug, name: slug }, update: {} });
    const user = await prisma.user.create({ data: { login: `boundary_${randomUUID().slice(0, 8)}`, firstName: "Boundary", lastName: "Test",
      phone: "77012345678", phoneNormalized: "77012345678", passwordHash: await bcrypt.hash("previous-password", 4), roleId: role.id, crmStudentId }, include: { role: true } });
    users.push(user.id); return user;
  };
  const post = (path: string, payload: object) => app.inject({ method: "POST", url: path,
    headers: { authorization: "Bearer boundary-service-test", "x-integration-system": "crm" }, payload });
  test.before(async () => { app.setErrorHandler(errorHandler); await app.register(integrationRoutes); await app.ready(); });
  test.after(async () => { await app.close(); await prisma.user.deleteMany({ where: { id: { in: users } } }); await prisma.$disconnect(); });
  test("student linking cannot target parent or staff, even force; selected shared-phone student still links", async () => {
    for (const role of ["parent", "teacher", "admin", "owner", "curator"]) {
      const user = await makeUser(role);
      const result = await post("/users/link", { appUserId: user.id, crmStudentId: randomUUID(), phoneNormalized: user.phoneNormalized, force: true, crmRole: "student" });
      assert.equal(result.statusCode, 409, result.body);
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).crmStudentId, null);
    }
    const user = await makeUser("student"), crmStudentId = randomUUID();
    assert.equal((await post("/users/link", { appUserId: user.id, crmStudentId, phoneNormalized: user.phoneNormalized })).statusCode, 200);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).crmStudentId, crmStudentId);
    const missing = await post("/users/link", { appUserId: randomUUID(), crmStudentId: randomUUID(), phoneNormalized: "77012345678" });
    assert.equal(missing.statusCode, 400);
  });
  test("legacy wrong-role links cannot reset or provision a staff password; valid student reset revokes session", async () => {
    const crmStudentId = randomUUID(), staff = await makeUser("admin", crmStudentId);
    for (const payload of [{ crmStudentId }, { crmStudentId, appUserId: staff.id }, { appUserId: staff.id }]) {
      const response = await post("/users/update-password", { ...payload, password: "replacement-password" });
      assert.equal(response.statusCode, 409, response.body);
    }
    const provision = await post("/users/provision-student", { crmStudentId, phone: "77012345678", firstName: "Boundary", lastName: "Test", password: "replacement-password" });
    assert.equal(provision.statusCode, 409, provision.body);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: staff.id } })).passwordHash, staff.passwordHash);
    const student = await makeUser("student", randomUUID());
    const reset = await post("/users/update-password", { crmStudentId: student.crmStudentId, password: "replacement-password" });
    assert.equal(reset.statusCode, 200, reset.body);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    assert.equal(await bcrypt.compare("replacement-password", updated.passwordHash), true);
    assert.equal(updated.sessionVersion, student.sessionVersion + 1);
  });
  test("student identity cannot reset a teacher account by adding appUserId or mixing both kinds", async () => {
    const teacher = await makeUser("teacher");
    const crmTeacherId = randomUUID();
    await prisma.user.update({ where: { id: teacher.id }, data: { crmTeacherId } });
    assert.equal((await post("/users/update-password", { appUserId: teacher.id, crmStudentId: randomUUID(), password: "replacement-password" })).statusCode, 409);
    assert.equal((await post("/users/update-password", { crmTeacherId, crmStudentId: randomUUID(), password: "replacement-password" })).statusCode, 400);
    assert.equal((await post("/users/update-password", { crmTeacherId, password: "replacement-password" })).statusCode, 200);
  });
}
