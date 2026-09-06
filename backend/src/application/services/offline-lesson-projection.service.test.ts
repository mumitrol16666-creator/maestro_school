import assert from "node:assert/strict";
import test from "node:test";
import {
  isOfflineLessonSyncEventInCurrentChain,
  summarizeOfflineLessonSyncChain,
} from "./offline-lesson-projection.service.js";

function syncEvent(params: {
  eventType: string;
  reportVersionId?: string;
  status?: string;
  attempts?: number;
  lastError?: string | null;
  createdAt: string;
}) {
  const createdAt = new Date(params.createdAt);
  return {
    eventType: params.eventType,
    payload: params.reportVersionId ? { reportVersionId: params.reportVersionId } : {},
    status: params.status ?? "succeeded",
    attempts: params.attempts ?? 0,
    lastError: params.lastError ?? null,
    createdAt,
    updatedAt: createdAt,
  };
}

test("sync summary ignores old approval chain but keeps current approval and attendance", () => {
  const staleApproval = syncEvent({
    eventType: "admin_approve",
    reportVersionId: "report-version-1",
    status: "failed",
    attempts: 4,
    lastError: "Ошибка старой версии",
    createdAt: "2026-09-05T09:03:00.000Z",
  });
  const currentApproval = syncEvent({
    eventType: "admin_approve",
    reportVersionId: "report-version-2",
    status: "pending",
    attempts: 1,
    createdAt: "2026-09-05T09:02:00.000Z",
  });
  const attendance = syncEvent({
    eventType: "teacher_attendance",
    status: "processing",
    attempts: 2,
    createdAt: "2026-09-05T09:01:00.000Z",
  });

  const summary = summarizeOfflineLessonSyncChain({
    // Deliberately unsorted: summary must still pick the latest relevant event.
    events: [attendance, staleApproval, currentApproval],
    conflicts: [
      { outboxEvent: staleApproval },
      { outboxEvent: currentApproval },
      { outboxEvent: attendance },
      { outboxEvent: null },
    ],
    currentReportVersionId: "report-version-2",
    reportStatus: "pending_review",
  });

  assert.equal(summary.pendingCount, 2);
  assert.equal(summary.conflictCount, 3);
  assert.equal(summary.lastEvent, currentApproval);
  assert.equal(summary.lastEvent?.lastError, null);
});

test("correction chain hides approval events while attendance remains visible", () => {
  const currentApproval = syncEvent({
    eventType: "admin_approve",
    reportVersionId: "report-version-2",
    status: "failed",
    attempts: 3,
    createdAt: "2026-09-05T09:05:00.000Z",
  });
  const attendance = syncEvent({
    eventType: "admin_attendance",
    status: "pending",
    attempts: 1,
    createdAt: "2026-09-05T09:04:00.000Z",
  });

  const summary = summarizeOfflineLessonSyncChain({
    events: [currentApproval, attendance],
    conflicts: [
      { outboxEvent: currentApproval },
      { outboxEvent: attendance },
    ],
    currentReportVersionId: "report-version-2",
    reportStatus: "correcting",
  });

  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.conflictCount, 1);
  assert.equal(summary.lastEvent, attendance);
});

test("events without a report version remain visible unless they are superseded approvals", () => {
  assert.equal(isOfflineLessonSyncEventInCurrentChain(
    { eventType: "teacher_attendance", payload: {} },
    null,
    "editing",
  ), true);
  assert.equal(isOfflineLessonSyncEventInCurrentChain(
    { eventType: "admin_approve", payload: {} },
    "report-version-2",
    "pending_review",
  ), true);
  assert.equal(isOfflineLessonSyncEventInCurrentChain(
    { eventType: "admin_approve", payload: { reportVersionId: "report-version-2" } },
    "report-version-2",
    "editing",
  ), false);
});
