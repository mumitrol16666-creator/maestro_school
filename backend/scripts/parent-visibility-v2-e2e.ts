import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const API = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4000/api/v1";
const PASSWORD = "QaMaestro2026!";
const STUDENT_ID = "10000000-0000-4000-8000-000000000021";
const TEST_PREFIX = "[QA parent audience]";

type Envelope<T> = { data?: T; error?: { message?: string } };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertLocal() {
  if (process.env.MAESTRO_QA_LOCAL !== "true") throw new Error("Local QA flag is required");
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1|postgres|db)(:|\/)/.test(url) || /prod|neon|supabase|render/i.test(url)) {
    throw new Error("Refusing to run outside the local QA database");
  }
}

async function request<T>(path: string, options: {
  method?: string;
  token?: string;
  body?: unknown;
  status?: number;
} = {}) {
  const response = await fetch(`${API}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json().catch(() => ({})) as Envelope<T>;
  const expected = options.status ?? 200;
  if (response.status !== expected) {
    throw new Error(`${options.method ?? "GET"} ${path}: ${response.status}, expected ${expected}: ${payload.error?.message ?? "unknown"}`);
  }
  return payload.data as T;
}

async function login(login: string, profile: "student" | "parent" | "staff", password = PASSWORD) {
  return request<{ token: string }>("/auth/login", {
    method: "POST",
    body: { phone: login, password, profile },
  });
}

async function cleanup() {
  const requests = await prisma.parentVisibilityRequest.findMany({
    where: { studentId: STUDENT_ID },
    select: { id: true },
  });
  const requestIds = requests.map((item) => item.id);
  await prisma.$transaction([
    prisma.adminJournalEntry.deleteMany({
      where: {
        OR: [
          { sourceKey: { startsWith: "parent-visibility-request:" }, linkedEntityId: { in: requestIds.length ? requestIds : ["none"] } },
          { sourceKey: { startsWith: `parent-visibility-policy:${STUDENT_ID}:` } },
        ],
      },
    }),
    prisma.parentVisibilityRequest.deleteMany({ where: { studentId: STUDENT_ID } }),
    prisma.parentVisibilityPolicy.deleteMany({ where: { studentId: STUDENT_ID } }),
    prisma.newsPost.deleteMany({ where: { title: { startsWith: TEST_PREFIX } } }),
  ]);
}

async function main() {
  assertLocal();
  await cleanup();
  try {
    const [admin, student, parentOne, parentTwo] = await Promise.all([
      login(process.env.ADMIN_EMAIL ?? "admin@maestro.local", "staff", process.env.ADMIN_PASSWORD),
      login("qa_student_1", "student"),
      login("qa_parent_1", "parent"),
      login("qa_parent_2", "parent"),
    ]);

    const initial = await request<{ policy: Record<string, boolean>; pendingRequest: null }>("/students/me/parent-visibility", { token: student.token });
    assert(Object.values(initial.policy).every(Boolean), "default policy must expose all four parent modules");

    const requested = {
      showSchedule: true,
      showBalance: false,
      showPlanProgress: true,
      showAchievements: false,
    };
    const submitted = await request<{ id: string }>("/students/me/parent-visibility-requests", {
      method: "POST",
      token: student.token,
      status: 201,
      body: { requested, note: "Показывать только расписание и план" },
    });
    await request("/students/me/parent-visibility-requests", {
      method: "POST",
      token: student.token,
      status: 409,
      body: { requested: { ...requested, showBalance: true } },
    });
    await request(`/admin/students/${STUDENT_ID}/parent-visibility`, {
      method: "PATCH",
      token: student.token,
      status: 403,
      body: { visibility: requested, reason: "Forbidden" },
    });

    const adminWorkspace = await request<{ pendingRequest: { id: string } | null }>(`/admin/students/${STUDENT_ID}/parent-visibility`, { token: admin.token });
    assert(adminWorkspace.pendingRequest?.id === submitted.id, "admin must see the student's pending request");
    const decided = await request<{ policy: Record<string, boolean>; pendingRequest: null }>(
      `/admin/students/${STUDENT_ID}/parent-visibility-requests/${submitted.id}/decision`,
      {
        method: "POST",
        token: admin.token,
        body: { decision: "approved", note: "Согласовано для всех родителей" },
      },
    );
    assert(decided.policy.showBalance === false && decided.policy.showAchievements === false, "approved request must become the active policy");
    assert(decided.pendingRequest === null, "approved request must leave no pending request");

    const [policyCount, parentCount, journal] = await Promise.all([
      prisma.parentVisibilityPolicy.count({ where: { studentId: STUDENT_ID } }),
      prisma.parentStudentLink.count({ where: { studentUserId: STUDENT_ID, isActive: true } }),
      prisma.adminJournalEntry.findUnique({ where: { sourceKey: `parent-visibility-request:${submitted.id}` } }),
    ]);
    assert(policyCount === 1, "one child must have exactly one shared policy");
    assert(parentCount === 2, "QA child must have two parents sharing the same policy");
    assert(journal?.status === "resolved", "approved request must resolve its admin journal entry");

    const studentPost = await request<{ id: string }>("/admin/news", {
      method: "POST",
      token: admin.token,
      status: 201,
      body: { title: `${TEST_PREFIX} students`, content: "Только ученикам", showToStudents: true, showToParents: false, isPublished: true },
    });
    const parentPost = await request<{ id: string }>("/admin/news", {
      method: "POST",
      token: admin.token,
      status: 201,
      body: { title: `${TEST_PREFIX} parents`, content: "Только родителям", showToStudents: false, showToParents: true, isPublished: true },
    });
    await request(`/admin/news/${parentPost.id}`, {
      method: "PATCH",
      token: admin.token,
      status: 400,
      body: { showToParents: false },
    });
    const [studentNews, parentOneNews, parentTwoNews] = await Promise.all([
      request<Array<{ id: string }>>("/news?limit=50"),
      request<Array<{ id: string }>>("/parents/me/news?limit=20", { token: parentOne.token }),
      request<Array<{ id: string }>>("/parents/me/news?limit=20", { token: parentTwo.token }),
    ]);
    assert(studentNews.some((item) => item.id === studentPost.id), "student news must include the student audience post");
    assert(!studentNews.some((item) => item.id === parentPost.id), "student news must exclude the parent-only post");
    assert(parentOneNews.some((item) => item.id === parentPost.id), "first parent must receive the parent post");
    assert(parentTwoNews.some((item) => item.id === parentPost.id), "second parent must receive the same parent post");
    assert(!parentOneNews.some((item) => item.id === studentPost.id), "parent news must exclude student-only posts");

    await request(`/students/me/parent-visibility-requests`, {
      method: "POST",
      token: parentOne.token,
      status: 403,
      body: { requested },
    });
    console.log("Parent visibility V2 E2E passed.");
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
