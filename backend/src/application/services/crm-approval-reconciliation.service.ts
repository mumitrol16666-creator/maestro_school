import { prisma } from "../../infrastructure/database/prisma.js";
import { fetchClassCard } from "../../infrastructure/crm/crm-client.js";
import { saveOfflineLessonProjectionSnapshot } from "./offline-lesson-projection-store.service.js";
import { reconcileObservedCrmApproval } from "./crm-outbox.service.js";

type JsonRecord = Record<string, unknown>;

const CHECK_INTERVAL_MS = 30_000;
const INITIAL_DELAY_MS = 5_000;
const DEFAULT_BATCH_SIZE = 25;
const CONCURRENCY = 5;

type ReconciliationState = Awaited<ReturnType<typeof reconcileObservedCrmApproval>>["state"];

type PendingApprovalReconciliationDependencies = {
  database: typeof prisma;
  fetchLesson: typeof fetchClassCard;
  saveProjection: typeof saveOfflineLessonProjectionSnapshot;
  reconcileApproval: typeof reconcileObservedCrmApproval;
  now: () => Date;
};

export type PendingApprovalReconciliationOverrides = Partial<
  PendingApprovalReconciliationDependencies
>;

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2_000);
}

async function inBatches<T>(
  items: T[],
  batchSize: number,
  task: (item: T) => Promise<void>,
) {
  for (let index = 0; index < items.length; index += batchSize) {
    await Promise.all(items.slice(index, index + batchSize).map(task));
  }
}

/**
 * Polls CRM for reports that are still awaiting review locally. The projection's
 * lastSyncedAt is refreshed on every attempt, so a bounded batch rotates fairly
 * through the whole queue instead of repeatedly checking only the oldest rows.
 */
export async function reconcilePendingCrmApprovals(
  limit = DEFAULT_BATCH_SIZE,
  overrides: PendingApprovalReconciliationOverrides = {},
) {
  const dependencies: PendingApprovalReconciliationDependencies = {
    database: overrides.database ?? prisma,
    fetchLesson: overrides.fetchLesson ?? fetchClassCard,
    saveProjection: overrides.saveProjection ?? saveOfflineLessonProjectionSnapshot,
    reconcileApproval: overrides.reconcileApproval ?? reconcileObservedCrmApproval,
    now: overrides.now ?? (() => new Date()),
  };
  const candidates = await dependencies.database.offlineLessonProjection.findMany({
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
    take: Math.max(1, limit),
    select: { crmClassId: true },
  });

  const results: Array<{
    crmClassId: string;
    state: ReconciliationState | "failed";
    error?: string;
  }> = [];
  await inBatches(candidates, CONCURRENCY, async ({ crmClassId }) => {
    try {
      const lesson = await dependencies.fetchLesson(crmClassId);
      await dependencies.saveProjection(crmClassId, lesson as JsonRecord);
      const reconciliation = await dependencies.reconcileApproval(
        crmClassId,
        lesson as JsonRecord,
      );
      results.push({ crmClassId, state: reconciliation.state });
    } catch (error) {
      const message = errorMessage(error);
      await dependencies.database.offlineLessonProjection.updateMany({
        where: { crmClassId },
        data: {
          lastSyncedAt: dependencies.now(),
          lastSyncError: message,
        },
      }).catch(() => undefined);
      results.push({ crmClassId, state: "failed", error: message });
    }
  });

  return {
    scanned: candidates.length,
    approvalsObserved: results.filter(({ state }) => (
      ["staged", "retrying", "already_reconciled"].includes(state)
    )).length,
    failed: results.filter(({ state }) => state === "failed").length,
    results,
  };
}

export function startPendingCrmApprovalReconciliationJob() {
  if (!process.env.INTEGRATION_SERVICE_SECRET) return () => undefined;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await reconcilePendingCrmApprovals();
      if (result.approvalsObserved || result.failed) {
        console.info("[crm-approval-reconciliation]", {
          scanned: result.scanned,
          approvalsObserved: result.approvalsObserved,
          failed: result.failed,
        });
      }
    } catch (error) {
      console.error("[crm-approval-reconciliation]", error);
    } finally {
      running = false;
    }
  };
  const initialTimer = setTimeout(() => void run(), INITIAL_DELAY_MS);
  initialTimer.unref();
  const interval = setInterval(() => void run(), CHECK_INTERVAL_MS);
  interval.unref();
  return () => {
    clearTimeout(initialTimer);
    clearInterval(interval);
  };
}
