import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.INTEGRATION_SERVICE_SECRET ??= "student-home-test-secret-1234";
process.env.CRM_API_URL ??= "http://127.0.0.1:9";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

/**
 * Package 3 (В-18): the home tells a student the school has not linked yet from a school read
 * that failed because CRM is down and the server kept no copy; the shell shows the strip only then.
 */
integrationTest("the home names the school status: not linked, CRM down without a copy, linked", async t => {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { getStudentHome } = await import("./student-home.service.js");

  const suffix = randomUUID().slice(0, 8);
  const digits = suffix.replace(/\D/g, "").padEnd(7, "4").slice(0, 7);
  const role = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  const student = (key: string, crmStudentId: string | null) => prisma.user.create({
    data: {
      login: `home_status_${key}_${suffix}`,
      phone: `+77${key === "unlinked" ? "1" : key === "down" ? "2" : "3"}${digits}0`,
      passwordHash: "x",
      firstName: "Ученик",
      lastName: suffix,
      roleId: role.id,
      crmStudentId,
      externalLinkStatus: crmStudentId ? "linked" : "pending",
    },
  });
  const unlinked = await student("unlinked", null);
  const down = await student("down", `crm-home-down-${suffix}`);
  const linked = await student("linked", `crm-home-up-${suffix}`);
  t.after(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [unlinked.id, down.id, linked.id] } } });
    await prisma.$disconnect();
  });

  const crmCalls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    crmCalls.push(new URL(url).pathname);
    // CRM is down for the second student only; the third one gets an ordinary summary.
    if (url.includes(`/students/${down.crmStudentId}/`)) throw new TypeError("fetch failed");
    const body = url.includes(`/students/${linked.crmStudentId}/offline-summary`)
      ? { profile: { groups: [] }, upcomingLessons: [], lessonHistory: [] }
      : {};
    return new Response(JSON.stringify({ success: true, data: body }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const notLinkedHome = await getStudentHome(unlinked.id);
  assert.equal(notLinkedHome.schoolStatus, "not_linked");
  assert.equal(notLinkedHome.school, null);

  const downHome = await getStudentHome(down.id);
  assert.equal(downHome.schoolStatus, "unavailable");
  assert.equal(downHome.school, null);
  assert.ok(crmCalls.some(path => path.includes(`/students/${down.crmStudentId}/offline-summary`)), "the school read went to CRM");

  const linkedHome = await getStudentHome(linked.id);
  assert.equal(linkedHome.schoolStatus, "linked");
  assert.notEqual(linkedHome.school, null);
});
