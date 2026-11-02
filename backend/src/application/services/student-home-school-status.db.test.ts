import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.INTEGRATION_SERVICE_SECRET ??= "student-home-test-secret-1234";
process.env.CRM_API_URL ??= "http://127.0.0.1:9";
// Every home read goes to CRM, so a later outage is served from the server's copy, not the fresh window.
process.env.CRM_SUMMARY_CACHE_TTL_MS = "0";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

/**
 * Package 3 (В-18): the home tells a student the school has not linked yet from a school read
 * that failed because CRM is down and the server kept no copy, and both from a CRM refusal;
 * the shell shows «Нет связи со школой» only for the outage.
 */
integrationTest("the home names the school status: not linked, CRM down, CRM refusal, linked, the server's copy", async t => {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { getStudentHome } = await import("./student-home.service.js");

  const suffix = randomUUID().slice(0, 8);
  const digits = suffix.replace(/\D/g, "").padEnd(7, "4").slice(0, 7);
  const role = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  const student = (index: number, crmStudentId: string | null) => prisma.user.create({
    data: {
      login: `home_status_${index}_${suffix}`,
      phone: `+77${index}${digits}0`,
      passwordHash: "x",
      firstName: "Ученик",
      lastName: suffix,
      roleId: role.id,
      crmStudentId,
      externalLinkStatus: crmStudentId ? "linked" : "pending",
    },
  });
  const unlinked = await student(1, null);
  const down = await student(2, `crm-home-down-${suffix}`);
  const refused = await student(3, `crm-home-refused-${suffix}`);
  const linked = await student(4, `crm-home-up-${suffix}`);
  t.after(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [unlinked.id, down.id, refused.id, linked.id] } } });
    await prisma.$disconnect();
  });

  let crmUp = true;
  const crmCalls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    crmCalls.push(new URL(url).pathname);
    if (!crmUp || url.includes(`/students/${down.crmStudentId}/`)) throw new TypeError("fetch failed");
    if (url.includes(`/students/${refused.crmStudentId}/`)) {
      return new Response(JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "Student not found" } }), { status: 404, headers: { "Content-Type": "application/json" } });
    }
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

  // CRM answered, but refused: that is not «нет связи».
  const refusedHome = await getStudentHome(refused.id);
  assert.equal(refusedHome.schoolStatus, "failed");
  assert.equal(refusedHome.school, null);

  const linkedHome = await getStudentHome(linked.id);
  assert.equal(linkedHome.schoolStatus, "linked");
  assert.equal((linkedHome.school as { crmStale?: boolean } | null)?.crmStale, false);

  // CRM goes down after a good read: the server's copy keeps the schedule, marked as a copy.
  crmUp = false;
  const copyHome = await getStudentHome(linked.id);
  assert.equal(copyHome.schoolStatus, "linked");
  assert.equal((copyHome.school as { crmStale?: boolean } | null)?.crmStale, true);
});
