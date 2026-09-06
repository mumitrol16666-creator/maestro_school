import assert from "node:assert/strict";
import test from "node:test";
import {
  processCrmOutboxEvent,
  processDueCrmOutboxEvents,
} from "./crm-outbox.service.js";

type MutableOutboxEvent = {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  status: string;
  attempts: number;
  lastError: string | null;
  responsePayload: Record<string, unknown> | null;
  nextAttemptAt: Date | null;
  processingAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function sameInstant(left: unknown, right: Date | null) {
  return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
}

function createOutboxDatabase(event: MutableOutboxEvent, reportState = {
  id: "33333333-3333-4333-8333-333333333333",
  crmClassId: "crm-class-1",
  currentVersion: 1,
  status: "approving",
  confirmedVersion: null as number | null,
  crmConfirmedAt: null as Date | null,
}) {
  const reportVersion = {
    id: "22222222-2222-4222-8222-222222222222",
    reportId: "33333333-3333-4333-8333-333333333333",
    version: 1,
    state: "submitted",
    crmDeliveredAt: null as Date | null,
  };

  const database: any = {
    crmOutboxEvent: {
      updateMany: async ({ where, data }: any) => {
        if (where.id && where.id !== event.id) return { count: 0 };
        if (where.status?.in && !where.status.in.includes(event.status)) return { count: 0 };
        if (typeof where.status === "string" && where.status !== event.status) return { count: 0 };
        if (where.processingAt && !sameInstant(where.processingAt, event.processingAt)) {
          return { count: 0 };
        }

        if (data.status !== undefined) event.status = data.status;
        if (data.processingAt !== undefined) event.processingAt = data.processingAt;
        if (data.lastError !== undefined) event.lastError = data.lastError;
        if (data.responsePayload !== undefined) event.responsePayload = data.responsePayload;
        if (data.nextAttemptAt !== undefined) event.nextAttemptAt = data.nextAttemptAt;
        if (data.completedAt !== undefined) event.completedAt = data.completedAt;
        if (data.attempts?.increment) event.attempts += data.attempts.increment;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ ...event }),
      findUnique: async () => ({ ...event }),
    },
    offlineLessonReportVersion: {
      update: async ({ data }: any) => {
        if (data.crmDeliveredAt) reportVersion.crmDeliveredAt = data.crmDeliveredAt;
        return { ...reportVersion };
      },
      findUnique: async () => ({ ...reportVersion }),
    },
    offlineLessonReport: {
      findUnique: async () => ({ ...reportState }),
      updateMany: async ({ where, data }: any) => {
        if (where.crmConfirmedAt === null && reportState.crmConfirmedAt !== null) {
          return { count: 0 };
        }
        if (where.status?.in && !where.status.in.includes(reportState.status)) {
          return { count: 0 };
        }
        if (data.status) reportState.status = data.status;
        if (data.confirmedVersion !== undefined) {
          reportState.confirmedVersion = data.confirmedVersion;
        }
        if (data.crmConfirmedAt !== undefined) {
          reportState.crmConfirmedAt = data.crmConfirmedAt;
        }
        return { count: 1 };
      },
    },
    offlineLessonStudentCheck: {
      update: async () => ({}),
      updateMany: async () => ({ count: 0 }),
    },
    crmSyncConflict: {
      findFirst: async () => null,
      update: async () => ({}),
      updateMany: async () => ({ count: 0 }),
      create: async () => ({}),
    },
  };
  database.$transaction = async (operation: (tx: typeof database) => unknown) => operation(database);

  return { database, reportState };
}

