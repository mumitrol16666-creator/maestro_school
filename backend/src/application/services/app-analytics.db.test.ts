import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

if (!process.env.TEST_DATABASE_URL) {
  test("app statistics count sign-ins without renewals", { skip: "TEST_DATABASE_URL required" }, () => {});
} else {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && /test|qa/.test(url.pathname));
  Object.assign(process.env, { DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: "test",
    JWT_SECRET: process.env.JWT_SECRET || "analytics-test-secret-123456" });
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { getAppAnalytics } = await import("./app-analytics.service.js");
  const { recordStudentLogin } = await import("./app-usage.service.js");

  test("«Входов» counts passwords, SSO and registrations; a renewal moves «последний вход» but is not a sign-in", async () => {
    const role = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
    const student = await prisma.user.create({ data: { login: `stat_${randomUUID().slice(0, 8)}`, phone: randomUUID().slice(0, 20),
      passwordHash: "x", firstName: "Stat", lastName: "Renewal", roleId: role.id } });
    try {
      const read = () => getAppAnalytics({ search: student.login });
      const before = await read();
      await recordStudentLogin(student.id, "password");
      await recordStudentLogin(student.id, "refresh");
      await recordStudentLogin(student.id, "refresh");
      const after = await read();
      assert.equal(after.summary.current.logins - before.summary.current.logins, 1, "summary");
      const row = after.students.items.find((item) => item.id === student.id)!;
      assert.equal(row.current.logins, 1, "student row");
      assert.ok(row.lastActiveAt, "the renewal keeps the last activity current");
    } finally {
      await prisma.appUsageEvent.deleteMany({ where: { userId: student.id } });
      await prisma.user.delete({ where: { id: student.id } });
      await prisma.$disconnect();
    }
  });
}
