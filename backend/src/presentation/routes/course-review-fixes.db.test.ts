import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Stage 4, fixes after the money and logic reviews: league and XP only for the school, the dashboard
// and the lesson page respect the order before the paywall, the review message, the staff preview.
// The new economy is off here (see course-completion-points.db.test.ts for the rewards with it on).
if (!process.env.TEST_DATABASE_URL) {
  test("course review fixes HTTP + PostgreSQL", { skip: "TEST_DATABASE_URL required" }, () => {});
} else {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && /test|qa/.test(url.pathname));
  Object.assign(process.env, {
    DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: "test",
    CRM_SESSION_CACHE_TTL_MS: "0", CRM_SESSION_STALE_MAX_AGE_MS: "0",
    JWT_SECRET: "course-review-test-secret", INTEGRATION_SERVICE_SECRET: "course-review-integration-secret",
    INTEGRATION_SSO_SECRET: "course-review-bridge-secret", CRM_API_URL: "http://127.0.0.1:9",
  });
  const { default: Fastify } = await import("fastify");
  const { default: fastifyJwt } = await import("@fastify/jwt");
  const { default: multipart } = await import("@fastify/multipart");
  const { default: bcrypt } = await import("bcryptjs");
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { authRoutes } = await import("./auth.routes.js");
  const { catalogRoutes } = await import("./catalog.routes.js");
  const { learningRoutes } = await import("./learning.routes.js");
  const { homeworkRoutes } = await import("./homework.routes.js");
  const { cmsRoutes } = await import("./cms.routes.js");
  const { errorHandler } = await import("../middleware/error-handler.js");
  const { getStudentDashboard } = await import("../../application/services/student-dashboard.service.js");
  const { submitHomework } = await import("../../application/services/homework-submit.service.js");
  const { reviewHomeworkSubmission } = await import("../../application/services/homework-review.service.js");
  const weekly = await import("../../application/services/weekly-league.service.js");
  const { isLeagueStudent } = await import("../../application/services/weekly-league-policy.js");

  const STUDENT_PERMISSIONS = ["courses.read", "lessons.read", "progress.read", "progress.write", "homework.submit"];
  const app = Fastify();
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const roleIds: string[] = [];
  let directionId = "";

  async function role(slug: string, permissions: string[], custom = false) {
    const row = await prisma.role.upsert({ where: { slug }, create: { slug, name: slug }, update: {} });
    if (custom) roleIds.push(row.id);
    for (const code of permissions) {
      const permission = await prisma.permission.upsert({ where: { code }, create: { code }, update: {} });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: row.id, permissionId: permission.id } },
        create: { roleId: row.id, permissionId: permission.id }, update: {},
      });
    }
    return row;
  }
  async function makeUser(slug: string, permissions: string[], crmStudentId: string | null = null) {
    const roleRow = await role(slug, permissions);
    const user = await prisma.user.create({ data: {
      login: `crf_${slug}_${randomUUID().slice(0, 8)}`, phone: randomUUID().slice(0, 20),
      passwordHash: await bcrypt.hash("review-password", 4), firstName: "Проверка", lastName: slug, roleId: roleRow.id,
      crmStudentId,
    } });
    userIds.push(user.id);
    return user;
  }
  async function login(user: { login: string | null }) {
    const response = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { phone: user.login, password: "review-password" } });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().data.token as string;
  }
  const call = (token: string | null, method: "GET" | "POST", path: string, payload?: unknown) => app.inject({
    method, url: `/api/v1${path}`, payload: payload as never,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

  /** Four lessons: l1, l2 (free; l2 carries a written assignment), l3 (a test), l4. */
  async function makeCourse(terms: { priceKzt: number | null }) {
    const course = await prisma.course.create({ data: {
      directionId, title: `Курс ${suffix} ${randomUUID().slice(0, 4)}`, isPublished: true, priceKzt: terms.priceKzt,
    } });
    const module = await prisma.courseModule.create({ data: { courseId: course.id, title: "Модуль 1", sortOrder: 1 } });
    const lesson = (title: string, sortOrder: number, extra: object = {}) => prisma.lesson.create({
      data: { moduleId: module.id, title, sortOrder, isPublished: true, videoUrl: `https://video.example/${title}-${suffix}`, ...extra },
    });
    const lessons = [await lesson("Урок 1", 1), await lesson("Урок 2", 2), await lesson("Урок 3", 3), await lesson("Урок 4", 4)];
    const assignment = await prisma.homework.create({ data: { lessonId: lessons[1].id, description: "Напишите ответ", type: "assignment" } });
    return { course, lessons, assignment };
  }
  async function pass(token: string, lessonId: string) {
    assert.equal((await call(token, "POST", `/lessons/${lessonId}/start`)).statusCode, 200);
    assert.equal((await call(token, "POST", `/lessons/${lessonId}/complete`)).statusCode, 200);
  }

  test.before(async () => {
    await app.register(fastifyJwt, { secret: process.env.JWT_SECRET!, sign: { expiresIn: "7d" } });
    await app.register(multipart, { limits: { fileSize: 1024 * 1024, files: 1 } });
    app.setErrorHandler(errorHandler);
    for (const plugin of [authRoutes, catalogRoutes, learningRoutes, homeworkRoutes, cmsRoutes]) {
      await app.register(plugin, { prefix: "/api/v1" });
    }
    await app.ready();
    const direction = await prisma.direction.create({ data: { title: `Проверка ${suffix}`, slug: `course-review-${suffix}`, isPublished: true } });
    directionId = direction.id;
  });

  test.after(async () => {
    await app.close();
    await prisma.userNotification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.leagueXpEvent.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.weeklyLeagueActivityEvent.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.pointsTransaction.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.homeworkSubmission.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.lessonProgress.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.studentCourse.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.courseAccess.deleteMany({ where: { studentId: { in: userIds } } });
    if (directionId) await prisma.course.deleteMany({ where: { directionId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    if (directionId) await prisma.direction.delete({ where: { id: directionId } });
    await prisma.$disconnect();
  });

  // ── 1. League and XP only for students of the school ──────────────────────────

  test("isLeagueStudent: the flag alone is not enough, the CRM link alone is not enough", () => {
    assert.equal(isLeagueStudent({ leagueEligible: true, crmStudentId: "crm-1" }), true);
    assert.equal(isLeagueStudent({ leagueEligible: true, crmStudentId: null }), false);
    assert.equal(isLeagueStudent({ leagueEligible: false, crmStudentId: "crm-1" }), false);
    assert.equal(isLeagueStudent({ leagueEligible: false, crmStudentId: null }), false);
  });

  test("XP from every source and the league screen: a person outside the school gets none even with the flag on", async () => {
    const external = await makeUser("student", STUDENT_PERMISSIONS);
    const school = await makeUser("student", STUDENT_PERMISSIONS, `crm-league-${suffix}`);
    assert.equal(external.leagueEligible, true, "the flag defaults to true: the guard must not rely on it");

    const sources = (studentId: string) => [
      () => weekly.awardPreparedTestXp({ studentId, testId: `t-${suffix}`, attemptNumber: 1, testTitle: "Тест" }),
      () => weekly.awardHomeworkAcceptedXp({
        studentId, directionId, sourceType: "course_homework", sourceKey: `course-homework:${studentId}:${suffix}`,
        description: "ДЗ принято", attemptNumber: 1,
      }),
      () => weekly.awardLeagueXp({
        studentId, amount: 5, sourceType: "prepared_test", sourceKey: `direct:${studentId}:${suffix}`, description: "Прямое начисление",
      }),
    ];
    for (const award of sources(external.id)) {
      const result = await award();
      assert.equal(result.awarded, false);
      assert.equal(result.status, "not_eligible");
    }
    for (const award of sources(school.id)) {
      const result = await award();
      assert.equal(result.awarded, true, "the school student is paid as before");
    }
    assert.equal(await prisma.leagueXpEvent.count({ where: { studentId: external.id } }), 0);
    assert.equal(await prisma.leagueXpEvent.count({ where: { studentId: school.id } }), 3);

    // Even an event that got into the table (an old row, a hand edit) does not make the ranking.
    await prisma.leagueXpEvent.create({ data: {
      studentId: external.id, amount: 40, sourceType: "prepared_test", sourceKey: `stray:${external.id}`, description: "Лишняя строка",
    } });
    const forExternal = await weekly.getWeeklyLeagueOverview(external.id);
    assert.equal(forExternal.currentStudent?.eligible, false);
    assert.deepEqual([forExternal.currentStudent?.xp, forExternal.currentStudent?.position], [0, null], "the stray row is not counted");
    assert.ok(!forExternal.standings.some((entry: { studentId?: string }) => entry.studentId === external.id));
    const forSchool = await weekly.getWeeklyLeagueOverview(school.id);
    assert.equal(forSchool.currentStudent?.eligible, true);
    assert.ok((forSchool.currentStudent?.xp ?? 0) > 0);

    const admin = await weekly.getAdminWeeklyLeagueOverview();
    const rows = new Map(admin.students.map((student: { id: string; effectiveEligible: boolean; crmStudentId: string | null }) => [student.id, student]));
    assert.equal(rows.get(external.id)?.effectiveEligible, false);
    assert.equal(rows.get(school.id)?.effectiveEligible, true);
  });

  // ── 2. The home page does not lead to a lesson behind the paywall ─────────────

  test("the dashboard marks the next lesson of a paid course as payment-required, and not after access is given", async () => {
    const { course, lessons } = await makeCourse({ priceKzt: 15000 });
    const free = await makeCourse({ priceKzt: null });
    const student = await makeUser("student", STUDENT_PERMISSIONS);
    const token = await login(student);
    assert.equal((await call(token, "POST", `/courses/${course.id}/enroll`)).statusCode, 200);

    const first = await getStudentDashboard(student.id);
    assert.deepEqual(
      [first.nextAvailableLesson?.id, first.nextAvailableLesson?.courseId, first.nextAvailableLesson?.paymentRequired],
      [lessons[0].id, course.id, false],
      "lesson 1 is free",
    );
    await pass(token, lessons[0].id);
    // Lesson 2 has an assignment: finish it through the review.
    assert.equal((await call(token, "POST", `/lessons/${lessons[1].id}/start`)).statusCode, 200);
    const reviewer = await makeUser("admin", ["homework.review"]);
    const submitted = await submitHomework({ homeworkId: (await prisma.homework.findFirstOrThrow({ where: { lessonId: lessons[1].id } })).id, studentId: student.id, comment: "Ответ" });
    await reviewHomeworkSubmission({ submissionId: submitted.submission.id, reviewerId: reviewer.id, action: "approve" });

    const stuck = await getStudentDashboard(student.id);
    assert.deepEqual(
      [stuck.nextAvailableLesson?.id, stuck.nextAvailableLesson?.paymentRequired, stuck.nextAvailableLesson?.courseId],
      [lessons[2].id, true, course.id],
      "the next lesson is behind the paywall: the home page says «Оплатить курс»",
    );
    await prisma.courseAccess.create({ data: {
      studentId: student.id, courseId: course.id, source: "admin_grant",
      startsAt: new Date(Date.now() - 86_400_000), expiresAt: new Date(Date.now() + 86_400_000 * 30),
    } });
    assert.equal((await getStudentDashboard(student.id)).nextAvailableLesson?.paymentRequired, false);

    // A free course never asks for payment.
    const other = await makeUser("student", STUDENT_PERMISSIONS);
    assert.equal((await call(await login(other), "POST", `/courses/${free.course.id}/enroll`)).statusCode, 200);
    assert.equal((await getStudentDashboard(other.id)).nextAvailableLesson?.paymentRequired, false);
  });

  // ── 4. The order comes before the paywall ─────────────────────────────────────

  test("a paid lesson closed by order answers «урок пока закрыт»; only a lesson open by order meets the paywall", async () => {
    const { course, lessons } = await makeCourse({ priceKzt: 15000 });
    const student = await makeUser("student", STUDENT_PERMISSIONS);
    const token = await login(student);
    assert.equal((await call(token, "POST", `/courses/${course.id}/enroll`)).statusCode, 200);

    // Lesson 3 is paid and not reached yet (lessons 1 and 2 are not done).
    const early = await call(token, "GET", `/lessons/${lessons[2].id}`);
    assert.equal(early.statusCode, 403, early.body);
    assert.match(early.json().error.message, /Урок пока закрыт/);
    assert.ok(!early.body.includes("payment_required"), "no paywall for a lesson that is closed by order");

    await pass(token, lessons[0].id);
    const reviewer = await makeUser("admin", ["homework.review"]);
    assert.equal((await call(token, "POST", `/lessons/${lessons[1].id}/start`)).statusCode, 200);
    const submitted = await submitHomework({ homeworkId: (await prisma.homework.findFirstOrThrow({ where: { lessonId: lessons[1].id } })).id, studentId: student.id, comment: "Ответ" });
    await reviewHomeworkSubmission({ submissionId: submitted.submission.id, reviewerId: reviewer.id, action: "approve" });

    const reached = await call(token, "GET", `/lessons/${lessons[2].id}`);
    assert.equal(reached.statusCode, 200, reached.body);
    assert.equal(reached.json().data.access.kind, "locked", "reached by order and paid: the paywall");
    assert.equal(reached.json().data.videoUrl, null);
    // Lesson 4 is behind lesson 3 by order: still «пока закрыт», not the paywall.
    const beyond = await call(token, "GET", `/lessons/${lessons[3].id}`);
    assert.equal(beyond.statusCode, 403, beyond.body);
    assert.match(beyond.json().error.message, /Урок пока закрыт/);
  });

  // ── 5. The review message tells the truth about the next lesson ───────────────

  test("the message about an accepted assignment does not say «можно продолжать» before the paywall", async () => {
    const reviewer = await makeUser("admin", ["homework.review"]);
    const bodyOf = async (userId: string) => (await prisma.userNotification.findMany({ where: { userId, type: "homework_reviewed" } }))
      .map((row) => row.body).join("|");
    const finishAssignment = async (courseId: string, lessons: Array<{ id: string }>, studentId: string, token: string) => {
      assert.equal((await call(token, "POST", `/courses/${courseId}/enroll`)).statusCode, 200);
      await pass(token, lessons[0].id);
      assert.equal((await call(token, "POST", `/lessons/${lessons[1].id}/start`)).statusCode, 200);
      const homework = await prisma.homework.findFirstOrThrow({ where: { lessonId: lessons[1].id } });
      const submitted = await submitHomework({ homeworkId: homework.id, studentId, comment: "Ответ" });
      await reviewHomeworkSubmission({ submissionId: submitted.submission.id, reviewerId: reviewer.id, action: "approve" });
      await new Promise((resolve) => setTimeout(resolve, 100));
    };

    const paid = await makeCourse({ priceKzt: 15000 });
    const stopped = await makeUser("student", STUDENT_PERMISSIONS);
    await finishAssignment(paid.course.id, paid.lessons, stopped.id, await login(stopped));
    const stoppedBody = await bodyOf(stopped.id);
    assert.match(stoppedBody, /Следующие уроки курса открываются после оплаты/);
    assert.doesNotMatch(stoppedBody, /можно продолжать/);

    const holder = await makeUser("student", STUDENT_PERMISSIONS);
    await prisma.courseAccess.create({ data: {
      studentId: holder.id, courseId: paid.course.id, source: "admin_grant",
      startsAt: new Date(Date.now() - 86_400_000), expiresAt: new Date(Date.now() + 86_400_000 * 30),
    } });
    await finishAssignment(paid.course.id, paid.lessons, holder.id, await login(holder));
    assert.match(await bodyOf(holder.id), /можно продолжать/, "with access the next lesson opens");

    const free = await makeCourse({ priceKzt: null });
    const freeStudent = await makeUser("student", STUDENT_PERMISSIONS);
    await finishAssignment(free.course.id, free.lessons, freeStudent.id, await login(freeStudent));
    assert.match(await bodyOf(freeStudent.id), /можно продолжать/);
  });

  // ── 13. «Посмотреть как ученик» ───────────────────────────────────────────────

  test("staff preview: the student's answer with content, even for a draft, nothing is written; others are refused", async () => {
    const { course, lessons } = await makeCourse({ priceKzt: 15000 });
    const draft = await prisma.lesson.create({
      data: { moduleId: lessons[0].moduleId, title: "Черновик", sortOrder: 9, isPublished: false, videoUrl: `https://video.example/draft-${suffix}` },
    });
    await prisma.homework.create({ data: {
      lessonId: lessons[2].id, description: "Тест", type: "test", passingScore: 50,
      testQuestions: [{ id: "q1", prompt: "Вопрос", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctOptionId: "a" }],
    } });
    const admin = await makeUser("admin", ["catalog.manage"]);
    const adminToken = await login(admin);

    const view = await call(adminToken, "GET", `/admin/lessons/${lessons[2].id}/student-view`);
    assert.equal(view.statusCode, 200, view.body);
    const data = view.json().data;
    assert.deepEqual([data.access.kind, data.access.source, data.courseId], ["open", "preview", course.id]);
    assert.equal(data.videoUrl, `https://video.example/Урок 3-${suffix}`);
    assert.equal(data.homework.type, "test");
    assert.ok(!view.body.includes("correctOptionId"), "the answers stay hidden, as for the student");

    const draftView = await call(adminToken, "GET", `/admin/lessons/${draft.id}/student-view`);
    assert.equal(draftView.statusCode, 200, draftView.body);
    assert.equal(draftView.json().data.title, "Черновик");
    assert.equal((await call(adminToken, "GET", `/admin/lessons/${randomUUID()}/student-view`)).statusCode, 404);

    assert.equal(await prisma.lessonProgress.count({ where: { studentId: admin.id } }), 0, "no progress is written");
    assert.equal(await prisma.studentCourse.count({ where: { studentId: admin.id } }), 0, "no enrollment is written");

    const student = await makeUser("student", STUDENT_PERMISSIONS);
    const teacher = await makeUser("teacher", ["lessons.read"]);
    for (const user of [student, teacher]) {
      const refused = await call(await login(user), "GET", `/admin/lessons/${lessons[2].id}/student-view`);
      assert.equal(refused.statusCode, 403);
    }
    assert.equal((await call(null, "GET", `/admin/lessons/${lessons[2].id}/student-view`)).statusCode, 401);
  });
}
