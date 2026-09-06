import assert from "node:assert/strict";
import test from "node:test";
import {
  assertOfflineLessonCorrectionIsSafe,
  buildOfflineLessonReportPayloads,
  offlineLessonApprovalIdempotencyKey,
  readOfflineLessonApprovedBy,
  readOfflineLessonLearningResultsV2,
  sameOfflineLessonLearningResultsV2,
  withOfflineLessonApprovalSnapshot,
  withOfflineLessonLearningResultsV2,
} from "./offline-lesson-report.service.js";

const firstResults = {
  homeworkDecisions: [{
    recipientId: "11111111-1111-4111-8111-111111111111",
    cycleNumber: 1,
    decision: "accepted" as const,
  }],
  topicUpdates: [{
    topicId: "22222222-2222-4222-8222-222222222222",
    expectedPercent: 20,
    toPercent: 40,
    comment: "Стало увереннее",
  }],
};

const correctedResults = {
  homeworkDecisions: [{
    recipientId: "11111111-1111-4111-8111-111111111111",
    cycleNumber: 1,
    decision: "revision" as const,
    comment: "Повторить под метроном",
  }],
  topicUpdates: [{
    topicId: "22222222-2222-4222-8222-222222222222",
    expectedPercent: 20,
    toPercent: 60,
  }],
};

test("learning results are stored in the report version but never sent to CRM", () => {
  const { crmPayload, versionPayload } = buildOfflineLessonReportPayloads(
    { topic: "Ровный ритм" },
    "crm-teacher-1",
    firstResults,
  );

  assert.equal("learningResultsV2" in crmPayload, false);
  assert.deepEqual(readOfflineLessonLearningResultsV2(versionPayload), firstResults);
  assert.equal(readOfflineLessonLearningResultsV2(crmPayload), null);
});

test("approval snapshots the admin correction and the approving actor", () => {
  const originalVersion = withOfflineLessonLearningResultsV2(
    { topic: "Ровный ритм", crmTeacherId: "crm-teacher-1" },
    firstResults,
  );
  const correctedVersion = withOfflineLessonApprovalSnapshot(
    originalVersion,
    correctedResults,
    "admin-user-1",
  );

  assert.deepEqual(readOfflineLessonLearningResultsV2(correctedVersion), correctedResults);
  assert.equal(readOfflineLessonApprovedBy(correctedVersion), "admin-user-1");
  assert.equal(correctedVersion.topic, "Ровный ритм");
  assert.equal(correctedVersion.crmTeacherId, "crm-teacher-1");
});

test("admin approval uses one stable key per report version", () => {
  assert.equal(
    offlineLessonApprovalIdempotencyKey("crm-class-42", 3),
    "lesson-report:crm-class-42:v3:approve",
  );
});

test("a delivered approval only accepts the exact staged learning results", () => {
  assert.equal(sameOfflineLessonLearningResultsV2(firstResults, firstResults), true);
  assert.equal(sameOfflineLessonLearningResultsV2(firstResults, correctedResults), false);
});

test("corrupted staged results are rejected instead of being silently applied", () => {
  assert.throws(
    () => readOfflineLessonLearningResultsV2({
      learningResultsV2: { homeworkDecisions: "broken", topicUpdates: [] },
    }),
    (error: unknown) => (
      error instanceof Error
      && "code" in error
      && error.code === "LESSON_LEARNING_RESULTS_INVALID"
    ),
  );
});

test("a confirmed lesson cannot be reopened without a compensating ledger", () => {
  for (const state of [
    {
      status: "confirmed",
      confirmedVersion: null,
      crmConfirmedAt: null,
      rewardsApplied: false,
      approvalDelivered: false,
    },
    {
      status: "editing",
      confirmedVersion: 1,
      crmConfirmedAt: null,
      rewardsApplied: false,
      approvalDelivered: false,
    },
    {
      status: "editing",
      confirmedVersion: null,
      crmConfirmedAt: new Date("2026-09-05T08:00:00.000Z"),
      rewardsApplied: false,
      approvalDelivered: false,
    },
    {
      status: "editing",
      confirmedVersion: null,
      crmConfirmedAt: null,
      rewardsApplied: true,
      approvalDelivered: false,
    },
    {
      status: "editing",
      confirmedVersion: null,
      crmConfirmedAt: null,
      rewardsApplied: false,
      approvalDelivered: true,
    },
  ]) {
    assert.throws(
      () => assertOfflineLessonCorrectionIsSafe(state),
      (error: unknown) => (
        error instanceof Error
        && "code" in error
        && error.code === "LESSON_FINALIZED_CORRECTION_UNSAFE"
      ),
    );
  }
});

test("an unconfirmed report remains safe to restore", () => {
  assert.doesNotThrow(() => assertOfflineLessonCorrectionIsSafe({
    status: "editing",
    confirmedVersion: null,
    crmConfirmedAt: null,
    rewardsApplied: false,
    approvalDelivered: false,
  }));
});
