import assert from "node:assert/strict";
import test from "node:test";
import {
  processCrmOutboxEvent,
  processDueCrmOutboxEvents,
  readObservedCrmApproval,
  reconcileObservedCrmApproval,
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
}, reportVersionOverrides: Record<string, unknown> = {}) {
  const reportVersion = {
    id: "22222222-2222-4222-8222-222222222222",
    reportId: "33333333-3333-4333-8333-333333333333",
    version: 1,
    state: "submitted",
    crmDeliveredAt: null as Date | null,
    authorUserId: "teacher-version-1",
    payload: {} as Record<string, unknown>,
    attendancePayload: [] as Array<Record<string, unknown>>,
    ...reportVersionOverrides,
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
        if (data.payload !== undefined) event.payload = data.payload;
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

  return { database, reportState, reportVersion };
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

function createObservedApprovalDatabase() {
  const report = {
    id: "33333333-3333-4333-8333-333333333333",
    crmClassId: "crm-class-1",
    currentVersion: 1,
    status: "pending_review",
    confirmedVersion: null as number | null,
    crmConfirmedAt: null as Date | null,
  };
  const version = {
    id: "22222222-2222-4222-8222-222222222222",
    reportId: report.id,
    version: 1,
    state: "submitted",
    crmDeliveredAt: new Date("2026-09-05T06:00:00.000Z"),
    authorUserId: "44444444-4444-4444-8444-444444444444",
    payload: { topic: "Ровный ритм" } as Record<string, unknown>,
  };
  let event: MutableOutboxEvent | null = null;
  let createCalls = 0;
  const database: any = {
    offlineLessonReport: {
      findUnique: async () => ({ ...report }),
      updateMany: async ({ where, data }: any) => {
        if (where.status && where.status !== report.status) return { count: 0 };
        if (where.confirmedVersion === null && report.confirmedVersion !== null) return { count: 0 };
        if (where.crmConfirmedAt === null && report.crmConfirmedAt !== null) return { count: 0 };
        report.status = data.status ?? report.status;
        return { count: 1 };
      },
    },
    offlineLessonReportVersion: {
      findUnique: async () => ({ ...version }),
      update: async ({ data }: any) => {
        version.payload = data.payload;
        return { ...version };
      },
    },
    crmOutboxEvent: {
      findUnique: async () => event ? { ...event } : null,
      updateMany: async ({ where, data }: any) => {
        if (!event) return { count: 0 };
        if (where.id && where.id !== event.id) return { count: 0 };
        if (typeof where.status === "string" && where.status !== event.status) {
          return { count: 0 };
        }
        if (where.status?.in && !where.status.in.includes(event.status)) return { count: 0 };
        if (data.payload !== undefined) event.payload = data.payload;
        if (data.status !== undefined) event.status = data.status;
        if (data.processingAt !== undefined) event.processingAt = data.processingAt;
        if (data.lastError !== undefined) event.lastError = data.lastError;
        if (data.responsePayload !== undefined) event.responsePayload = data.responsePayload;
        if (data.nextAttemptAt !== undefined) event.nextAttemptAt = data.nextAttemptAt;
        if (data.completedAt !== undefined) event.completedAt = data.completedAt;
        if (data.attempts?.increment) event.attempts += data.attempts.increment;
        return { count: 1 };
      },
      upsert: async ({ create }: any) => {
        if (!event) {
          createCalls += 1;
          const now = new Date("2026-09-06T04:15:00.000Z");
          event = {
            id: "11111111-1111-4111-8111-111111111111",
            aggregateType: create.aggregateType,
            aggregateId: create.aggregateId,
            eventType: create.eventType,
            payload: create.payload,
            idempotencyKey: create.idempotencyKey,
            status: "pending",
            attempts: 0,
            lastError: null,
            responsePayload: null,
            nextAttemptAt: null,
            processingAt: null,
            completedAt: null,
            createdAt: now,
            updatedAt: now,
          };
        }
        return { ...event };
      },
    },
  };
  database.$transaction = async (operation: (tx: typeof database) => unknown) => operation(database);
  return {
    database,
    report,
    version,
    getEvent: () => event,
    setEvent: (next: MutableOutboxEvent) => {
      event = next;
    },
    getCreateCalls: () => createCalls,
  };
}

test("CRM approval evidence requires a completed lesson and a valid review timestamp", () => {
  assert.deepEqual(readObservedCrmApproval({
    status: "completed",
    reviewedAt: "2026-09-06T04:14:45.271Z",
  }), {
    status: "completed",
    reviewedAt: "2026-09-06T04:14:45.271Z",
  });
  assert.equal(readObservedCrmApproval({ status: "completed" }), null);
  assert.equal(readObservedCrmApproval({
    status: "scheduled",
    reviewedAt: "2026-09-06T04:14:45.271Z",
  }), null);
  assert.equal(readObservedCrmApproval({
    status: "completed",
    reviewedAt: "not-a-date",
  }), null);
});

test("observed approval must be newer than delivery of the exact submitted version", async () => {
  const fixture = createObservedApprovalDatabase();
  let processCalls = 0;

  const result = await reconcileObservedCrmApproval("crm-class-1", {
    status: "completed",
    reviewedAt: fixture.version.crmDeliveredAt.toISOString(),
  }, {
    database: fixture.database,
    processEvent: async () => {
      processCalls += 1;
    },
  });

  assert.equal(result.state, "approval_predates_delivery");
  assert.equal(result.event, null);
  assert.equal(fixture.getCreateCalls(), 0);
  assert.equal(fixture.getEvent(), null);
  assert.equal(processCalls, 0);
  assert.equal(fixture.report.status, "pending_review");
});

test("repeated projection reconciliation creates and processes one canonical approval", async () => {
  const fixture = createObservedApprovalDatabase();
  let processCalls = 0;
  let rewardApplications = 0;
  const lesson = {
    status: "completed",
    reviewedAt: "2026-09-06T04:14:45.271Z",
  };
  const processEvent = async () => {
    processCalls += 1;
    const event = fixture.getEvent();
    assert.ok(event);
    if (event.status !== "succeeded") {
      rewardApplications += 1;
      event.status = "succeeded";
      fixture.report.status = "confirmed";
      fixture.report.confirmedVersion = 1;
      fixture.report.crmConfirmedAt = new Date("2026-09-06T04:14:45.271Z");
    }
    return event;
  };

  const first = await reconcileObservedCrmApproval("crm-class-1", lesson, {
    database: fixture.database,
    processEvent,
  });
  const second = await reconcileObservedCrmApproval("crm-class-1", lesson, {
    database: fixture.database,
    processEvent,
  });

  assert.equal(first.state, "staged");
  assert.equal(second.state, "already_reconciled");
  assert.equal(fixture.getCreateCalls(), 1);
  assert.equal(processCalls, 1);
  assert.equal(rewardApplications, 1);
  assert.equal(fixture.report.status, "confirmed");
});

test("observed reconciliation converts a pending explicit approval to read-only delivery", async () => {
  const fixture = createObservedApprovalDatabase();
  const submittedPayload = {
    learningResultsV2: {
      homeworkDecisions: [],
      topicUpdates: [{ topicId: "topic-1", expectedPercent: 0, toPercent: 90 }],
    },
    learningResultsApprovedBy: "admin-1",
  };
  fixture.version.payload = structuredClone(submittedPayload);
  const explicit = outboxEvent("admin_approve");
  explicit.aggregateId = "crm-class-1";
  explicit.idempotencyKey = "lesson-report:crm-class-1:v1:approve";
  explicit.payload = {
    crmClassId: "crm-class-1",
    body: { approved: true },
    reportVersionId: fixture.version.id,
    approvedBy: "admin-1",
  };
  fixture.setEvent(explicit);
  let processCalls = 0;

  const result = await reconcileObservedCrmApproval("crm-class-1", {
    status: "completed",
    reviewedAt: "2026-09-06T04:14:45.271Z",
  }, {
    database: fixture.database,
    processEvent: async (eventId) => {
      processCalls += 1;
      assert.equal(eventId, explicit.id);
    },
  });

  assert.equal(result.state, "retrying");
  assert.equal(processCalls, 1);
  assert.equal(fixture.getCreateCalls(), 0);
  assert.equal(fixture.report.status, "pending_review");
  assert.deepEqual(fixture.getEvent()?.payload.body, { approved: true });
  assert.equal(fixture.getEvent()?.payload.approvedBy, "admin-1");
  assert.equal(fixture.getEvent()?.payload.approvalSource, "crm_observed");
  assert.equal(
    fixture.getEvent()?.payload.observedReviewedAt,
    "2026-09-06T04:14:45.271Z",
  );
  assert.deepEqual(fixture.version.payload, submittedPayload);
});

test("observed reconciliation respects failed-event backoff", async () => {
  const fixture = createObservedApprovalDatabase();
  const lesson = {
    status: "completed",
    reviewedAt: "2026-09-06T04:14:45.271Z",
  };
  const staged = await reconcileObservedCrmApproval("crm-class-1", lesson, {
    database: fixture.database,
    processNow: false,
  });
  assert.equal(staged.state, "staged");
  const event = fixture.getEvent();
  assert.ok(event);
  event.status = "failed";
  event.nextAttemptAt = new Date("2026-09-06T05:00:00.000Z");
  let processCalls = 0;
  const processEvent = async () => {
    processCalls += 1;
  };

  const waiting = await reconcileObservedCrmApproval("crm-class-1", lesson, {
    database: fixture.database,
    processEvent,
    now: () => new Date("2026-09-06T04:30:00.000Z"),
  });
  const due = await reconcileObservedCrmApproval("crm-class-1", lesson, {
    database: fixture.database,
    processEvent,
    now: () => new Date("2026-09-06T05:00:00.000Z"),
  });

  assert.equal(waiting.state, "already_reconciled");
  assert.equal(due.state, "retrying");
  assert.equal(processCalls, 1);
});

test("legacy reports keep learning results absent during observed reconciliation", async () => {
  const fixture = createObservedApprovalDatabase();
  await reconcileObservedCrmApproval("crm-class-1", {
    status: "completed",
    reviewedAt: "2026-09-06T04:14:45.271Z",
  }, {
    database: fixture.database,
    processNow: false,
  });

  assert.equal(fixture.version.payload.learningResultsV2, undefined);
  assert.equal(fixture.version.payload.learningResultsApprovedBy, undefined);
});

test("observed reconciliation keeps the submitted V2 result snapshot immutable", async () => {
  const fixture = createObservedApprovalDatabase();
  const submittedPayload = {
    learningResultsV2: { homeworkDecisions: [], topicUpdates: [] },
  };
  fixture.version.payload = structuredClone(submittedPayload);
  await reconcileObservedCrmApproval("crm-class-1", {
    status: "completed",
    reviewedAt: "2026-09-06T04:14:45.271Z",
  }, {
    database: fixture.database,
    processNow: false,
  });

  assert.deepEqual(fixture.version.payload, submittedPayload);
  assert.equal(
    fixture.getEvent()?.payload.approvedBy,
    fixture.version.authorUserId,
  );
});

test("direct approval retry uses CRM GET after exact version was locally confirmed", async () => {
  const event = outboxEvent("admin_approve");
  event.idempotencyKey = "lesson-report:crm-class-1:v1:approve";
  event.payload = {
    crmClassId: "crm-class-1",
    body: { approved: true },
    reportVersionId: "22222222-2222-4222-8222-222222222222",
    approvedBy: "admin-1",
  };
  const submittedPayload = {
    homeworkDraft: "Играть переходы под метроном",
    learningResultsV2: {
      homeworkDecisions: [],
      topicUpdates: [{ topicId: "topic-1", expectedPercent: 0, toPercent: 90 }],
    },
    learningResultsApprovedBy: "admin-1",
  };
  const { database, reportState, reportVersion } = createOutboxDatabase(
    event,
    undefined,
    {
      crmDeliveredAt: new Date("2026-09-05T06:00:00.000Z"),
      payload: structuredClone(submittedPayload),
    },
  );
  let postCalls = 0;
  let getCalls = 0;
  let finalizationCalls = 0;
  const storedEventPayload = structuredClone(event.payload);

  const deliverEvent = async () => {
    postCalls += 1;
    return { accepted: true };
  };
  const readLocallyConfirmedApproval = async () => {
    getCalls += 1;
    return { recoveredFromLocalConfirmation: true };
  };
  const confirmApproval = async () => {
    reportState.status = "confirmed";
    reportState.confirmedVersion = 1;
    reportState.crmConfirmedAt ??= new Date("2026-09-05T06:01:00.000Z");
    return {
      reportVersion: 1,
      approvedBy: "admin-1",
      learningResultsV2: submittedPayload.learningResultsV2,
    };
  };
  const finalizeApproval = async () => {
    finalizationCalls += 1;
    if (finalizationCalls === 1) throw new Error("temporary reward failure");
    return {
      attendance: [{ crmStudentId: "student-1", points: 0, coins: 0, xp: 20 }],
      learningV2: { topicUpdates: [] },
    };
  };

  const failed = await processCrmOutboxEvent(event.id, {
    database,
    deliverEvent,
    readApprovalRetryStatus: async () => ({ status: "scheduled" }),
    readLocallyConfirmedApproval,
    confirmApproval,
    finalizeApproval,
    now: () => new Date("2026-09-05T06:01:00.000Z"),
  } as any);

  assert.equal(failed?.status, "failed");
  assert.equal(reportState.status, "confirmed");
  assert.ok(reportState.crmConfirmedAt);
  assert.equal(failed?.responsePayload, null);
  assert.equal(postCalls, 1);
  assert.equal(getCalls, 0);
  assert.equal(finalizationCalls, 1);

  const succeeded = await processCrmOutboxEvent(event.id, {
    database,
    deliverEvent,
    readLocallyConfirmedApproval,
    confirmApproval,
    finalizeApproval,
    now: () => new Date("2026-09-05T06:03:00.000Z"),
  } as any);

  assert.equal(succeeded?.status, "succeeded");
  assert.equal(succeeded?.attempts, 2);
  assert.equal(postCalls, 1);
  assert.equal(getCalls, 1);
  assert.equal(finalizationCalls, 2);
  const { approvalAttemptBaseline, ...deliveryPayload } = event.payload;
  assert.deepEqual(deliveryPayload, storedEventPayload);
  assert.deepEqual(approvalAttemptBaseline, {
    state: "not_approved",
    capturedAt: "2026-09-05T06:01:00.000Z",
  });
  assert.deepEqual(reportVersion.payload, submittedPayload);
  assert.deepEqual(succeeded?.responsePayload, {
    recoveredFromLocalConfirmation: true,
    learningRewards: {
      attendance: [{ crmStudentId: "student-1", points: 0, coins: 0, xp: 20 }],
      learningV2: { topicUpdates: [] },
    },
  });
});

test("due worker recovers a lost approval response with one POST and GET-only finalization", async () => {
  const event = outboxEvent("admin_approve");
  event.idempotencyKey = "lesson-report:crm-class-1:v1:approve";
  event.createdAt = new Date("2026-09-05T06:00:00.800Z");
  event.updatedAt = event.createdAt;
  const { database, reportState } = createOutboxDatabase(event, undefined, {
    crmDeliveredAt: new Date("2026-09-05T06:00:00.750Z"),
  });
  const baseUpdateMany = database.crmOutboxEvent.updateMany;
  database.crmOutboxEvent.updateMany = async ({ where, data }: any) => {
    if (
      !where.id
      && where.status === "processing"
      && where.processingAt?.lt instanceof Date
    ) {
      return { count: 0 };
    }
    return baseUpdateMany({ where, data });
  };
  database.crmOutboxEvent.findMany = async () => (
    event.status === "failed" ? [{ ...event }] : []
  );

  let postCalls = 0;
  let getCalls = 0;
  let finalizationCalls = 0;
  let crmLesson: Record<string, unknown> = { status: "scheduled" };
  const dependencies = {
    database,
    deliverEvent: async () => {
      postCalls += 1;
      crmLesson = {
        status: "completed",
        // CRM rounded the successful POST timestamp down to whole seconds.
        reviewedAt: "2026-09-05T06:00:00.000Z",
      };
      throw new Error("CRM committed approval but the response was lost");
    },
    readApprovalRetryStatus: async () => {
      getCalls += 1;
      return crmLesson;
    },
    confirmApproval: async () => {
      reportState.status = "confirmed";
      reportState.confirmedVersion = 1;
      reportState.crmConfirmedAt = new Date("2026-09-05T06:00:00.000Z");
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
  };

  const failed = await processCrmOutboxEvent(event.id, {
    ...dependencies,
    now: () => new Date("2026-09-05T06:00:00.850Z"),
  } as any);
  assert.equal(failed?.status, "failed");
  assert.equal(postCalls, 1);
  assert.equal(getCalls, 1);
  assert.deepEqual(event.payload.approvalAttemptBaseline, {
    state: "not_approved",
    capturedAt: "2026-09-05T06:00:00.850Z",
  });

  const processed = await processDueCrmOutboxEvents(25, {
    ...dependencies,
    now: () => new Date("2026-09-05T06:03:00.000Z"),
  } as any);

  assert.equal(processed, 1);
  assert.equal(event.status, "succeeded");
  assert.equal(event.attempts, 2);
  assert.equal(postCalls, 1);
  assert.equal(getCalls, 2);
  assert.equal(finalizationCalls, 1);
  assert.equal(event.payload.approvalSource, "crm_observed");
  assert.equal(event.payload.observedReviewedAt, "2026-09-05T06:00:00.000Z");
  assert.deepEqual(event.responsePayload, {
    class: crmLesson,
    recoveredFromFailedApproval: true,
    learningRewards: { attendance: [], learningV2: { topicUpdates: [] } },
  });
});

test("first explicit approval does not POST when CRM was already completed", async () => {
  const event = outboxEvent("admin_approve");
  const { database } = createOutboxDatabase(event, undefined, {
    crmDeliveredAt: new Date("2026-09-05T06:00:00.000Z"),
  });
  let postCalls = 0;
  let getCalls = 0;

  const result = await processCrmOutboxEvent(event.id, {
    database,
    readApprovalRetryStatus: async () => {
      getCalls += 1;
      return {
        status: "completed",
        reviewedAt: "2026-09-05T05:59:59.000Z",
      };
    },
    deliverEvent: async () => {
      postCalls += 1;
      return { accepted: true };
    },
    now: () => new Date("2026-09-05T06:01:00.000Z"),
  } as any);

  assert.equal(result?.status, "failed");
  assert.equal(getCalls, 1);
  assert.equal(postCalls, 0);
  assert.deepEqual(event.payload.approvalAttemptBaseline, {
    state: "approved",
    capturedAt: "2026-09-05T06:01:00.000Z",
    reviewedAt: "2026-09-05T05:59:59.000Z",
  });
  assert.match(String(result?.lastError), /уже показывает урок проверенным/);
});

test("failed approval retry fails closed for an older observed approval", async () => {
  const event = outboxEvent("admin_approve");
  event.status = "failed";
  event.attempts = 1;
  event.createdAt = new Date("2026-09-05T06:00:01.100Z");
  event.updatedAt = event.createdAt;
  const { database } = createOutboxDatabase(event, undefined, {
    crmDeliveredAt: new Date("2026-09-05T06:00:00.900Z"),
  });
  let postCalls = 0;
  let getCalls = 0;

  const result = await processCrmOutboxEvent(event.id, {
    database,
    readApprovalRetryStatus: async () => {
      getCalls += 1;
      return {
        status: "completed",
        reviewedAt: "2026-09-05T06:00:00.000Z",
      };
    },
    deliverEvent: async () => {
      postCalls += 1;
      return { accepted: true };
    },
    finalizeApproval: async () => ({ attendance: [], learningV2: { topicUpdates: [] } }),
    now: () => new Date("2026-09-05T06:00:02.000Z"),
  } as any);

  assert.equal(result?.status, "failed");
  assert.equal(getCalls, 1);
  assert.equal(postCalls, 0);
  assert.match(String(result?.lastError), /нельзя безопасно связать/);
  assert.equal(event.payload.approvalSource, undefined);
});

test("approval finalization uses recipients and creator from the exact report version", async () => {
  const event = outboxEvent("admin_approve");
  const { database, reportState } = createOutboxDatabase(event, undefined, {
    version: 4,
    authorUserId: "teacher-who-submitted-v4",
    payload: {
      learningResultsV2: {
        homeworkDecisions: [],
        topicUpdates: [],
        homeworkAssignment: {
          topicId: "topic-1",
          instructions: "Повторить переходы",
        },
      },
    },
    attendancePayload: [
      { crmStudentId: "student-present", attendanceStatus: "present" },
      { crmStudentId: "student-late", attendanceStatus: "late" },
      { crmStudentId: "student-absent", attendanceStatus: "absent" },
    ],
  });
  event.payload.reportVersionId = "22222222-2222-4222-8222-222222222222";
  reportState.currentVersion = 4;
  let finalizationInput: Record<string, unknown> | null = null;

  const result = await processCrmOutboxEvent(event.id, {
    database,
    readApprovalRetryStatus: async () => ({ status: "scheduled" }),
    deliverEvent: async () => ({ accepted: true }),
    finalizeApproval: async (input: Record<string, unknown>) => {
      finalizationInput = input;
      return { attendance: [], learningV2: { topicUpdates: [] } };
    },
    now: () => new Date("2026-09-05T06:01:00.000Z"),
  } as any);

  assert.equal(result?.status, "succeeded");
  assert.deepEqual(finalizationInput?.homeworkApproval, {
    reportVersion: 4,
    createdByUserId: "teacher-who-submitted-v4",
    recipientCrmStudentIds: ["student-late", "student-present"],
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
    readApprovalRetryStatus: async () => ({ status: "scheduled" }),
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
    readApprovalRetryStatus: async () => ({ status: "scheduled" }),
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
    readApprovalRetryStatus: async () => ({ status: "scheduled" }),
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
