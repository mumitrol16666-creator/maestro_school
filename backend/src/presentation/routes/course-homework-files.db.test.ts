import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Plan 2.5: a course homework answer carries a file in the private homework storage.
if (!process.env.TEST_DATABASE_URL) {
  test("course homework files HTTP + PostgreSQL", { skip: "TEST_DATABASE_URL required" }, () => {});
} else {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && /test|qa/.test(url.pathname));
  const uploadDir = await mkdtemp(path.join(tmpdir(), "maestro-course-hw-"));
  Object.assign(process.env, {
    DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: "test", UPLOAD_DIR: uploadDir,
    PRIVATE_STORAGE_DRIVER: "local", MALWARE_SCANNER_DRIVER: "none",
    CRM_SESSION_CACHE_TTL_MS: "0", CRM_SESSION_STALE_MAX_AGE_MS: "0",
    JWT_SECRET: "course-homework-test-secret", INTEGRATION_SERVICE_SECRET: "course-homework-integration-secret",
    INTEGRATION_SSO_SECRET: "course-homework-bridge-secret", CRM_API_URL: "http://127.0.0.1:9",
  });
  const { default: Fastify } = await import("fastify");
  const { default: fastifyJwt } = await import("@fastify/jwt");
  const { default: multipart } = await import("@fastify/multipart");
  const { default: bcrypt } = await import("bcryptjs");
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { authRoutes } = await import("./auth.routes.js");
  const { homeworkRoutes } = await import("./homework.routes.js");
  const { errorHandler } = await import("../middleware/error-handler.js");

  const app = Fastify();
  const suffix = randomUUID().slice(0, 8);
  const users: string[] = [];
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
  async function makeUser(slug: string, permissions: string[]) {
    const roleRow = await role(slug, permissions);
    const user = await prisma.user.create({ data: {
      login: `chw_${slug}_${randomUUID().slice(0, 8)}`, phone: randomUUID().slice(0, 20),
      passwordHash: await bcrypt.hash("homework-password", 4), firstName: "ДЗ", lastName: slug, roleId: roleRow.id,
    } });
    users.push(user.id);
    return user;
  }
  async function login(user: { login: string | null }) {
    const response = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { phone: user.login, password: "homework-password" } });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().data.token as string;
  }
  function multipartBody(fields: Record<string, string>, file?: { name: string; type: string; content: Buffer }) {
    const boundary = `----maestro${randomUUID()}`;
    const chunks: Buffer[] = [];
    for (const [name, value] of Object.entries(fields)) {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    }
    if (file) {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`));
      chunks.push(file.content, Buffer.from("\r\n"));
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    return { payload: Buffer.concat(chunks), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
  }
  // A real 1×1 PNG, so the signature check accepts it.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

  test.before(async () => {
    await app.register(fastifyJwt, { secret: process.env.JWT_SECRET!, sign: { expiresIn: "7d" } });
    await app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024, files: 5 } });
    app.setErrorHandler(errorHandler);
    await app.register(authRoutes, { prefix: "/api/v1" });
    await app.register(homeworkRoutes, { prefix: "/api/v1" });
    await app.ready();
  });

  test.after(async () => {
    await app.close();
    await prisma.homeworkSubmission.deleteMany({ where: { studentId: { in: users } } });
    await prisma.lessonProgress.deleteMany({ where: { studentId: { in: users } } });
    await prisma.studentCourse.deleteMany({ where: { studentId: { in: users } } });
    await prisma.userNotification.deleteMany({ where: { userId: { in: users } } });
    if (directionId) await prisma.course.deleteMany({ where: { directionId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    if (directionId) await prisma.direction.delete({ where: { id: directionId } });
  });

  test("a course homework answer carries a private file the author and reviewers can read, nobody else", async () => {
    const direction = await prisma.direction.create({ data: { title: `Курс ${suffix}`, slug: `course-hw-${suffix}`, isPublished: true } });
    directionId = direction.id;
    const course = await prisma.course.create({ data: { directionId: direction.id, title: `Курс ${suffix}`, isPublished: true } });
    const courseModule = await prisma.courseModule.create({ data: { courseId: course.id, title: "Модуль" } });
    const lesson = await prisma.lesson.create({ data: { moduleId: courseModule.id, title: "Урок", isPublished: true } });
    const homework = await prisma.homework.create({ data: { lessonId: lesson.id, description: "Запишите видео" } });
    const student = await makeUser("student", ["homework.submit"]);
    const other = await makeUser("student", ["homework.submit"]);
    const reviewer = await makeUser("curator", ["homework.review"]);
    await prisma.studentCourse.create({ data: { studentId: student.id, courseId: course.id } });
    await prisma.lessonProgress.create({ data: { studentId: student.id, lessonId: lesson.id, status: "in_progress" } });

    const studentToken = await login(student);
    const wrong = multipartBody({ comment: "Не картинка" }, { name: "fake.png", type: "image/png", content: Buffer.from("not a png at all") });
    const rejected = await app.inject({ method: "POST", url: `/api/v1/homeworks/${homework.id}/submissions`, headers: { ...wrong.headers, authorization: `Bearer ${studentToken}` }, payload: wrong.payload });
    assert.equal(rejected.statusCode, 400, "a file whose content is not its format is refused");

    const body = multipartBody({ comment: "Вот запись" }, { name: "ritm.png", type: "image/png", content: png });
    const submitted = await app.inject({ method: "POST", url: `/api/v1/homeworks/${homework.id}/submissions`, headers: { ...body.headers, authorization: `Bearer ${studentToken}` }, payload: body.payload });
    assert.equal(submitted.statusCode, 201, submitted.body);
    const saved = await prisma.homeworkSubmission.findFirstOrThrow({ where: { homeworkId: homework.id, studentId: student.id } });
    assert.match(saved.attachmentUrl ?? "", new RegExp(`^/api/v1/homework-files/${homework.id}/[a-f0-9]{64}\\.png/download$`));
    assert.equal(saved.attachmentType, "file");
    assert.equal(saved.comment, "Вот запись");

    const download = (token: string) => app.inject({ method: "GET", url: saved.attachmentUrl!, headers: { authorization: `Bearer ${token}` } });
    const own = await download(studentToken);
    assert.equal(own.statusCode, 200);
    assert.equal(Buffer.compare(own.rawPayload, png), 0);
    assert.equal((await download(await login(reviewer))).statusCode, 200);
    assert.equal((await download(await login(other))).statusCode, 403);
  });
}
