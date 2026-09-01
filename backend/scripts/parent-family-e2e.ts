import { createServer } from "node:http";
import { EconomicEpochStatus, PrismaClient } from "@prisma/client";
import { assertLocalE2eDatabase } from "./qa-database-guard.js";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4000";
const API = `${BASE_URL}/api/v1`;
const INTEGRATION_API = `${BASE_URL}/api/integration/v1`;
const ADMIN_LOGIN = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const INTEGRATION_SECRET = process.env.INTEGRATION_SERVICE_SECRET;
const CRM_STUB_PORT = Number(process.env.CRM_STUB_PORT ?? 4012);
const prisma = new PrismaClient();
const createdUserIds: string[] = [];
let cleanupSuffix: string | null = null;

type ErrorEnvelope = {
  error?: { code?: string; message?: string };
};

async function request<T>(
  method: string,
  url: string,
  options: {
    token?: string;
    body?: unknown;
    expectStatus?: number;
    integration?: boolean;
  } = {},
) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.integration) {
    if (!INTEGRATION_SECRET) throw new Error("INTEGRATION_SERVICE_SECRET is required");
    headers.Authorization = `Bearer ${INTEGRATION_SECRET}`;
    headers["X-Integration-System"] = "crm";
  } else if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }).catch((error) => {
    throw new Error(`${method} ${url} failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  const payload = await response.json().catch(() => ({})) as {
    data?: T;
    success?: boolean;
  } & ErrorEnvelope;
  const expected = options.expectStatus ?? 200;
  if (response.status !== expected) {
    throw new Error(
      `${method} ${url} → ${response.status}, expected ${expected}: ${
        payload.error?.message ?? JSON.stringify(payload)
      }`,
    );
  }
  return payload.data as T;
}

async function login(input: string, password: string, profile: "student" | "parent" | "staff") {
  return request<{ token: string; user: { id: string; role: string; login: string } }>(
    "POST",
    `${API}/auth/login`,
    { body: { phone: input, password, profile } },
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function enrollStudentsInActiveEpoch(studentIds: string[], sourceSuffix: string) {
  const epoch = await prisma.economicEpoch.findFirst({
    where: { status: EconomicEpochStatus.active },
  });
  if (!epoch) return;

  const activatedAt = new Date();
  await prisma.$transaction(async (tx) => {
    for (const studentId of studentIds) {
      await tx.economicEpochParticipant.upsert({
        where: { epochId_studentId: { epochId: epoch.id, studentId } },
        create: {
          epochId: epoch.id,
          studentId,
          openingPoints: epoch.openingPoints,
          openingWeeklyXp: epoch.openingWeeklyXp,
          openingCoins: epoch.openingCoins,
          openingLevel: 1,
          legacyPointsSnapshot: 0,
          legacyWeeklyXpSnapshot: 0,
          legacyCoinsSnapshot: 0,
          sourceKey: `e2e:parent-family:${sourceSuffix}:epoch:${studentId}`,
          activatedAt,
        },
        update: {},
      });
      await tx.studentCoinBalance.upsert({
        where: { studentId },
        create: { studentId, balance: epoch.openingCoins, economicEpochId: epoch.id },
        update: { balance: epoch.openingCoins, economicEpochId: epoch.id },
      });
    }
  });
}

async function cleanupCreatedFixtures() {
  assertLocalE2eDatabase();
  if (cleanupSuffix) {
    await prisma.offlineLessonStudentCheck.deleteMany({
      where: { crmClassId: { contains: cleanupSuffix } },
    });
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
}

function startCrmStub(summaries: Map<string, Record<string, unknown>>) {
  const server = createServer((req, res) => {
    const match = req.url?.match(/^\/api\/integration\/v1\/students\/([^/]+)\/offline-summary$/);
    const crmStudentId = match ? decodeURIComponent(match[1]) : "";
    const summary = summaries.get(crmStudentId);
    res.setHeader("Content-Type", "application/json");
    if (!summary) {
      res.statusCode = 404;
      res.end(JSON.stringify({ success: false, error: "Student summary not found" }));
      return;
    }
    res.end(JSON.stringify({ success: true, data: summary }));
  });
  return new Promise<ReturnType<typeof createServer>>((resolve) => {
    server.listen(CRM_STUB_PORT, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  assertLocalE2eDatabase();
  if (!ADMIN_LOGIN || !ADMIN_PASSWORD) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
  }

  const suffix = Date.now();
  cleanupSuffix = String(suffix);
  const sharedPhone = `7700${String(suffix).slice(-7)}`;
  const secondPhone = `7701${String(suffix + 1).slice(-7)}`;
  const studentPassword = `Student_${suffix}!`;
  const parentPassword = `Parent_${suffix}!`;
  const resetPassword = `Reset_${suffix}!`;
  const finalPassword = `Final_${suffix}!`;
  const studentOneLogin = `audit_student_${String(suffix).slice(-8)}`;
  const studentTwoLogin = `audit_student2_${String(suffix).slice(-7)}`;
  const parentLogin = `audit_parent_${String(suffix).slice(-9)}`;

  const admin = await login(ADMIN_LOGIN, ADMIN_PASSWORD, "staff");
  assert(admin.user.role === "admin", "staff profile must open the admin account");

  const studentOne = await request<{
    token: string;
    user: { id: string; role: string; login: string };
  }>("POST", `${API}/auth/register`, {
    expectStatus: 201,
    body: {
      firstName: "Первый",
      lastName: "Ученик",
      phone: sharedPhone,
      login: studentOneLogin,
      password: studentPassword,
    },
  });
  createdUserIds.push(studentOne.user.id);
  const studentTwo = await request<{
    token: string;
    user: { id: string; role: string; login: string };
  }>("POST", `${API}/auth/register`, {
    expectStatus: 201,
    body: {
      firstName: "Второй",
      lastName: "Ученик",
      phone: secondPhone,
      login: studentTwoLogin,
      password: studentPassword,
    },
  });
  createdUserIds.push(studentTwo.user.id);
  assert(studentOne.user.role === "student" && studentTwo.user.role === "student", "registration must create students");
  await enrollStudentsInActiveEpoch([studentOne.user.id, studentTwo.user.id], String(suffix));
  await request("GET", `${API}/admin/students`, {
    token: studentOne.token,
    expectStatus: 403,
  });

  await request("POST", `${API}/admin/students/${studentOne.user.id}/parents`, {
    token: admin.token,
    expectStatus: 400,
    body: {
      mode: "create",
      firstName: "Мама",
      lastName: "Тест",
      phone: "123",
      login: parentLogin,
      password: parentPassword,
      relationship: "mother",
    },
  });
  const parentLink = await request<{
    linkId: string;
    parent: { id: string; login: string; role: string };
  }>("POST", `${API}/admin/students/${studentOne.user.id}/parents`, {
    token: admin.token,
    expectStatus: 201,
    body: {
      mode: "create",
      firstName: "Мама",
      lastName: "Тест",
      phone: sharedPhone,
      login: parentLogin,
      password: parentPassword,
      relationship: "mother",
    },
  });
  createdUserIds.push(parentLink.parent.id);
  assert(parentLink.parent.role === "parent", "created account must have parent role");

  await request("POST", `${API}/admin/students/${studentTwo.user.id}/parents`, {
    token: admin.token,
    expectStatus: 409,
    body: {
      mode: "create",
      firstName: "Мама",
      lastName: "Тест",
      phone: sharedPhone,
      login: parentLogin,
      password: parentPassword,
      relationship: "mother",
    },
  });
  const secondLink = await request<{ linkId: string }>(
    "POST",
    `${API}/admin/students/${studentTwo.user.id}/parents`,
    {
      token: admin.token,
      expectStatus: 201,
      body: { mode: "link", login: parentLogin, relationship: "guardian" },
    },
  );
  const secondLinkAgain = await request<{ linkId: string }>(
    "POST",
    `${API}/admin/students/${studentTwo.user.id}/parents`,
    {
      token: admin.token,
      expectStatus: 201,
      body: { mode: "link", login: parentLogin, relationship: "guardian" },
    },
  );
  assert(secondLinkAgain.linkId === secondLink.linkId, "repeated parent link must be idempotent");

  const parentByPhone = await login(sharedPhone, parentPassword, "parent");
  const studentByPhone = await login(sharedPhone, studentPassword, "student");
  assert(parentByPhone.user.id === parentLink.parent.id, "parent profile must resolve shared phone to parent");
  assert(studentByPhone.user.id === studentOne.user.id, "student profile must resolve shared phone to student");

  const children = await request<Array<{ id: string }>>("GET", `${API}/parents/me/children`, {
    token: parentByPhone.token,
  });
  assert(children.length === 2, "parent must see both linked children");
  await request("GET", `${API}/admin/students`, {
    token: parentByPhone.token,
    expectStatus: 403,
  });
  await request("GET", `${API}/students/me/dashboard`, {
    token: parentByPhone.token,
    expectStatus: 403,
  });
  await request("GET", `${API}/messages`, {
    token: parentByPhone.token,
    expectStatus: 403,
  });

  await request("PATCH", `${API}/admin/students/${studentOne.user.id}/parents/${parentLink.linkId}/password`, {
    token: admin.token,
    body: { password: resetPassword },
  });
  await request("POST", `${API}/auth/login`, {
    expectStatus: 401,
    body: { phone: parentLogin, password: parentPassword, profile: "parent" },
  });
  const parentAfterReset = await login(parentLogin, resetPassword, "parent");
  await request("PATCH", `${API}/auth/me/password`, {
    token: parentAfterReset.token,
    expectStatus: 400,
    body: { currentPassword: resetPassword, newPassword: resetPassword },
  });
  await request("PATCH", `${API}/auth/me/password`, {
    token: parentAfterReset.token,
    expectStatus: 401,
    body: { currentPassword: "WrongPassword_2026!", newPassword: finalPassword },
  });
  await request("PATCH", `${API}/auth/me/password`, {
    token: parentAfterReset.token,
    body: { currentPassword: resetPassword, newPassword: finalPassword },
  });
  const parent = await login(parentLogin, finalPassword, "parent");

  const crmStudentOne = `crm-audit-${suffix}-1`;
  const crmStudentTwo = `crm-audit-${suffix}-2`;
  await prisma.user.update({
    where: { id: studentOne.user.id },
    data: { crmStudentId: crmStudentOne, externalLinkStatus: "linked" },
  });
  await prisma.user.update({
    where: { id: studentTwo.user.id },
    data: { crmStudentId: crmStudentTwo, externalLinkStatus: "linked" },
  });
  await prisma.offlineLessonStudentCheck.create({
    data: {
      crmClassId: `class-absent-${suffix}`,
      crmStudentId: crmStudentOne,
      attendanceStatus: "absent",
    },
  });
  await prisma.offlineLessonStudentCheck.create({
    data: {
      crmClassId: `class-present-${suffix}`,
      crmStudentId: crmStudentTwo,
      attendanceStatus: "present",
      homeworkStatus: "partial",
      homeworkCompletionPercent: 60,
    },
  });

  const summaries = new Map<string, Record<string, unknown>>([
    [crmStudentOne, {
      profile: { name: "Первый Ученик", groups: [] },
      balanceSnapshot: {
        classesRemainingTotal: 1,
        debtAmountKzt: 0,
        accountBalanceKzt: 4000,
        totalPaidAmountKzt: 0,
        currentMembership: null,
        memberships: [],
      },
      upcomingLessons: [],
      lessonHistory: [{
        crmClassId: `class-absent-${suffix}`,
        title: "Гитара",
        date: "2026-07-28",
        startTime: "10:00",
        attended: false,
        homework: "Повторить аккорды",
      }],
    }],
    [crmStudentTwo, {
      profile: { name: "Второй Ученик", groups: [] },
      balanceSnapshot: {
        classesRemainingTotal: 5,
        debtAmountKzt: 2500,
        accountBalanceKzt: 0,
        totalPaidAmountKzt: 0,
        currentMembership: null,
        memberships: [],
      },
      upcomingLessons: [],
      lessonHistory: [
        {
          crmClassId: `class-present-${suffix}`,
          title: "Гитара",
          date: "2026-07-28",
          startTime: "11:00",
          attended: true,
          homework: "Играть бой под метроном",
          homeworkResult: {
            status: "partial",
            completionPercent: 60,
            reviewedAt: "2026-07-28T06:30:00.000Z",
          },
        },
        {
          crmClassId: `class-homework-${suffix}`,
          title: "Предыдущий урок",
          date: "2026-07-21",
          startTime: "11:00",
          attended: true,
          homework: "Повторить бой под метроном",
        },
      ],
    }],
  ]);
  const crmStub = await startCrmStub(summaries);

  try {
    const approvedAbsent = await request<{
      parentsDelivered: number;
    }>("POST", `${INTEGRATION_API}/notifications/offline-lesson-approved`, {
      integration: true,
      body: {
        crmClassId: `class-absent-${suffix}`,
        crmTeacherId: `teacher-${suffix}`,
        crmStudentIds: [crmStudentOne],
        lessonTitle: "Гитара",
        date: "2026-07-28",
        startTime: "10:00",
      },
    });
    assert(approvedAbsent.parentsDelivered === 1, "absence event must reach the linked parent");
    await request("POST", `${INTEGRATION_API}/notifications/offline-lesson-approved`, {
      integration: true,
      body: {
        crmClassId: `class-absent-${suffix}`,
        crmTeacherId: `teacher-${suffix}`,
        crmStudentIds: [crmStudentOne],
        lessonTitle: "Гитара",
        date: "2026-07-28",
        startTime: "10:00",
      },
    });
    await request("POST", `${INTEGRATION_API}/notifications/offline-lesson-approved`, {
      integration: true,
      body: {
        crmClassId: `class-present-${suffix}`,
        crmTeacherId: `teacher-${suffix}`,
        crmStudentIds: [crmStudentTwo],
        lessonTitle: "Гитара",
        date: "2026-07-28",
        startTime: "11:00",
      },
    });
    await request("POST", `${INTEGRATION_API}/notifications/offline-lesson-event`, {
      integration: true,
      body: {
        crmClassId: `class-rescheduled-${suffix}`,
        crmStudentIds: [crmStudentOne],
        event: "rescheduled",
        lessonTitle: "Гитара",
        date: "2026-07-30",
        startTime: "12:00",
      },
    });
    await request("POST", `${INTEGRATION_API}/notifications/offline-lesson-event`, {
      integration: true,
      body: {
        crmClassId: `class-cancelled-${suffix}`,
        crmStudentIds: [crmStudentOne],
        event: "cancelled",
        lessonTitle: "Гитара",
        date: "2026-08-01",
        startTime: "12:00",
      },
    });
    const beforeReturned = await request<{ count: number }>(
      "GET",
      `${API}/students/me/notifications/unread-count`,
      { token: parent.token },
    );
    await request("POST", `${INTEGRATION_API}/notifications/offline-lesson-event`, {
      integration: true,
      body: {
        crmClassId: `class-returned-${suffix}`,
        crmStudentIds: [crmStudentOne],
        event: "returned",
        lessonTitle: "Гитара",
      },
    });
    const afterReturned = await request<{ count: number }>(
      "GET",
      `${API}/students/me/notifications/unread-count`,
      { token: parent.token },
    );
    assert(afterReturned.count === beforeReturned.count, "internal returned event must not notify parent");

    const notifications = await request<Array<{
      type: string;
      title: string;
      url: string | null;
    }>>("GET", `${API}/students/me/notifications?limit=20`, { token: parent.token });
    const types = new Set(notifications.map((item) => item.type));
    for (const required of [
      "parent_absence_alert",
      "parent_homework_reviewed",
      "parent_schedule_changed",
      "parent_lesson_cancelled",
      "parent_balance_alert",
    ]) {
      assert(types.has(required), `missing notification type: ${required}`);
    }
    assert(
      notifications.filter((item) => item.type === "parent_absence_alert").length === 1,
      "duplicate lesson event must not duplicate parent notification",
    );
    assert(
      notifications.every((item) => item.url?.startsWith("/family")),
      "parent notifications must only open the family portal",
    );

    await request("POST", `${API}/students/me/notifications/read-all`, {
      token: parent.token,
    });
    const unreadAfter = await request<{ count: number }>(
      "GET",
      `${API}/students/me/notifications/unread-count`,
      { token: parent.token },
    );
    assert(unreadAfter.count === 0, "mark all notifications read must clear the badge");
  } finally {
    await new Promise<void>((resolve, reject) => {
      crmStub.close((error) => error ? reject(error) : resolve());
    });
  }

  await request("DELETE", `${API}/admin/students/${studentTwo.user.id}/parents/${secondLink.linkId}`, {
    token: admin.token,
  });
  const childrenAfterUnlink = await request<Array<{ id: string }>>(
    "GET",
    `${API}/parents/me/children`,
    { token: parent.token },
  );
  assert(childrenAfterUnlink.length === 1, "unlink must remove only the selected child");

  console.log("Parent family input audit passed.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanupCreatedFixtures();
    } finally {
      await prisma.$disconnect();
    }
  });
