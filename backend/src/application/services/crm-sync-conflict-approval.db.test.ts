import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { prisma } from "../../infrastructure/database/prisma.js";
import { resolveCrmSyncConflict } from "./crm-outbox.service.js";

const integrationTest = process.env.RUN_DB_INTEGRATION_TESTS === "1" ? test : test.skip;

// 02.11 (money review): a confirmed lesson whose rewards were not applied must not be closed with
// «принять CRM» — that would drop XP, Coins and topic percents without a trace.
integrationTest("«accept CRM» is refused on an approval conflict; the event and conflict stay open", async () => {
  const suffix = randomUUID().slice(0, 8);
  const crmClassId = `approval-conflict-${suffix}`;
  const event = await prisma.crmOutboxEvent.create({
    data: {
      aggregateType: "offline_lesson",
      aggregateId: crmClassId,
      eventType: "admin_approve",
      payload: { crmClassId, body: { approved: true } },
      idempotencyKey: `lesson-report:${crmClassId}:v1:approve`,
      status: "conflict",
      attempts: 3,
      lastError: "Тема «Бой» в отчёте начиналась с 70 %, а сейчас на 60 %",
    },
  });
  const conflict = await prisma.crmSyncConflict.create({
    data: {
      outboxEventId: event.id,
      crmClassId,
      kind: "admin_approve",
      localPayload: { crmClassId },
      errorMessage: event.lastError ?? "",
    },
  });
  try {
    await assert.rejects(
      resolveCrmSyncConflict(conflict.id, randomUUID(), "accept_crm", "закрываю"),
      (error: any) => {
        assert.equal(error.code, "CRM_CONFLICT_APPROVAL_NEEDS_REPLAY");
        return true;
      },
    );
    assert.equal((await prisma.crmSyncConflict.findUniqueOrThrow({ where: { id: conflict.id } })).status, "open");
    assert.equal((await prisma.crmOutboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status, "conflict");
  } finally {
    await prisma.crmSyncConflict.deleteMany({ where: { id: conflict.id } });
    await prisma.crmOutboxEvent.deleteMany({ where: { id: event.id } });
  }
});
