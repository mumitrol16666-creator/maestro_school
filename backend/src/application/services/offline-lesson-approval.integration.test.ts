import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import {
  prepareOfflineLessonApproval,
  readOfflineLessonApprovedBy,
  readOfflineLessonLearningResultsV2,
} from "./offline-lesson-report.service.js";
import type { LearningLessonV2ResultsInput } from "./learning-lesson-v2.service.js";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1"
  ? test
  : test.skip;

type ApprovalFixture = Awaited<ReturnType<typeof createApprovalFixture>>;

const firstResults: LearningLessonV2ResultsInput = {
  homeworkDecisions: [{
    recipientId: "11111111-1111-4111-8111-111111111111",
    cycleNumber: 1,
    decision: "accepted",
  }],
  topicUpdates: [{
    topicId: "22222222-2222-4222-8222-222222222222",
    expectedPercent: 20,
    toPercent: 40,
    comment: "Стало увереннее",
  }],
};

const correctedResults: LearningLessonV2ResultsInput = {
  homeworkDecisions: [{
    recipientId: "11111111-1111-4111-8111-111111111111",
    cycleNumber: 1,
    decision: "revision",
    comment: "Повторить под метроном",
  }],
  topicUpdates: [{
    topicId: "22222222-2222-4222-8222-222222222222",
    expectedPercent: 20,
    toPercent: 60,
  }],
};

async function createApprovalFixture() {
  const suffix = randomUUID();
  const crmClassId = `approval-integration-${suffix}`;
  const authorUserId = randomUUID();
  const projection = await prisma.offlineLessonProjection.create({
    data: {
      crmClassId,
      crmTeacherId: `teacher-${suffix}`,
      status: "completed",
      lessonPayload: { id: crmClassId },
      rosterPayload: [],
      rosterVersion: "fixture-v1",
    },
  });
  const report = await prisma.offlineLessonReport.create({
    data: {
      crmClassId,
      authorUserId,
      status: "pending_review",
      currentVersion: 1,
    },
  });
  const version = await prisma.offlineLessonReportVersion.create({
    data: {
      reportId: report.id,
      version: 1,
      authorUserId,
      payload: { topic: "Ровный ритм" },
      attendancePayload: [],
      rosterVersion: projection.rosterVersion,
      state: "submitted",
      crmDeliveredAt: new Date(),
    },
  });
  return { crmClassId, report, version };
}

async function removeApprovalFixture(fixture: ApprovalFixture) {
  await prisma.crmOutboxEvent.deleteMany({
    where: { aggregateId: fixture.crmClassId },
  });
  await prisma.offlineLessonReport.delete({ where: { id: fixture.report.id } });
  await prisma.offlineLessonProjection.delete({
    where: { crmClassId: fixture.crmClassId },
  });
}

function readEventPayload(value: Prisma.JsonValue) {
  return value as unknown as {
    body: Record<string, unknown>;
    approvedBy: string;
  };
}

integrationTest(
  "parallel approvals with different payloads create one event and reject the loser",
  async (t) => {
    const fixture = await createApprovalFixture();
    t.after(() => removeApprovalFixture(fixture));

    const firstRequest = {
      crmClassId: fixture.crmClassId,
      expectedVersion: 1,
      crmPayload: { attendance: "present", note: "Первый вариант" },
      learningResultsV2: firstResults,
      approvedBy: randomUUID(),
    };
    const secondRequest = {
      crmClassId: fixture.crmClassId,
      expectedVersion: 1,
      crmPayload: { attendance: "present", note: "Исправленный вариант" },
      learningResultsV2: correctedResults,
      approvedBy: randomUUID(),
    };

    const settled = await Promise.allSettled([
      prepareOfflineLessonApproval(firstRequest),
      prepareOfflineLessonApproval(secondRequest),
    ]);
    const fulfilled = settled.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof prepareOfflineLessonApproval>>> => (
        result.status === "fulfilled"
      ),
    );
    const rejected = settled.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(
      rejected[0]?.reason?.code,
      "LESSON_APPROVAL_PAYLOAD_CONFLICT",
    );

    const events = await prisma.crmOutboxEvent.findMany({
      where: { aggregateId: fixture.crmClassId, eventType: "admin_approve" },
    });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.id, fulfilled[0]?.value.id);

    const eventPayload = readEventPayload(events[0]!.payload);
    const storedVersion = await prisma.offlineLessonReportVersion.findUniqueOrThrow({
      where: { id: fixture.version.id },
    });
    const matchingRequest = eventPayload.approvedBy === firstRequest.approvedBy
      ? firstRequest
      : secondRequest;
    assert.deepEqual(eventPayload.body, matchingRequest.crmPayload);
    assert.equal(readOfflineLessonApprovedBy(storedVersion.payload), matchingRequest.approvedBy);
    assert.deepEqual(
      readOfflineLessonLearningResultsV2(storedVersion.payload),
      matchingRequest.learningResultsV2,
    );
  },
);

