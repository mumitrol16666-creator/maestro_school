import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.INTEGRATION_SERVICE_SECRET ??= "parent-links-test-secret-1234";
process.env.CRM_API_URL ??= "http://127.0.0.1:9";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

/**
 * Plans 3.4 and 3.6: linking a parent opens their dialog with the child's teacher at once,
 * unlinking takes them out of it and tells CRM, archiving the student ends family access.
 */
integrationTest("a parent's teacher dialog follows the link; revoking tells CRM; archiving the student ends family access", async t => {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { productFeatureConfig } = await import("../../config/product-features.js");
  const { resetTeacherSubstitutionRefresh } = await import("./teacher-substitution.service.js");
  resetTeacherSubstitutionRefresh();
  const previous = productFeatureConfig.flags.learningDialogsV2;
  productFeatureConfig.flags.learningDialogsV2 = true;
  t.after(() => { productFeatureConfig.flags.learningDialogsV2 = previous; });

  const suffix = randomUUID().slice(0, 8);
  const digits = suffix.replace(/\D/g, "").padEnd(7, "8").slice(0, 7);
  const crmStudentId = `crm-plink-${suffix}`;
  const crmTeacherId = `crm-plink-t-${suffix}`;
  const crmDirectionId = `crm-dir-plink-${suffix}`;
  const roles = Object.fromEntries(await Promise.all(["student", "teacher", "parent"].map(async (slug) => [
    slug, (await prisma.role.upsert({ where: { slug }, create: { slug, name: slug }, update: {} })).id,
  ])));
  const direction = await prisma.direction.create({
    data: { title: `Гитара ${suffix}`, slug: `plink-${suffix}`, isPublished: true, crmDirectionId, crmIsActive: true },
  });
  const student = await prisma.user.create({
    data: { login: `plink_s_${suffix}`, phone: `+7771${digits}`, passwordHash: "x", firstName: "Ученик", lastName: suffix, roleId: roles.student, crmStudentId, externalLinkStatus: "linked" },
  });
  const teacher = await prisma.user.create({
    data: { login: `plink_t_${suffix}`, phone: `+7772${digits}`, passwordHash: "x", firstName: "Учитель", lastName: suffix, roleId: roles.teacher, crmTeacherId, externalLinkStatus: "linked" },
  });
  const revokedCalls: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    let body: unknown = {};
    if (url.includes("/family/parent-link-revoked")) {
      revokedCalls.push(JSON.parse(String(init?.body ?? "{}")));
      body = { enrollments: 1, reopened: 1 };
    } else if (url.includes("/directions")) {
      body = { directions: [{ crmDirectionId, title: direction.title, isActive: true, updatedAt: "2026-01-01T00:00:00.000Z" }] };
    } else if (url.includes(`/students/${crmStudentId}/teachers`)) {
      body = { crmStudentId, teachers: [{ crmTeacherId, name: "Учитель", directions: [direction.title], sources: ["assigned"] }] };
    } else if (url.includes(`/teachers/${crmTeacherId}/students`)) {
      body = { teacher: { crmTeacherId, name: "Учитель", directions: [direction.title] },
        students: [{ crmStudentId, name: "Ученик", firstName: "Ученик", lastName: suffix, phone: "+7", accountBalance: 0, directions: [direction.title], assignedDirectly: true, groups: [], schedules: [], attendanceHistory: [], memberships: [] }] };
    } else if (url.includes(`/teachers/${crmTeacherId}/groups`)) {
      body = { teacher: { crmTeacherId, name: "Учитель", directions: [direction.title] }, groups: [] };
    } else if (url.includes("/offline-classes")) {
      body = { classes: [] };
    }
    return new Response(JSON.stringify({ success: true, data: body }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const family = await import("./family.service.js");
  const link = await family.createParentForStudent({
    studentId: student.id, actorId: teacher.id, firstName: "Мама", lastName: suffix, phone: `+7773${digits}`,
    login: `plink_p_${suffix}`, password: "Parent-2026!", relationship: "mother",
  });
  const parentId = link.parent.id;
  t.after(async () => {
    const conversations = await prisma.learningConversation.findMany({ where: { context: { path: ["studentUserId"], equals: student.id } }, select: { id: true } });
    await prisma.learningConversation.deleteMany({ where: { id: { in: conversations.map((item) => item.id) } } });
    await prisma.learningConversation.deleteMany({ where: { members: { some: { userId: teacher.id } } } });
    await prisma.parentStudentLink.deleteMany({ where: { studentUserId: student.id } });
    await prisma.user.deleteMany({ where: { id: { in: [student.id, teacher.id, parentId] } } });
    await prisma.direction.delete({ where: { id: direction.id } });
  });

  const parentDialog = () => prisma.learningConversation.findFirst({
    where: { type: "parent_teacher", context: { path: ["studentUserId"], equals: student.id } },
    include: { members: true },
  });
  let dialog = await parentDialog();
  assert.ok(dialog, "the dialog exists as soon as the parent is linked, before the teacher opens the mailbox");
  assert.equal(dialog?.status, "active");
  assert.ok(dialog?.members.some((member) => member.userId === parentId && !member.leftAt));
  assert.ok(dialog?.members.some((member) => member.userId === teacher.id && !member.leftAt));

  const revoked = await family.revokeParentLink({ studentId: student.id, linkId: link.linkId, actorId: teacher.id });
  assert.equal(revoked.crmNotified, true);
  assert.deepEqual(revokedCalls, [{ crmStudentId, parentUserId: parentId }]);
  dialog = await parentDialog();
  assert.equal(dialog?.members.some((member) => member.userId === parentId && !member.leftAt && dialog?.status === "active"), false,
    "an unlinked parent is out of the active dialog");

  await family.linkExistingParentToStudent({ studentId: student.id, actorId: teacher.id, login: `plink_p_${suffix}`, relationship: "mother" });
  dialog = await parentDialog();
  assert.equal(dialog?.status, "active");
  assert.ok(dialog?.members.some((member) => member.userId === parentId && !member.leftAt), "linking again brings the parent back");

  const { archiveStudentAccess } = await import("./student-access-archive.service.js");
  await archiveStudentAccess({ appUserId: student.id, crmStudentId });
  const links = await prisma.parentStudentLink.findMany({ where: { studentUserId: student.id } });
  assert.ok(links.every((item) => !item.isActive && item.revokedAt), "archiving the student revokes every parent link");
  dialog = await parentDialog();
  assert.equal(dialog?.status, "read_only", "the dialog stays as read-only history");
});
