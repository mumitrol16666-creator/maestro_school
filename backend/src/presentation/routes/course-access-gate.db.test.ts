import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Stage 4: a paid course closes its lessons for a person without access, on every path that gives
// lesson content or moves lesson progress.
if (!process.env.TEST_DATABASE_URL) {
  test("course access gate HTTP + PostgreSQL", { skip: "TEST_DATABASE_URL required" }, () => {});
} else {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && /test|qa/.test(url.pathname));
  Object.assign(process.env, {
    DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: "test",
    CRM_SESSION_CACHE_TTL_MS: "0", CRM_SESSION_STALE_MAX_AGE_MS: "0",
    JWT_SECRET: "course-access-test-secret", INTEGRATION_SERVICE_SECRET: "course-access-integration-secret",
    INTEGRATION_SSO_SECRET: "course-access-bridge-secret", CRM_API_URL: "http://127.0.0.1:9",
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
  const { lessonQuestionsRoutes } = await import("./lesson-questions.routes.js");
  const { errorHandler } = await import("../middleware/error-handler.js");
  const { getLessonAccess } = await import("../../application/services/course-access.service.js");
  const { loadCourseTasks } = await import("../../application/services/task-sources/course-task.adapter.js");

  const STUDENT_PERMISSIONS = ["courses.read", "lessons.read", "progress.read", "progress.write", "homework.submit"];
  const app = Fastify();
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let directionId = "";

  async function role(slug: string, permissions: string[]) {
    const row = await prisma.role.upsert({ where: { slug }, create: { slug, name: slug }, update: {} });
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
      login: `cag_${slug}_${randomUUID().slice(0, 8)}`, phone: randomUUID().slice(0, 20),
      passwordHash: await bcrypt.hash("access-password", 4), firstName: "Доступ", lastName: slug, roleId: roleRow.id,
      crmStudentId,
    } });
    userIds.push(user.id);
    return user;
  }
  async function login(user: { login: string | null }) {
    const response = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { phone: user.login, password: "access-password" } });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().data.token as string;
  }
  const call = (token: string | null, method: "GET" | "POST", path: string, payload?: unknown) => app.inject({
    method, url: `/api/v1${path}`, payload: payload as never,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

  /**
   * Four lessons over two modules: l1, l2 (no test) in module 1; l3 (with a test, a video and a material),
   * l4 in module 2. Lessons 1 and 2 are the free ones.
   */
  async function makeCourse(terms: { priceKzt: number | null; includedInSchool?: boolean }) {
    const course = await prisma.course.create({ data: {
      directionId, title: `Курс ${suffix} ${randomUUID().slice(0, 4)}`, isPublished: true,
      priceKzt: terms.priceKzt, includedInSchool: terms.includedInSchool ?? false,
    } });
    const module1 = await prisma.courseModule.create({ data: { courseId: course.id, title: "Модуль 1", sortOrder: 1 } });
    const module2 = await prisma.courseModule.create({ data: { courseId: course.id, title: "Модуль 2", sortOrder: 2 } });
    const lesson = (moduleId: string, title: string, sortOrder: number, extra: object = {}) => prisma.lesson.create({
      data: { moduleId, title, sortOrder, isPublished: true, enableAskTeacher: true, ...extra },
    });
    const l1 = await lesson(module1.id, "Урок 1", 1);
    const l2 = await lesson(module1.id, "Урок 2", 2);
    const l3 = await lesson(module2.id, "Урок 3", 1, { videoUrl: "https://video.example/secret-lesson-3", description: "О чём урок 3" });
    const l4 = await lesson(module2.id, "Урок 4", 2);
    await prisma.lessonMaterial.create({ data: { lessonId: l3.id, type: "link", title: "Конспект", url: "https://files.example/konspekt", sortOrder: 1 } });
    const homework = await prisma.homework.create({ data: {
      lessonId: l3.id, description: "Тест к уроку 3", type: "test", passingScore: 50,
      testQuestions: [{ id: "q1", prompt: "Вопрос", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctOptionId: "a" }],
    } });
    return { course, lessons: [l1, l2, l3, l4], homework };
  }
  async function pass(token: string, lessonId: string) {
    assert.equal((await call(token, "POST", `/lessons/${lessonId}/start`)).statusCode, 200);
    assert.equal((await call(token, "POST", `/lessons/${lessonId}/complete`)).statusCode, 200);
  }
  /** The student starts the course and finishes the free lessons, so lesson 3 is «available». */
  async function reachLesson3(token: string, built: Awaited<ReturnType<typeof makeCourse>>) {
    assert.equal((await call(token, "POST", `/courses/${built.course.id}/enroll`)).statusCode, 200);
    await pass(token, built.lessons[0].id);
    await pass(token, built.lessons[1].id);
  }
  const grantAccess = (studentId: string, courseId: string, overrides: Record<string, unknown> = {}) => prisma.courseAccess.create({ data: {
    studentId, courseId, source: "admin_grant",
    startsAt: new Date(Date.now() - 86_400_000), expiresAt: new Date(Date.now() + 180 * 86_400_000), ...overrides,
  } });

  test.before(async () => {
    await app.register(fastifyJwt, { secret: process.env.JWT_SECRET!, sign: { expiresIn: "7d" } });
    await app.register(multipart, { limits: { fileSize: 1024 * 1024, files: 1 } });
    app.setErrorHandler(errorHandler);
    for (const plugin of [authRoutes, catalogRoutes, learningRoutes, homeworkRoutes, lessonQuestionsRoutes]) {
      await app.register(plugin, { prefix: "/api/v1" });
    }
    await app.ready();
    const direction = await prisma.direction.create({ data: { title: `Доступ ${suffix}`, slug: `course-access-${suffix}`, isPublished: true } });
    directionId = direction.id;
  });

  test.after(async () => {
    await app.close();
    await prisma.lessonQuestion.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.homeworkSubmission.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.lessonProgress.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.studentCourse.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.userNotification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.pointsTransaction.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.courseAccess.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.coursePaymentRequest.deleteMany({ where: { studentId: { in: userIds } } });
    if (directionId) await prisma.course.deleteMany({ where: { directionId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (directionId) await prisma.direction.delete({ where: { id: directionId } });
    await prisma.$disconnect();
  });

  test("an external student opens lessons 1 and 2 of a paid course and meets the paywall at lesson 3, on every path", async () => {
    const built = await makeCourse({ priceKzt: 15000 });
    const [l1, l2, l3] = built.lessons;
    const student = await makeUser("student", STUDENT_PERMISSIONS);
    const token = await login(student);
    await reachLesson3(token, built);

    const free = await call(token, "GET", `/lessons/${l2.id}`);
    assert.equal(free.statusCode, 200);
    assert.deepEqual({ kind: free.json().data.access.kind, source: free.json().data.access.source }, { kind: "open", source: "free_lesson" });
    assert.equal((await call(token, "GET", `/lessons/${l1.id}`)).json().data.access.kind, "open");

    // The lesson itself: paywall data and no content at all.
    const locked = await call(token, "GET", `/lessons/${l3.id}`);
    assert.equal(locked.statusCode, 200);
    const body = locked.json().data;
    assert.equal(body.access.kind, "locked");
    assert.equal(body.access.priceKzt, 15000);
    assert.equal(body.access.courseId, built.course.id);
    assert.equal(body.courseId, built.course.id);
    assert.equal(body.videoUrl, null);
    assert.deepEqual(body.materials, []);
    assert.equal(body.homework, null);
    assert.ok(!locked.body.includes("secret-lesson-3") && !locked.body.includes("konspekt") && !locked.body.includes("correctOptionId"), "no content in the response");

    // Start, finish and the test after the lesson, and a question to the teacher: 403 COURSE_PAYMENT_REQUIRED.
    const refusals = [
      await call(token, "POST", `/lessons/${l3.id}/start`),
      await call(token, "POST", `/lessons/${l3.id}/complete`),
      await call(token, "POST", `/homeworks/${built.homework.id}/submissions`, { testAnswers: { q1: "a" } }),
      await call(token, "POST", `/lessons/${l3.id}/questions`, { message: "Помогите" }),
      await call(token, "POST", `/lessons/${l3.id}/signup`),
    ];
    for (const [index, response] of refusals.entries()) {
      assert.equal(response.statusCode, 403, `path ${index}: ${response.body}`);
      assert.equal(response.json().error.code, "COURSE_PAYMENT_REQUIRED");
      assert.equal(response.json().error.details.courseId, built.course.id);
    }
    const progress = await prisma.lessonProgress.findUnique({ where: { studentId_lessonId: { studentId: student.id, lessonId: l3.id } } });
    assert.notEqual(progress?.status, "in_progress", "the refused start did not move progress");
    assert.equal(await prisma.homeworkSubmission.count({ where: { studentId: student.id } }), 0);
    assert.equal(await prisma.lessonQuestion.count({ where: { studentId: student.id } }), 0);
  });

  test("a current access opens lesson 3 whatever its source; an expired or revoked one closes it again", async () => {
    const built = await makeCourse({ priceKzt: 15000 });
    const [, , l3, l4] = built.lessons;
    const student = await makeUser("student", STUDENT_PERMISSIONS);
    const token = await login(student);
    await reachLesson3(token, built);
    assert.equal((await call(token, "GET", `/lessons/${l3.id}`)).json().data.access.kind, "locked");

    const access = await prisma.courseAccess.create({ data: {
      studentId: student.id, courseId: built.course.id, source: "payment",
      startsAt: new Date(Date.now() - 86_400_000), expiresAt: new Date(Date.now() + 180 * 86_400_000),
      paymentRequestId: (await prisma.coursePaymentRequest.create({ data: {
        courseId: built.course.id, studentId: student.id, payerUserId: student.id, amountKzt: 15000, status: "confirmed",
      } })).id,
    } });
    assert.equal((await call(token, "POST", `/lessons/${l3.id}/start`)).statusCode, 200);
    const opened = await call(token, "GET", `/lessons/${l3.id}`);
    assert.equal(opened.json().data.access.kind, "open");
    assert.equal(opened.json().data.access.source, "paid");
    assert.equal(opened.json().data.videoUrl, "https://video.example/secret-lesson-3");
    assert.equal(opened.json().data.materials.length, 1);
    assert.equal(opened.json().data.homework.testQuestions.length, 1, "the test opens with the lesson");

    // The access ends: the lesson started earlier closes with it, the test cannot be sent.
    await prisma.courseAccess.update({ where: { id: access.id }, data: { startsAt: new Date(Date.now() - 200 * 86_400_000), expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await call(token, "GET", `/lessons/${l3.id}`)).json().data.access.kind, "locked");
    assert.equal((await call(token, "POST", `/homeworks/${built.homework.id}/submissions`, { testAnswers: { q1: "a" } })).statusCode, 403);
    assert.equal((await call(token, "POST", `/lessons/${l3.id}/complete`)).statusCode, 403);

    // A refund revokes a running access.
    await prisma.courseAccess.update({ where: { id: access.id }, data: { startsAt: new Date(Date.now() - 86_400_000), expiresAt: new Date(Date.now() + 86_400_000), revokedAt: new Date(), revokeReason: "refund" } });
    assert.equal((await call(token, "GET", `/lessons/${l3.id}`)).json().data.access.kind, "locked");

    // The administrator's grant opens it, and the test is passed through the gate.
    await prisma.courseAccess.update({ where: { id: access.id }, data: { revokedAt: null, revokeReason: null, expiresAt: new Date(Date.now() + 86_400_000) } });
    await prisma.courseAccess.create({ data: {
      studentId: student.id, courseId: built.course.id, source: "admin_grant",
      startsAt: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() + 3 * 86_400_000),
    } });
    const submitted = await call(token, "POST", `/homeworks/${built.homework.id}/submissions`, { testAnswers: { q1: "a" } });
    assert.equal(submitted.statusCode, 201, submitted.body);
    assert.equal(submitted.json().data.lessonProgress, "completed");
    assert.equal((await call(token, "GET", `/lessons/${l4.id}`)).json().data.access.kind, "open");
  });

  test("a course with no price is open whole to everyone, a paid one is not", async () => {
    const free = await makeCourse({ priceKzt: null });
    const external = await makeUser("student", STUDENT_PERMISSIONS);
    const token = await login(external);
    await reachLesson3(token, free);
    assert.equal((await call(token, "POST", `/lessons/${free.lessons[2].id}/start`)).statusCode, 200);
    const opened = await call(token, "GET", `/lessons/${free.lessons[2].id}`);
    assert.equal(opened.json().data.access.kind, "open");
    assert.equal(opened.json().data.access.source, "free_course");
    assert.equal(opened.json().data.videoUrl, "https://video.example/secret-lesson-3");

    const paid = await makeCourse({ priceKzt: 9000 });
    await reachLesson3(token, paid);
    assert.equal((await call(token, "GET", `/lessons/${paid.lessons[2].id}`)).json().data.access.kind, "locked");
  });

  test("school students: a course marked as included is whole free for them; an unmarked paid course is not; an external student pays for both", async () => {
    const included = await makeCourse({ priceKzt: 15000, includedInSchool: true });
    const unmarked = await makeCourse({ priceKzt: 15000 });
    const schoolStudent = await makeUser("student", STUDENT_PERMISSIONS, `crm-${suffix}`);
    const externalStudent = await makeUser("student", STUDENT_PERMISSIONS);
    const schoolToken = await login(schoolStudent);
    const externalToken = await login(externalStudent);

    await reachLesson3(schoolToken, included);
    const school = await call(schoolToken, "GET", `/lessons/${included.lessons[2].id}`);
    assert.equal(school.json().data.access.kind, "open");
    assert.equal(school.json().data.access.source, "school");
    assert.equal((await call(schoolToken, "POST", `/lessons/${included.lessons[2].id}/start`)).statusCode, 200);

    await reachLesson3(schoolToken, unmarked);
    assert.equal((await call(schoolToken, "GET", `/lessons/${unmarked.lessons[2].id}`)).json().data.access.kind, "locked");
    assert.equal((await call(schoolToken, "POST", `/lessons/${unmarked.lessons[2].id}/start`)).statusCode, 403);

    await reachLesson3(externalToken, included);
    assert.equal((await call(externalToken, "GET", `/lessons/${included.lessons[2].id}`)).json().data.access.kind, "locked");
    assert.equal((await call(externalToken, "POST", `/lessons/${included.lessons[2].id}/start`)).statusCode, 403);

    // The school access is computed, not stored: unlink the student and it is gone.
    await prisma.user.update({ where: { id: schoolStudent.id }, data: { crmStudentId: null } });
    assert.equal((await getLessonAccess(schoolStudent.id, included.lessons[2].id)).open, false);
    await prisma.user.update({ where: { id: schoolStudent.id }, data: { crmStudentId: `crm-back-${suffix}` } });
    assert.equal((await getLessonAccess(schoolStudent.id, included.lessons[2].id)).open, true, "and it comes back with the link");
    assert.equal(await prisma.courseAccess.count({ where: { studentId: schoolStudent.id } }), 0);
  });

  test("teachers and catalog managers see a paid course unlocked in the catalog; the student gate is closed to them, preview has its own route", async () => {
    const built = await makeCourse({ priceKzt: 15000 });
    const teacher = await makeUser("teacher", ["lessons.read"]);
    const manager = await makeUser("curator", ["catalog.manage"]);
    const student = await makeUser("student", STUDENT_PERMISSIONS);
    const l3 = built.lessons[2].id;
    for (const user of [teacher, manager]) {
      // The catalog (course page, lock marks) is read by staff for review...
      const detail = (await call(await login(user), "GET", `/courses/${built.course.id}`)).json().data;
      assert.equal(detail.access.preview, true);
      assert.deepEqual(
        detail.modules.flatMap((module: { lessons: Array<{ locked: boolean }> }) => module.lessons.map((lesson) => lesson.locked)),
        [false, false, false, false],
      );
      // ...but the gate of student actions does not know «preview» any more: staff look at a lesson through
      // GET /admin/lessons/:id/student-view (see course-review-fixes.db.test.ts).
      const access = await getLessonAccess(user.id, l3);
      assert.equal(access.open, false);
      assert.equal(access.state.preview, false);
    }
    assert.equal((await getLessonAccess(student.id, l3)).open, false);
  });

  test("the catalog tells each person the price, the flag and their access; /auth/me tells the audience", async () => {
    const built = await makeCourse({ priceKzt: 15000, includedInSchool: true });
    const free = await makeCourse({ priceKzt: null });
    const external = await makeUser("student", STUDENT_PERMISSIONS);
    const school = await makeUser("student", STUDENT_PERMISSIONS, `crm-cat-${suffix}`);
    const teacher = await makeUser("teacher", ["lessons.read"]);
    const parent = await makeUser("parent", ["family.read"]);
    await grantAccess(external.id, built.course.id);
    const externalToken = await login(external);
    const schoolToken = await login(school);

    const list = async (token: string | null) => {
      const response = await call(token, "GET", `/courses?directionId=${directionId}`);
      assert.equal(response.statusCode, 200, response.body);
      return new Map<string, { priceKzt: number | null; includedInSchool: boolean; freeLessonsCount: number; access: { kind: string; forSale: boolean; fullAccess: boolean; preview: boolean } }>(
        response.json().data.map((item: { id: string }) => [item.id, item]),
      );
    };
    const guest = (await list(null)).get(built.course.id)!;
    assert.deepEqual([guest.priceKzt, guest.includedInSchool, guest.freeLessonsCount, guest.access.kind, guest.access.forSale, guest.access.fullAccess], [15000, true, 2, "none", true, false]);
    assert.equal((await list(null)).get(free.course.id)!.access.fullAccess, true, "a course with no price is open to a guest too");
    assert.equal((await list(externalToken)).get(built.course.id)!.access.kind, "granted");
    assert.equal((await list(schoolToken)).get(built.course.id)!.access.kind, "school");
    assert.equal((await list(await login(teacher))).get(built.course.id)!.access.preview, true);

    const detail = await call(externalToken, "GET", `/courses/${built.course.id}`);
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().data.priceKzt, 15000);
    assert.equal(detail.json().data.access.kind, "granted");
    const guestDetail = (await call(null, "GET", `/courses/${built.course.id}`)).json().data;
    assert.deepEqual(
      guestDetail.modules.flatMap((module: { lessons: Array<{ locked: boolean }> }) => module.lessons.map((lesson) => lesson.locked)),
      [false, false, true, true],
    );

    const audience = async (user: { login: string | null }) => (await call(await login(user), "GET", "/auth/me")).json().data.audience;
    assert.equal(await audience(external), "external");
    assert.equal(await audience(school), "school");
    assert.equal(await audience(teacher), "school");
    assert.equal(await audience(parent), "school");
  });

  test("a started task of a lesson the student can no longer open leaves the to-do list; a finished one stays", async () => {
    const built = await makeCourse({ priceKzt: 15000 });
    const student = await makeUser("student", STUDENT_PERMISSIONS);
    const token = await login(student);
    await reachLesson3(token, built);
    const access = await grantAccess(student.id, built.course.id);
    assert.equal((await call(token, "POST", `/lessons/${built.lessons[2].id}/start`)).statusCode, 200);
    assert.equal((await loadCourseTasks(student.id)).length, 1, "with access the test is a task");
    await prisma.courseAccess.update({ where: { id: access.id }, data: { revokedAt: new Date(), revokeReason: "admin" } });
    assert.equal((await loadCourseTasks(student.id)).length, 0, "without it the task would only lead to the paywall");

    await prisma.courseAccess.update({ where: { id: access.id }, data: { revokedAt: null, revokeReason: null } });
    assert.equal((await call(token, "POST", `/homeworks/${built.homework.id}/submissions`, { testAnswers: { q1: "a" } })).statusCode, 201);
    await prisma.courseAccess.update({ where: { id: access.id }, data: { revokedAt: new Date(), revokeReason: "admin" } });
    const history = await loadCourseTasks(student.id);
    assert.equal(history.length, 1);
    assert.equal(history[0].status, "completed", "the finished one stays in the history");
  });
}
