import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

/**
 * Sector contract end-to-end on the local QA stack, on the seeded sector 1 of
 * QA-STUDENT-1 (the only student on the QA teacher's roster): the teacher adds
 * a topic → idempotent save → stale version → topic progress → publish → the
 * student sees «Сектор 1» and the group sector, proposes a song → the teacher
 * accepts it. The seeded content is restored through the same API at the end.
 */
const prisma = new PrismaClient();
const API_BASE = process.env.LEARNING_API_URL ?? "http://127.0.0.1:4000/api/v1";
const QA_STUDENT_ID = "QA-STUDENT-1";
const QA_STUDENT_LOGIN = "qa_student_1";
const PASSWORD = "QaMaestro2026!";
const E2E_PREFIX = "E2E сектор: ";

function assertLocalRun() {
  if (process.env.MAESTRO_QA_LOCAL !== "true") {
    throw new Error("Sector E2E requires MAESTRO_QA_LOCAL=true");
  }
  if (process.env.FEATURE_LEARNING_TOPICS_V2 !== "true") {
    throw new Error("Sector E2E requires FEATURE_LEARNING_TOPICS_V2=true");
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
  await prisma.learningSectorProposal.deleteMany({
    where: { crmStudentId: QA_STUDENT_ID, text: { startsWith: E2E_PREFIX } },
  });
}

type PlanItemDto = { id: string; title: string; status: string; masteryCriteria: string };
type PlanMaterialDto = { id: string; title: string; url: string; note: string };

type PlanDto = {
  id: string;
  idempotent: boolean;
  version: number;
  sequence: number;
  status: string;
  goal: string;
  expectedResult: string;
  skills: string;
  checkpoint: string;
  note: string;
  items: PlanItemDto[];
  materials: PlanMaterialDto[];
  publication: { isPublished: boolean; publishedAt: string | null; hasUnpublishedChanges: boolean };
};

/** Puts the seeded sector back exactly as it was published, so other QA runs see the seed. */
async function restore(planPath: string, teacherToken: string, crmDirectionId: string, original: PlanDto) {
  const current = await request(`${planPath}?crmDirectionId=${encodeURIComponent(crmDirectionId)}`, { token: teacherToken });
  const plan = current.body.data?.plan as PlanDto | null | undefined;
  if (!plan) return;
  const body = {
    crmDirectionId,
    expectedVersion: plan.version,
    goal: original.goal,
    expectedResult: original.expectedResult,
    skills: original.skills,
    checkpoint: original.checkpoint,
    note: original.note,
    items: original.items.map(({ id, title, status, masteryCriteria }) => ({ id, title, status, masteryCriteria })),
    materials: original.materials,
  };
  const saved = await request(planPath, { method: "PUT", token: teacherToken, body: JSON.stringify(body) });
  assert.equal(saved.response.status, 200, `restore failed: ${saved.body.error?.message}`);
  const savedPlan = saved.body.data as unknown as PlanDto;
  if (!savedPlan.idempotent || savedPlan.publication.hasUnpublishedChanges) {
    const published = await request(`${planPath}/publish`, {
      method: "POST",
      token: teacherToken,
      body: JSON.stringify({ crmDirectionId, expectedDraftRevision: savedPlan.version }),
    });
    assert.equal(published.response.status, 200, `restore publish failed: ${published.body.error?.message}`);
  }
}

async function main() {
  assertLocalRun();
  await cleanup();

  const [teacherToken, foreignTeacherToken, studentToken] = await Promise.all([
    login("qa_teacher_1"),
    login("qa_teacher_2"),
    login(QA_STUDENT_LOGIN),
  ]);
  const directionsResult = await request("/teachers/me/crm-directions", { token: teacherToken });
  assert.equal(directionsResult.response.status, 200);
  const directions = directionsResult.body.data as unknown as Array<{ crmDirectionId: string; title: string }>;
  const guitar = directions.find((direction) => direction.title === "Гитара");
  assert.ok(guitar?.crmDirectionId, "CRM guitar direction is missing");
  const planPath = `/teachers/me/students/${QA_STUDENT_ID}/monthly-plan`;
  const dir = `crmDirectionId=${encodeURIComponent(guitar.crmDirectionId)}`;

  // The seed leaves sector 1 published for this student; work on top of it.
  const before = await request(`${planPath}?${dir}`, { token: teacherToken });
  assert.equal(before.response.status, 200, before.body.error?.message);
  const original = before.body.data?.plan as PlanDto | null;
  assert.ok(original, "seeded sector 1 is missing — run qa-seed first");
  assert.equal(original.sequence, 1);
  assert.equal(original.status, "active");
  const baseVersion = original.version;
  const seededTopicIds = original.items.map((item) => item.id);

  const studentDraft = {
    crmDirectionId: guitar.crmDirectionId,
    expectedVersion: baseVersion,
    goal: `${E2E_PREFIX}${original.goal}`,
    expectedResult: original.expectedResult,
    skills: original.skills,
    checkpoint: original.checkpoint,
    note: original.note,
    items: [
      ...original.items.map(({ id, title, status, masteryCriteria }) => ({ id, title, status, masteryCriteria })),
      {
        id: "e2e-student-topic-1",
        title: `${E2E_PREFIX}Стабильный ритм`,
        status: "planned",
        masteryCriteria: "Три чистых повтора",
      },
    ],
    materials: original.materials,
  };
  let restoreNeeded = false;
  try {
  const created = await request(planPath, {
    method: "PUT",
    token: teacherToken,
    body: JSON.stringify(studentDraft),
  });
  assert.equal(created.response.status, 200, created.body.error?.message);
  restoreNeeded = true;
  const createdPlan = created.body.data as unknown as PlanDto;
  assert.equal(createdPlan.version, baseVersion + 1);
  assert.equal(createdPlan.sequence, 1);
  assert.equal(createdPlan.status, "active");
  assert.equal(createdPlan.idempotent, false);
  const topicId = createdPlan.items.find((item) => !seededTopicIds.includes(item.id))?.id;
  assert.ok(topicId, "the added topic got an id");

  const repeated = await request(planPath, {
    method: "PUT",
    token: teacherToken,
    body: JSON.stringify({ ...studentDraft, expectedVersion: baseVersion + 1 }),
  });
  assert.equal(repeated.response.status, 200, repeated.body.error?.message);
  assert.equal((repeated.body.data as { idempotent: boolean }).idempotent, true);

  const stale = await request(planPath, {
    method: "PUT",
    token: teacherToken,
    body: JSON.stringify({ ...studentDraft, expectedVersion: baseVersion, goal: "stale" }),
  });
  assert.equal(stale.response.status, 409);
  assert.equal(stale.body.error?.code, "MONTHLY_PLAN_STALE_DRAFT");

  const sourceKey = `qa:e2e:learning-v2:${createdPlan.id}:40`;
  const progress = await request(`/teachers/me/learning-topics/${topicId}/progress`, {
    method: "PATCH",
    token: teacherToken,
    body: JSON.stringify({ toPercent: 40, expectedPercent: 0, sourceKey, comment: "E2E progress" }),
  });
  assert.equal(progress.response.status, 200, progress.body.error?.message);
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
    body: JSON.stringify({ toPercent: 100, expectedPercent: 40, sourceKey: `${sourceKey}:100` }),
  });
  assert.equal(forbiddenMastery.response.status, 400);
  assert.equal(forbiddenMastery.body.error?.code, "LEARNING_TOPIC_100_REQUIRES_LESSON");

  const publishedStudent = await request(`${planPath}/publish`, {
    method: "POST",
    token: teacherToken,
    body: JSON.stringify({ crmDirectionId: guitar.crmDirectionId, expectedDraftRevision: baseVersion + 1 }),
  });
  assert.equal(publishedStudent.response.status, 200, publishedStudent.body.error?.message);

  const changedDraft = await request(planPath, {
    method: "PUT",
    token: teacherToken,
    body: JSON.stringify({
      ...studentDraft,
      expectedVersion: baseVersion + 1,
      goal: `${E2E_PREFIX}правка`,
      items: studentDraft.items.map((item) => (item.id === "e2e-student-topic-1" ? { ...item, status: "in_progress" } : item)),
    }),
  });
  assert.equal(changedDraft.response.status, 200, changedDraft.body.error?.message);
  const changedPlan = changedDraft.body.data as unknown as PlanDto;
  assert.equal(changedPlan.version, baseVersion + 2);
  assert.equal(changedPlan.sequence, 1);
  assert.equal(changedPlan.publication.isPublished, true);
  assert.equal(changedPlan.publication.hasUnpublishedChanges, true);
  assert.ok(changedPlan.publication.publishedAt);

  const foreignAccess = await request(`/teachers/me/learning-topics/${topicId}`, { token: foreignTeacherToken });
  assert.equal(foreignAccess.response.status, 400);
  assert.equal(foreignAccess.body.error?.code, "STUDENT_NOT_ASSIGNED");

  // The student sees sector 1 (published version) and the seeded group sector.
  const studentPlans = await request("/students/me/monthly-plans", { token: studentToken });
  assert.equal(studentPlans.response.status, 200, studentPlans.body.error?.message);
  const plans = (studentPlans.body.data as { plans: Array<{
    id: string;
    scope: string;
    goal: string;
    sequence: number;
    status: string;
    direction: { crmDirectionId: string };
    checkpoint?: string;
    note?: string;
  }> }).plans;
  const publishedIndividual = plans.find((plan) => plan.scope === "student");
  assert.equal(publishedIndividual?.id, original.id);
  assert.equal(publishedIndividual?.goal, studentDraft.goal, "student sees the published version, not the draft");
  assert.equal(publishedIndividual?.sequence, 1);
  assert.equal(publishedIndividual?.status, "active");
  assert.equal("checkpoint" in (publishedIndividual ?? {}), false);
  assert.equal("note" in (publishedIndividual ?? {}), false);
  const publishedGroup = plans.find((plan) => plan.scope === "group");
  assert.equal(publishedGroup?.direction.crmDirectionId, guitar.crmDirectionId, "seeded group sector is visible");

  const history = await request("/students/me/monthly-plans?history=1", { token: studentToken });
  assert.equal(history.response.status, 200);
  const historyPlans = (history.body.data as { plans: Array<{ status: string }> }).plans;
  assert.ok(historyPlans.length >= plans.length);
  assert.equal(historyPlans.filter((plan) => plan.status === "closed").length, 0, "the seed has no closed sector");

  // Proposal: the student asks for a song, the teacher accepts it.
  const proposal = await request("/students/me/sector-proposals", {
    method: "POST",
    token: studentToken,
    body: JSON.stringify({
      crmDirectionId: guitar.crmDirectionId,
      kind: "song",
      text: `${E2E_PREFIX}«Кукла колдуна» — Король и Шут`,
    }),
  });
  assert.equal(proposal.response.status, 201, proposal.body.error?.message);
  const proposalId = (proposal.body.data as { id: string; status: string }).id;
  assert.equal((proposal.body.data as { status: string }).status, "new");

  const queue = await request(`/teachers/me/sector-proposals?status=new&crmStudentId=${QA_STUDENT_ID}`, { token: teacherToken });
  assert.equal(queue.response.status, 200, queue.body.error?.message);
  assert.ok((queue.body.data as unknown as Array<{ id: string }>).some((item) => item.id === proposalId));

  const foreignDecision = await request(`/teachers/me/sector-proposals/${proposalId}/decision`, {
    method: "POST",
    token: foreignTeacherToken,
    body: JSON.stringify({ decision: "accepted" }),
  });
  assert.notEqual(foreignDecision.response.status, 200, "a foreign teacher cannot decide");

  const decided = await request(`/teachers/me/sector-proposals/${proposalId}/decision`, {
    method: "POST",
    token: teacherToken,
    body: JSON.stringify({ decision: "accepted", reply: "Берём в сектор" }),
  });
  assert.equal(decided.response.status, 200, decided.body.error?.message);
  assert.equal((decided.body.data as { status: string }).status, "accepted");

  const studentProposals = await request("/students/me/sector-proposals", { token: studentToken });
  assert.equal(studentProposals.response.status, 200);
  const mine = (studentProposals.body.data as unknown as Array<{ id: string; status: string; teacherReply: string | null }>)
    .find((item) => item.id === proposalId);
  assert.equal(mine?.status, "accepted");
  assert.equal(mine?.teacherReply, "Берём в сектор");

  } finally {
    if (restoreNeeded) await restore(planPath, teacherToken, guitar.crmDirectionId, original);
  }

  console.log("Sector local E2E passed", {
    direction: guitar.crmDirectionId,
    sector: 1,
    optimisticVersion: true,
    idempotentProgress: true,
    foreignTeacherDenied: true,
    groupSectorVisible: true,
    proposalAccepted: true,
  });
}

main()
  .finally(cleanup)
  .finally(() => prisma.$disconnect());
