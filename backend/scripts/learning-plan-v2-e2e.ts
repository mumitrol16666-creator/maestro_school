import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const API_BASE = process.env.LEARNING_API_URL ?? "http://127.0.0.1:4000/api/v1";
const TEST_MONTH = "2099-12";
const QA_STUDENT_ID = "QA-STUDENT-1";
const QA_GROUP_ID = "QA-GROUP-1";
const PASSWORD = "QaMaestro2026!";

function assertLocalRun() {
  if (process.env.MAESTRO_QA_LOCAL !== "true") {
    throw new Error("Learning V2 E2E requires MAESTRO_QA_LOCAL=true");
  }
  if (process.env.FEATURE_LEARNING_TOPICS_V2 !== "true") {
    throw new Error("Learning V2 E2E requires FEATURE_LEARNING_TOPICS_V2=true");
  }
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const hostname = new URL(databaseUrl).hostname.toLowerCase();
  if (!["localhost", "127.0.0.1", "postgres", "db"].includes(hostname)) {
    throw new Error(`Refusing E2E cleanup against non-local database host: ${hostname}`);
  }
}

async function request(
  path: string,
  options: RequestInit & { token?: string } = {},
) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
  });
  const body = await response.json() as {
    data?: Record<string, unknown>;
    error?: { code?: string; message?: string };
  };
  return { response, body };
}

async function login(login: string) {
  const { response, body } = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone: login, password: PASSWORD }),
  });
  assert.equal(response.status, 200, body.error?.message);
  const token = body.data?.token;
  assert.equal(typeof token, "string");
  return token as string;
}

async function cleanup() {
  assertLocalRun();
  const plans = await prisma.learningPlan.findMany({
    where: {
      month: TEST_MONTH,
      OR: [{ crmStudentId: QA_STUDENT_ID }, { crmGroupId: QA_GROUP_ID }],
    },
    include: { versions: { include: { topics: true } } },
  });
  const planIds = plans.map((plan) => plan.id);
  const topicIds = plans.flatMap((plan) => (
    plan.versions.flatMap((version) => version.topics.map((topic) => topic.topicId))
  ));
  if (planIds.length) {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [...planIds, ...topicIds] } },
    });
    await prisma.learningPlan.deleteMany({ where: { id: { in: planIds } } });
  }
  if (topicIds.length) {
    await prisma.learningTopic.deleteMany({ where: { id: { in: topicIds } } });
  }
}

