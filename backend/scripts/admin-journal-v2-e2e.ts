import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  changeAdminJournalStatus,
  listAdminJournal,
  upsertAdminJournalEntry,
} from "../src/application/services/admin-journal.service.js";
import {
  processCrmOutboxEvent,
  resolveCrmSyncConflict,
} from "../src/application/services/crm-outbox.service.js";
import {
  linkExistingParentToStudent,
  revokeParentLink,
} from "../src/application/services/family.service.js";
import { prisma } from "../src/infrastructure/database/prisma.js";

const API = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4000/api/v1";
const PASSWORD = "QaMaestro2026!";
const PREFIX = "e2e:admin-journal-v2:contract:";
const TEMP_PARENT_LOGIN = "qa_journal_parent_temp";

function assertLocalQaDatabase() {
  if (process.env.MAESTRO_QA_LOCAL !== "true") {
    throw new Error("Admin journal E2E blocked: MAESTRO_QA_LOCAL=true is required.");
  }
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1|postgres|db)(:|\/)/.test(databaseUrl)
    || /prod|production|neon|supabase|render/i.test(databaseUrl)) {
    throw new Error("Admin journal E2E blocked: DATABASE_URL is not local.");
  }
  if (process.env.FEATURE_CURATOR_WORKSPACE_V2 !== "true") {
    throw new Error("Admin journal E2E blocked: FEATURE_CURATOR_WORKSPACE_V2=true is required.");
  }
}