function outboxEvent(eventType: string): MutableOutboxEvent {
  const createdAt = new Date("2026-09-05T06:00:00.000Z");
  return {
    id: "11111111-1111-4111-8111-111111111111",
    aggregateType: "offline_lesson",
    aggregateId: "crm-class-1",
    eventType,
    payload: {
      crmClassId: "crm-class-1",
      body: {},
      ...(eventType === "admin_approve"
        ? { reportVersionId: "22222222-2222-4222-8222-222222222222" }
        : {}),
    },
    idempotencyKey: `event:${eventType}:1`,
    status: "pending",
    attempts: 0,
    lastError: null,
    responsePayload: null,
    nextAttemptAt: null,
    processingAt: null,
    completedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

test("approval retry finishes rewards after CRM delivery without losing the confirmed report", async () => {
  const event = outboxEvent("admin_approve");
  const { database, reportState } = createOutboxDatabase(event);
  let deliveryCalls = 0;
  let finalizationCalls = 0;

  const overrides: any = {
    database,
    deliverEvent: async () => {
      deliveryCalls += 1;
      return { accepted: true };
    },
    confirmApproval: async () => {
      reportState.status = "confirmed";
      reportState.confirmedVersion = 1;
      reportState.crmConfirmedAt ??= new Date("2026-09-05T06:01:00.000Z");
      return {
        reportVersion: 1,
        approvedBy: "admin-1",
        learningResultsV2: { homeworkDecisions: [], topicUpdates: [] },
      };
    },
    finalizeApproval: async () => {
      finalizationCalls += 1;
      if (finalizationCalls === 1) throw new Error("temporary reward failure");
      return {
        attendance: [{ crmStudentId: "student-1", points: 0, coins: 0, xp: 20 }],
        learningV2: { topicUpdates: [] },
      };
    },
    now: () => new Date(`2026-09-05T06:0${event.attempts}:00.000Z`),
  };

  const failed = await processCrmOutboxEvent(event.id, overrides);

  assert.equal(failed?.status, "failed");
  assert.equal(reportState.status, "confirmed");
  assert.ok(reportState.crmConfirmedAt);
  assert.equal(failed?.responsePayload, null);

  const succeeded = await processCrmOutboxEvent(event.id, overrides);

  assert.equal(succeeded?.status, "succeeded");
  assert.equal(succeeded?.attempts, 2);
  assert.equal(deliveryCalls, 2);
  assert.equal(finalizationCalls, 2);
  assert.deepEqual(succeeded?.responsePayload, {
    accepted: true,
    learningRewards: {
      attendance: [{ crmStudentId: "student-1", points: 0, coins: 0, xp: 20 }],
      learningV2: { topicUpdates: [] },
    },
  });
});

test("a stale approval is cancelled before CRM delivery and finalization", async () => {
  const event = outboxEvent("admin_approve");
  const { database } = createOutboxDatabase(event, {
    id: "33333333-3333-4333-8333-333333333333",
    crmClassId: "crm-class-1",
    currentVersion: 2,
    status: "pending_review",
    confirmedVersion: null,
    crmConfirmedAt: null,
  });
  let deliveryCalls = 0;
  let finalizationCalls = 0;

  const result = await processCrmOutboxEvent(event.id, {
    database,
    deliverEvent: async () => {
      deliveryCalls += 1;
      return { accepted: true };
    },
    finalizeApproval: async () => {
      finalizationCalls += 1;
      return { attendance: [], learningV2: null };
    },
  } as any);

  assert.equal(result?.status, "cancelled");
  assert.match(String(result?.lastError), /устарела/);
  assert.equal(deliveryCalls, 0);
  assert.equal(finalizationCalls, 0);
});

test("a version change after CRM confirmation prevents reward finalization", async () => {
  const event = outboxEvent("admin_approve");
  const { database, reportState } = createOutboxDatabase(event);
  let finalizationCalls = 0;

  const result = await processCrmOutboxEvent(event.id, {
    database,
    deliverEvent: async () => ({ accepted: true }),
    confirmApproval: async () => {
      reportState.status = "confirmed";
      reportState.confirmedVersion = 1;
      reportState.crmConfirmedAt = new Date("2026-09-05T06:01:00.000Z");
      reportState.currentVersion = 2;
      return {
        reportVersion: 1,
        approvedBy: "admin-1",
        learningResultsV2: { homeworkDecisions: [], topicUpdates: [] },
      };
    },
    finalizeApproval: async () => {
      finalizationCalls += 1;
      return { attendance: [], learningV2: null };
    },
    now: () => new Date("2026-09-05T06:01:00.000Z"),
  } as any);

  assert.equal(result?.status, "cancelled");
  assert.equal(finalizationCalls, 0);
});

test("an expired worker cannot overwrite the result of a newer claim", async () => {
  const event = outboxEvent("teacher_submit");
  const { database } = createOutboxDatabase(event);
  const oldDelivery = deferred<Record<string, unknown>>();
  const newDelivery = deferred<Record<string, unknown>>();
  const oldStarted = deferred<void>();
  const newStarted = deferred<void>();

  const oldProcess = processCrmOutboxEvent(event.id, {
    database,
    now: () => new Date("2026-09-05T06:00:00.000Z"),
    deliverEvent: async () => {
      oldStarted.resolve();
      return oldDelivery.promise;
    },
  } as any);
  await oldStarted.promise;

  event.status = "failed";
  event.processingAt = null;
  const newProcess = processCrmOutboxEvent(event.id, {
    database,
    now: () => new Date("2026-09-05T06:03:00.000Z"),
    deliverEvent: async () => {
      newStarted.resolve();
      return newDelivery.promise;
    },
  } as any);
  await newStarted.promise;

  oldDelivery.resolve({ worker: "expired" });
  const expiredResult = await oldProcess;
  assert.equal(expiredResult?.status, "processing");
  assert.equal(expiredResult?.responsePayload, null);

  newDelivery.resolve({ worker: "current" });
  const currentResult = await newProcess;
  assert.equal(currentResult?.status, "succeeded");
  assert.deepEqual(currentResult?.responsePayload, { worker: "current" });
  assert.equal(currentResult?.attempts, 2);
});

test("an expired worker failure cannot mark a newer claim as failed", async () => {
  const event = outboxEvent("teacher_submit");
  const { database } = createOutboxDatabase(event);
  const oldDelivery = deferred<Record<string, unknown>>();
  const newDelivery = deferred<Record<string, unknown>>();
  const oldStarted = deferred<void>();
  const newStarted = deferred<void>();

  const oldProcess = processCrmOutboxEvent(event.id, {
    database,
    now: () => new Date("2026-09-05T06:00:00.000Z"),
    deliverEvent: async () => {
      oldStarted.resolve();
      return oldDelivery.promise;
    },
  } as any);
  await oldStarted.promise;

  event.status = "failed";
  event.processingAt = null;
  const newProcess = processCrmOutboxEvent(event.id, {
    database,
    now: () => new Date("2026-09-05T06:03:00.000Z"),
    deliverEvent: async () => {
      newStarted.resolve();
      return newDelivery.promise;
    },
  } as any);
  await newStarted.promise;

  oldDelivery.reject(new Error("expired request failed"));
  const expiredResult = await oldProcess;
  assert.equal(expiredResult?.status, "processing");
  assert.equal(expiredResult?.lastError, null);

  newDelivery.resolve({ worker: "current" });
  const currentResult = await newProcess;
  assert.equal(currentResult?.status, "succeeded");
  assert.equal(currentResult?.lastError, null);
  assert.deepEqual(currentResult?.responsePayload, { worker: "current" });
});

test("a stale approval lease is recovered and safely finalized", async () => {
  const event = outboxEvent("admin_approve");
  event.status = "processing";
  event.attempts = 1;
  event.processingAt = new Date("2026-09-05T06:00:00.000Z");
  const { database, reportState } = createOutboxDatabase(event);
  const updateMany = database.crmOutboxEvent.updateMany;
  database.crmOutboxEvent.updateMany = async ({ where, data }: any) => {
    if (
      !where.id
      && where.status === "processing"
      && where.processingAt?.lt instanceof Date
    ) {
      if (
        event.status === "processing"
        && event.processingAt
        && event.processingAt < where.processingAt.lt
      ) {
        event.status = data.status;
        event.processingAt = data.processingAt;
        event.nextAttemptAt = data.nextAttemptAt;
        return { count: 1 };
      }
      return { count: 0 };
    }
    return updateMany({ where, data });
  };
  database.crmOutboxEvent.findMany = async () => (
    event.status === "failed" ? [{ ...event }] : []
  );

  let deliveryCalls = 0;
  let finalizationCalls = 0;
  const processed = await processDueCrmOutboxEvents(25, {
    database,
    now: () => new Date("2026-09-05T06:03:00.000Z"),
    deliverEvent: async () => {
      deliveryCalls += 1;
      return { accepted: true };
    },
    confirmApproval: async () => {
      reportState.status = "confirmed";
      reportState.confirmedVersion = 1;
      reportState.crmConfirmedAt = new Date("2026-09-05T06:03:00.000Z");
      return {
        reportVersion: 1,
        approvedBy: "admin-1",
        learningResultsV2: { homeworkDecisions: [], topicUpdates: [] },
      };
    },
    finalizeApproval: async () => {
      finalizationCalls += 1;
      return { attendance: [], learningV2: { topicUpdates: [] } };
    },
  } as any);

  assert.equal(processed, 1);
  assert.equal(event.status, "succeeded");
  assert.equal(event.attempts, 2);
  assert.equal(deliveryCalls, 1);
  assert.equal(finalizationCalls, 1);
});