async function main() {
  assertLocalRun();
  await cleanup();

  const [teacherToken, foreignTeacherToken, studentToken] = await Promise.all([
    login("qa_teacher_1"),
    login("qa_teacher_2"),
    login("qa_student_1"),
  ]);
  const directionsResult = await request("/teachers/me/crm-directions", {
    token: teacherToken,
  });
  assert.equal(directionsResult.response.status, 200);
  const directions = directionsResult.body.data as unknown as Array<{
    crmDirectionId: string;
    title: string;
  }>;
  const guitar = directions.find((direction) => direction.title === "Гитара");
  assert.ok(guitar?.crmDirectionId, "CRM guitar direction is missing");

  const studentDraft = {
    month: TEST_MONTH,
    crmDirectionId: guitar.crmDirectionId,
    expectedVersion: 0,
    goal: "DEV-01B contract",
    expectedResult: "Versioned normalized plan",
    skills: "Rhythm",
    checkpoint: "Local E2E",
    note: "Synthetic QA data",
    items: [{
      id: "e2e-student-topic-1",
      title: "Stable rhythm",
      status: "planned",
      masteryCriteria: "Three clean repetitions",
    }],
  };
  const created = await request(`/teachers/me/students/${QA_STUDENT_ID}/monthly-plan`, {
    method: "PUT",
    token: teacherToken,
    body: JSON.stringify(studentDraft),
  });
  assert.equal(created.response.status, 200, created.body.error?.message);
  const createdPlan = created.body.data as {
    id: string;
    idempotent: boolean;
    version: number;
    items: Array<{ id: string }>;
  };
  assert.equal(createdPlan.version, 1);
  assert.equal(createdPlan.idempotent, false);
  const topicId = createdPlan.items[0]?.id;
  assert.ok(topicId);

  const repeated = await request(`/teachers/me/students/${QA_STUDENT_ID}/monthly-plan`, {
    method: "PUT",
    token: teacherToken,
    body: JSON.stringify({ ...studentDraft, expectedVersion: 1 }),
  });
  assert.equal(repeated.response.status, 200);
  assert.equal((repeated.body.data as { idempotent: boolean }).idempotent, true);

  const stale = await request(`/teachers/me/students/${QA_STUDENT_ID}/monthly-plan`, {
    method: "PUT",
    token: teacherToken,
    body: JSON.stringify({ ...studentDraft, expectedVersion: 0, goal: "stale" }),
  });
  assert.equal(stale.response.status, 409);
  assert.equal(stale.body.error?.code, "MONTHLY_PLAN_STALE_DRAFT");

  const sourceKey = `qa:e2e:learning-v2:${createdPlan.id}:40`;
  const progress = await request(`/teachers/me/learning-topics/${topicId}/progress`, {
    method: "PATCH",
    token: teacherToken,
    body: JSON.stringify({
      toPercent: 40,
      expectedPercent: 0,
      sourceKey,
      comment: "E2E progress",
    }),
  });
  assert.equal(progress.response.status, 200);
  assert.equal((progress.body.data as { progressPercent: number }).progressPercent, 40);

  const repeatedProgress = await request(`/teachers/me/learning-topics/${topicId}/progress`, {
    method: "PATCH",
    token: teacherToken,
    body: JSON.stringify({ toPercent: 40, expectedPercent: 0, sourceKey }),
  });
  assert.equal(repeatedProgress.response.status, 200);
  assert.equal((repeatedProgress.body.data as { idempotent: boolean }).idempotent, true);

  const forbiddenMastery = await request(`/teachers/me/learning-topics/${topicId}/progress`, {
    method: "PATCH",
    token: teacherToken,
    body: JSON.stringify({
      toPercent: 100,
      expectedPercent: 40,
      sourceKey: `${sourceKey}:100`,
    }),
  });
  assert.equal(forbiddenMastery.response.status, 400);
  assert.equal(forbiddenMastery.body.error?.code, "LEARNING_TOPIC_100_REQUIRES_LESSON");

  const publishedStudent = await request(`/teachers/me/students/${QA_STUDENT_ID}/monthly-plan/publish`, {
    method: "POST",
    token: teacherToken,
    body: JSON.stringify({
      month: TEST_MONTH,
      crmDirectionId: guitar.crmDirectionId,
      expectedDraftRevision: 1,
    }),
  });
  assert.equal(publishedStudent.response.status, 200, publishedStudent.body.error?.message);

  const changedDraft = await request(`/teachers/me/students/${QA_STUDENT_ID}/monthly-plan`, {
    method: "PUT",
    token: teacherToken,
    body: JSON.stringify({
      ...studentDraft,
      expectedVersion: 1,
      goal: "Unpublished V2 goal",
      items: studentDraft.items.map((item) => ({ ...item, status: "in_progress" })),
    }),
  });
  assert.equal(changedDraft.response.status, 200, changedDraft.body.error?.message);
  const changedPublication = (changedDraft.body.data as {
    version: number;
    publication: { isPublished: boolean; publishedAt: string | null; hasUnpublishedChanges: boolean };
  });
  assert.equal(changedPublication.version, 2);
  assert.equal(changedPublication.publication.isPublished, true);
  assert.equal(changedPublication.publication.hasUnpublishedChanges, true);
  assert.ok(changedPublication.publication.publishedAt);

  const foreignAccess = await request(`/teachers/me/learning-topics/${topicId}`, {
    token: foreignTeacherToken,
  });
  assert.equal(foreignAccess.response.status, 400);
  assert.equal(foreignAccess.body.error?.code, "STUDENT_NOT_ASSIGNED");

  const groupDraft = await request(`/teachers/me/groups/${QA_GROUP_ID}/monthly-plan`, {
    method: "PUT",
    token: teacherToken,
    body: JSON.stringify({
      month: TEST_MONTH,
      crmDirectionId: guitar.crmDirectionId,
      expectedVersion: 0,
      goal: "Group plan E2E",
      expectedResult: "Shared topic",
      skills: "Ensemble",
      checkpoint: "Group run",
      note: "Synthetic QA data",
      items: [{
        id: "e2e-group-topic-1",
        title: "Shared tempo",
        status: "planned",
        masteryCriteria: "Two clean group repetitions",
      }],
      materials: [{
        id: "e2e-material-1",
        title: "Backing track",
        url: "https://example.com/backing-track",
        note: "90 BPM",
      }],
    }),
  });
  assert.equal(groupDraft.response.status, 200, groupDraft.body.error?.message);
  const groupVersion = (groupDraft.body.data as { version: number }).version;
  const published = await request(`/teachers/me/groups/${QA_GROUP_ID}/monthly-plan/publish`, {
    method: "POST",
    token: teacherToken,
    body: JSON.stringify({
      month: TEST_MONTH,
      crmDirectionId: guitar.crmDirectionId,
      expectedDraftRevision: groupVersion,
    }),
  });
  assert.equal(published.response.status, 200, published.body.error?.message);

  const studentPlans = await request(`/students/me/monthly-plans?month=${TEST_MONTH}`, {
    token: studentToken,
  });
  assert.equal(studentPlans.response.status, 200);
  const plans = (studentPlans.body.data as { plans: Array<{
    scope: string;
    goal: string;
    direction: { crmDirectionId: string };
    materials: unknown[];
    checkpoint?: string;
    note?: string;
  }> }).plans;
  const publishedIndividual = plans.find((plan) => plan.scope === "student");
  const publishedGroup = plans.find((plan) => plan.scope === "group");
  assert.equal(publishedIndividual?.goal, studentDraft.goal);
  assert.equal("checkpoint" in (publishedIndividual ?? {}), false);
  assert.equal("note" in (publishedIndividual ?? {}), false);
  assert.equal(publishedGroup?.direction.crmDirectionId, guitar.crmDirectionId);
  assert.equal(publishedGroup?.materials.length, 1);
  assert.equal("checkpoint" in (publishedGroup ?? {}), false);
  assert.equal("note" in (publishedGroup ?? {}), false);

  console.log("DEV-01B local E2E passed", {
    direction: guitar.crmDirectionId,
    optimisticVersion: true,
    idempotentProgress: true,
    foreignTeacherDenied: true,
    groupPublishedForStudent: true,
  });
}

main()
  .finally(cleanup)
  .finally(() => prisma.$disconnect());
