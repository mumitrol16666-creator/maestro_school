import assert from "node:assert/strict";
import test from "node:test";
import { reconcilePendingCrmApprovals } from "./crm-approval-reconciliation.service.js";

test("pending CRM approval sweep rotates candidates and isolates per-lesson failures", async () => {
  const fetches: string[] = [];
  const saved: string[] = [];
  const reconciled: string[] = [];
  const failedUpdates: Array<Record<string, unknown>> = [];
  let findManyArgs: Record<string, unknown> | null = null;
  const database = {
    offlineLessonProjection: {
      findMany: async (args: Record<string, unknown>) => {
        findManyArgs = args;
        return [
          { crmClassId: "crm-class-approved" },
          { crmClassId: "crm-class-open" },
          { crmClassId: "crm-class-unavailable" },
        ];
      },
      updateMany: async (args: Record<string, unknown>) => {
        failedUpdates.push(args);
        return { count: 1 };
      },
    },
  };

  const result = await reconcilePendingCrmApprovals(3, {
    database: database as any,
    fetchLesson: async (crmClassId) => {
      fetches.push(crmClassId);
      if (crmClassId === "crm-class-unavailable") throw new Error("CRM unavailable");
      return crmClassId === "crm-class-approved"
        ? { status: "completed", reviewedAt: "2026-09-10T09:23:12.854Z" }
        : { status: "pending_admin_review" };
    },
    saveProjection: async (crmClassId) => {
      saved.push(crmClassId);
      return {} as any;
    },
    reconcileApproval: async (crmClassId) => {
      reconciled.push(crmClassId);
      return crmClassId === "crm-class-approved"
        ? { state: "staged" as const, event: null }
        : { state: "not_approved" as const, event: null };
    },
    now: () => new Date("2026-09-10T10:00:00.000Z"),
  });

  assert.deepEqual(findManyArgs, {
    where: {
      report: {
        is: {
          status: "pending_review",
          confirmedVersion: null,
          crmConfirmedAt: null,
        },
      },
    },
    orderBy: [
      { lastSyncedAt: "asc" },
      { crmClassId: "asc" },
    ],
    take: 3,
    select: { crmClassId: true },
  });
  assert.deepEqual(fetches.sort(), [
    "crm-class-approved",
    "crm-class-open",
    "crm-class-unavailable",
  ]);
  assert.deepEqual(saved.sort(), ["crm-class-approved", "crm-class-open"]);
  assert.deepEqual(reconciled.sort(), ["crm-class-approved", "crm-class-open"]);
  assert.equal(result.scanned, 3);
  assert.equal(result.approvalsObserved, 1);
  assert.equal(result.failed, 1);
  assert.equal(failedUpdates.length, 1);
  assert.deepEqual(failedUpdates[0], {
    where: { crmClassId: "crm-class-unavailable" },
    data: {
      lastSyncedAt: new Date("2026-09-10T10:00:00.000Z"),
      lastSyncError: "CRM unavailable",
    },
  });
});

test("pending CRM approval sweep clamps an empty batch request to one candidate", async () => {
  let take: number | undefined;
  const database = {
    offlineLessonProjection: {
      findMany: async (args: { take: number }) => {
        take = args.take;
        return [];
      },
    },
  };

  const result = await reconcilePendingCrmApprovals(0, { database: database as any });

  assert.equal(take, 1);
  assert.deepEqual(result, {
    scanned: 0,
    approvalsObserved: 0,
    failed: 0,
    results: [],
  });
});
