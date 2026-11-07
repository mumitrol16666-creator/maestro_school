import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { prisma } from "../../infrastructure/database/prisma.js";
import { assertOfflineLessonReportNotSubmitted } from "./offline-lesson-report.service.js";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

// 02.11 (money review): «Отменить урок» marks everyone absent, so it is refused once the report left
// the editor — the lesson card can look open while CRM is down and the projection is stale.
integrationTest("a cancel is refused once the lesson report is sent, under review, approving or confirmed", async () => {
  const suffix = randomUUID().slice(0, 8);
  const author = randomUUID();
  const cases: Array<[string, string, Date | null, boolean]> = [
    ["editing", "editing", null, true],
    ["sent", "pending_sync", null, false],
    ["review", "pending_review", null, false],
    ["approving", "approving", null, false],
    ["conflict", "conflict", null, false],
    ["confirmed", "editing", new Date("2026-11-01T10:00:00.000Z"), false],
  ];
  const ids = cases.map(([name]) => `cancel-guard-${name}-${suffix}`);
  try {
    for (const [name, status, crmConfirmedAt] of cases) {
      const crmClassId = `cancel-guard-${name}-${suffix}`;
      await prisma.offlineLessonProjection.create({
        data: { crmClassId, status: "started", lessonPayload: { crmClassId, title: `Урок ${name}` } },
      });
      await prisma.offlineLessonReport.create({
        data: { crmClassId, authorUserId: author, status, currentVersion: 1, crmConfirmedAt },
      });
    }
    await assert.doesNotReject(assertOfflineLessonReportNotSubmitted(`cancel-guard-missing-${suffix}`), "no report = nothing sent yet");
    for (const [name, , crmConfirmedAt, allowed] of cases) {
      const crmClassId = `cancel-guard-${name}-${suffix}`;
      if (allowed) {
        await assert.doesNotReject(assertOfflineLessonReportNotSubmitted(crmClassId), name);
        continue;
      }
      await assert.rejects(assertOfflineLessonReportNotSubmitted(crmClassId), (error: any) => {
        assert.equal(error.code, "LESSON_REPORT_SUBMITTED", name);
        assert.equal(error.statusCode, 409);
        assert.match(error.message, crmConfirmedAt ? /подтверждён/ : /уже отправлен/);
        return true;
      });
    }
  } finally {
    await prisma.offlineLessonReport.deleteMany({ where: { crmClassId: { in: ids } } });
    await prisma.offlineLessonProjection.deleteMany({ where: { crmClassId: { in: ids } } });
  }
});