integrationTest(
  "same parallel approval preserves the first writer actor and one outbox event",
  async (t) => {
    const fixture = await createApprovalFixture();
    t.after(() => removeApprovalFixture(fixture));
    const firstAdmin = randomUUID();
    const secondAdmin = randomUUID();
    const commonRequest = {
      crmClassId: fixture.crmClassId,
      expectedVersion: 1,
      crmPayload: { attendance: "present", note: "Подтверждено" },
      learningResultsV2: firstResults,
    };

    const [firstCall, secondCall] = await Promise.all([
      prepareOfflineLessonApproval({ ...commonRequest, approvedBy: firstAdmin }),
      prepareOfflineLessonApproval({ ...commonRequest, approvedBy: secondAdmin }),
    ]);
    assert.equal(firstCall.id, secondCall.id);

    const events = await prisma.crmOutboxEvent.findMany({
      where: { aggregateId: fixture.crmClassId, eventType: "admin_approve" },
    });
    assert.equal(events.length, 1);
    const eventPayload = readEventPayload(events[0]!.payload);
    assert.ok([firstAdmin, secondAdmin].includes(eventPayload.approvedBy));

    const storedVersion = await prisma.offlineLessonReportVersion.findUniqueOrThrow({
      where: { id: fixture.version.id },
    });
    assert.equal(readOfflineLessonApprovedBy(storedVersion.payload), eventPayload.approvedBy);
    assert.deepEqual(readOfflineLessonLearningResultsV2(storedVersion.payload), firstResults);

    const replayByOtherAdmin = await prepareOfflineLessonApproval({
      ...commonRequest,
      approvedBy: eventPayload.approvedBy === firstAdmin ? secondAdmin : firstAdmin,
    });
    assert.equal(replayByOtherAdmin.id, events[0]!.id);

    const replayedVersion = await prisma.offlineLessonReportVersion.findUniqueOrThrow({
      where: { id: fixture.version.id },
    });
    assert.equal(readOfflineLessonApprovedBy(replayedVersion.payload), eventPayload.approvedBy);
  },
);

integrationTest("CRM-owned confirmation updates the Platform report without another charge request", async t => {
  const originalSecret = process.env.INTEGRATION_SERVICE_SECRET;
  process.env.INTEGRATION_SERVICE_SECRET = "local-approval-integration-test-secret";
  t.after(() => {
    if (originalSecret === undefined) delete process.env.INTEGRATION_SERVICE_SECRET;
    else process.env.INTEGRATION_SERVICE_SECRET = originalSecret;
  });
  const { processCrmOutboxEvent, reconcileObservedCrmApproval } = await import("./crm-outbox.service.js");
  const fixture = await createApprovalFixture();
  t.after(() => removeApprovalFixture(fixture));
  const event = await prepareOfflineLessonApproval({ crmClassId: fixture.crmClassId, expectedVersion: 1,
    approvedBy: randomUUID(), learningResultsV2: firstResults, crmPayload: { topic: "Old queued approval" } });
  await prisma.crmOutboxEvent.update({ where: { id: event.id }, data: { status: "awaiting_crm" } });
  await prisma.offlineLessonReport.update({ where: { id: fixture.report.id }, data: { status: "pending_review" } });
  const lesson = { crmClassId: fixture.crmClassId, status: "completed", reviewedAt: new Date(Date.now() + 1000).toISOString() };
  let reads = 0;
  let finalizations = 0;
  t.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.method ?? "GET", "GET", "confirmation must never write back to CRM");
    reads += 1;
    return new Response(JSON.stringify({ success: true, data: lesson }), { status: 200 });
  });
  const processEvent = (id: string) => processCrmOutboxEvent(id, {
    finalizeApproval: async () => { finalizations += 1; return { fixture: true } as any; },
  });
  await reconcileObservedCrmApproval(fixture.crmClassId, lesson, { processEvent });
  const report = await prisma.offlineLessonReport.findUniqueOrThrow({ where: { id: fixture.report.id } });
  const delivered = await prisma.crmOutboxEvent.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(report.status, "confirmed");
  assert.equal(report.confirmedVersion, 1);
  assert.equal(delivered.status, "succeeded");
  assert.equal((delivered.payload as Record<string, unknown>).approvalSource, "crm_observed");
  await reconcileObservedCrmApproval(fixture.crmClassId, lesson, { processEvent });
  assert.equal(reads, 1);
  assert.equal(finalizations, 1);
});
