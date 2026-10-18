import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.FEATURE_REWARD_ECONOMY_V2 = "true";
process.env.PRODUCT_V2_CUTOVER_AT = "2026-09-01T09:29:00.000Z";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

integrationTest("a lesson held before the cutover and approved after it is finalized with legacy rewards", async t => {
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { finalizeOfflineLessonApproval } = await import("./offline-lesson-finalization.service.js");
  const suffix = randomUUID().slice(0, 8);
  const crmClassId = `legacy-approval-${suffix}`;
  const crmStudentId = `crm-legacy-${suffix}`;
  const role = await prisma.role.upsert({ where: { slug: "student" }, create: { slug: "student", name: "student" }, update: {} });
  const student = await prisma.user.create({
    data: {
      login: `legacy_${suffix}`,
      phone: `+7702${suffix.replace(/\D/g, "").padEnd(7, "3").slice(0, 7)}`,
      passwordHash: "x",
      firstName: "Легаси",
      lastName: suffix,
      roleId: role.id,
      crmStudentId,
    },
  });
  await prisma.offlineLessonStudentCheck.create({
    data: { crmClassId, crmStudentId, attendanceStatus: "present", homeworkStatus: "completed", lessonPoints: 50 },
  });
  t.after(async () => {
    await prisma.offlineLessonStudentCheck.deleteMany({ where: { crmClassId } });
    await prisma.maestroCoinTransaction.deleteMany({ where: { studentId: student.id } });
    await prisma.studentCoinBalance.deleteMany({ where: { studentId: student.id } });
    await prisma.pointsTransaction.deleteMany({ where: { studentId: student.id } });
    await prisma.leagueXpEvent.deleteMany({ where: { studentId: student.id } });
    await prisma.userNotification.deleteMany({ where: { userId: student.id } });
    await prisma.user.delete({ where: { id: student.id } });
  });

  const result = await finalizeOfflineLessonApproval({
    crmClassId,
    approvedBy: student.id,
    learningResultsV2: null,
    lesson: { id: crmClassId, date: "2026-08-20", startTime: "10:00", classType: "individual" } as never,
  });
  assert.deepEqual(result.attendance, [{ crmStudentId, points: 50, coins: 1, xp: 20, planTopics: 0 }]);

  const check = await prisma.offlineLessonStudentCheck.findFirstOrThrow({ where: { crmClassId } });
  assert.ok(check.rewardsAppliedAt, "the check is marked as rewarded");
  const xp = await prisma.leagueXpEvent.findUniqueOrThrow({ where: { sourceKey: `offline-lesson:${crmClassId}:${crmStudentId}` } });
  assert.equal(xp.economicEpochId, null, "legacy XP stays outside the epoch");
  assert.equal(xp.createdAt.toISOString().slice(0, 10), "2026-08-20");
  const points = await prisma.pointsTransaction.findFirst({ where: { studentId: student.id } });
  assert.equal(points?.amount, 50);
  assert.equal(points?.createdAt.toISOString().slice(0, 10), "2026-08-20");
  const coins = await prisma.maestroCoinTransaction.findUnique({ where: { sourceKey: `offline-lesson:${crmClassId}:${crmStudentId}` } });
  assert.equal(coins?.amount, 1);

  // Replay is harmless: nothing left to award.
  const replay = await finalizeOfflineLessonApproval({
    crmClassId,
    approvedBy: student.id,
    learningResultsV2: null,
    lesson: { id: crmClassId, date: "2026-08-20", startTime: "10:00", classType: "individual" } as never,
  });
  assert.deepEqual(replay.attendance, []);
});

integrationTest("manual legacy Points are still refused for an action dated after the cutover", async () => {
  const { awardManualPoints } = await import("./points.service.js");
  await assert.rejects(
    awardManualPoints({ studentId: randomUUID(), amount: 10, reason: "test", awardedBy: randomUUID() }),
    (error: { code?: string }) => error.code === "LEGACY_MANUAL_POINTS_DISABLED",
  );
});