async function request(path: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  const response = await fetch(`${API}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function login(loginName: string) {
  const { response, payload } = await request("/auth/login", {
    method: "POST",
    body: { phone: loginName, password: PASSWORD, profile: "staff" },
  });
  assert.equal(response.status, 200, `Login failed for ${loginName}`);
  return payload.data.token as string;
}

async function cleanup() {
  const outboxEvents = await prisma.crmOutboxEvent.findMany({
    where: { idempotencyKey: { startsWith: PREFIX } },
    select: { id: true },
  });
  const outboxIds = outboxEvents.map((event) => event.id);
  const parent = await prisma.user.findUnique({
    where: { login: TEMP_PARENT_LOGIN },
    select: { id: true },
  });
  const parentLinks = parent
    ? await prisma.parentStudentLink.findMany({ where: { parentUserId: parent.id }, select: { id: true } })
    : [];
  await prisma.adminJournalEntry.deleteMany({
    where: {
      OR: [
        { sourceKey: { startsWith: PREFIX } },
        ...(outboxIds.length ? [{ linkedEntityId: { in: outboxIds } }] : []),
        ...(parentLinks.length ? [{ linkedEntityId: { in: parentLinks.map((link) => link.id) } }] : []),
      ],
    },
  });
  if (outboxIds.length) {
    await prisma.crmSyncConflict.deleteMany({ where: { outboxEventId: { in: outboxIds } } });
    await prisma.crmOutboxEvent.deleteMany({ where: { id: { in: outboxIds } } });
  }
  if (parent) {
    await prisma.parentStudentLink.deleteMany({ where: { parentUserId: parent.id } });
    await prisma.user.delete({ where: { id: parent.id } });
  }
}

async function main() {
  assertLocalQaDatabase();
  await cleanup();
  try {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { login: "qa_admin" },
      select: { id: true },
    });
    const critical = await upsertAdminJournalEntry({
      sourceKey: `${PREFIX}critical`,
      type: "crm_sync",
      severity: "critical",
      source: "crm",
      linkedEntityType: "crm_outbox_event",
      linkedEntityId: "QA-JOURNAL-E2E-CRITICAL",
      title: "E2E critical",
      summary: "Critical entry",
    });
    const high = await upsertAdminJournalEntry({
      sourceKey: `${PREFIX}high`,
      type: "crm_sync",
      severity: "high",
      source: "crm",
      linkedEntityType: "crm_outbox_event",
      linkedEntityId: "QA-JOURNAL-E2E-HIGH",
      title: "E2E high",
      summary: "High entry",
    });
    await upsertAdminJournalEntry({
      sourceKey: `${PREFIX}critical`,
      type: "crm_sync",
      severity: "critical",
      source: "crm",
      linkedEntityType: "crm_outbox_event",
      linkedEntityId: "QA-JOURNAL-E2E-CRITICAL",
      title: "E2E critical updated",
      summary: "Same source remains one entry",
    });
    assert.equal(await prisma.adminJournalEntry.count({ where: { sourceKey: `${PREFIX}critical` } }), 1);
    assert.equal(await prisma.adminJournalAction.count({ where: { entryId: critical.id, action: "created" } }), 1);

    const serviceList = await listAdminJournal({ limit: 100 });
    const relevant = serviceList.items.filter((item) => item.sourceKey.startsWith(PREFIX));
    assert.deepEqual(relevant.slice(0, 2).map((item) => item.id), [critical.id, high.id]);
    assert.equal(Object.prototype.hasOwnProperty.call(relevant[0], "assignee"), false);

    await assert.rejects(
      changeAdminJournalStatus({
        entryId: critical.id,
        status: "resolved",
        idempotencyKey: `${PREFIX}missing-resolution`,
      }),
      /Укажите решение/,
    );

    const [adminToken, teacherToken] = await Promise.all([login("qa_admin"), login("qa_teacher_1")]);
    const adminRead = await request("/admin/journal?limit=100", { token: adminToken });
    assert.equal(adminRead.response.status, 200);
    assert.equal(adminRead.payload.data.items.some((item: { id: string }) => item.id === critical.id), true);
    const teacherRead = await request("/admin/journal", { token: teacherToken });
    assert.equal(teacherRead.response.status, 403);

    const startKey = randomUUID();
    const started = await request(`/admin/journal/${critical.id}/status`, {
      method: "PATCH",
      token: adminToken,
      body: { status: "in_progress", idempotencyKey: startKey },
    });
    assert.equal(started.response.status, 200);
    const repeated = await request(`/admin/journal/${critical.id}/status`, {
      method: "PATCH",
      token: adminToken,
      body: { status: "in_progress", idempotencyKey: startKey },
    });
    assert.equal(repeated.response.status, 200);
    assert.equal(await prisma.adminJournalAction.count({ where: { actionKey: startKey } }), 1);

    const missingResolution = await request(`/admin/journal/${critical.id}/status`, {
      method: "PATCH",
      token: adminToken,
      body: { status: "resolved", idempotencyKey: randomUUID() },
    });
    assert.equal(missingResolution.response.status, 400);

    const resolutionKey = randomUUID();
    const resolved = await request(`/admin/journal/${critical.id}/status`, {
      method: "PATCH",
      token: adminToken,
      body: {
        status: "resolved",
        resolution: "E2E: конфликт проверен и закрыт администратором",
        idempotencyKey: resolutionKey,
      },
    });
    assert.equal(resolved.response.status, 200);
    assert.equal(resolved.payload.data.status, "resolved");
    const action = await prisma.adminJournalAction.findUniqueOrThrow({
      where: { actionKey: resolutionKey },
      select: { actorId: true, note: true },
    });
    assert.equal(action.actorId, admin.id);
    assert.match(action.note ?? "", /закрыт администратором/);

    const teacherWrite = await request(`/admin/journal/${high.id}/status`, {
      method: "PATCH",
      token: teacherToken,
      body: { status: "in_progress", idempotencyKey: randomUUID() },
    });
    assert.equal(teacherWrite.response.status, 403);

    const crmEvent = await prisma.crmOutboxEvent.create({
      data: {
        aggregateType: "offline_lesson",
        aggregateId: "QA-JOURNAL-CRM-CLASS",
        eventType: "qa_unsupported_event",
        payload: { crmClassId: "QA-JOURNAL-CRM-CLASS", body: {} },
        idempotencyKey: `${PREFIX}crm-outbox`,
      },
      select: { id: true },
    });
    const failedCrmEvent = await processCrmOutboxEvent(crmEvent.id);
    assert.equal(failedCrmEvent?.status, "conflict");
    const crmJournal = await prisma.adminJournalEntry.findUniqueOrThrow({
      where: { sourceKey: `crm-sync:${crmEvent.id}` },
      include: { actions: true },
    });
    assert.equal(crmJournal.severity, "critical");
    assert.equal(crmJournal.actions.filter((action) => action.action === "created").length, 1);
    const conflict = await prisma.crmSyncConflict.findFirstOrThrow({
      where: { outboxEventId: crmEvent.id },
      select: { id: true },
    });
    await resolveCrmSyncConflict(
      conflict.id,
      admin.id,
      "accept_crm",
      "E2E: конфликт CRM подтверждён администратором",
    );
    const resolvedCrmJournal = await prisma.adminJournalEntry.findUniqueOrThrow({
      where: { id: crmJournal.id },
      include: { actions: true },
    });
    assert.equal(resolvedCrmJournal.status, "resolved");
    assert.equal(resolvedCrmJournal.actions.some((action) => action.action === "auto_resolved"), true);

    const [parentRole, student] = await Promise.all([
      prisma.role.findUniqueOrThrow({ where: { slug: "parent" }, select: { id: true } }),
      prisma.user.findUniqueOrThrow({ where: { login: "qa_student_3" }, select: { id: true } }),
    ]);
    await prisma.user.create({
      data: {
        login: TEMP_PARENT_LOGIN,
        phone: "+77009990999",
        phoneNormalized: "77009990999",
        passwordHash: "qa-fixture-cannot-login",
        firstName: "Тестовый",
        lastName: "Родитель",
        roleId: parentRole.id,
        leagueEligible: false,
      },
    });
    const parentLink = await linkExistingParentToStudent({
      studentId: student.id,
      actorId: admin.id,
      login: TEMP_PARENT_LOGIN,
      relationship: "guardian",
    });
    const grantedJournal = await prisma.adminJournalEntry.findUniqueOrThrow({
      where: { sourceKey: `parent-access:${parentLink.linkId}:granted` },
      include: { actions: true },
    });
    assert.equal(grantedJournal.status, "resolved");
    assert.equal(grantedJournal.actions[0]?.actorId, admin.id);
    await revokeParentLink({ studentId: student.id, linkId: parentLink.linkId, actorId: admin.id });
    const revokedJournal = await prisma.adminJournalEntry.findUniqueOrThrow({
      where: { sourceKey: `parent-access:${parentLink.linkId}:revoked` },
    });
    assert.equal(revokedJournal.status, "resolved");
    console.log("Admin journal V2 E2E passed");
  } finally {
    await cleanup();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
