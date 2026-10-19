import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Plan 1.12: the shared materials library, course lessons sent to students, and media behind sign-in.
if (!process.env.TEST_DATABASE_URL) {
  test("materials library HTTP + PostgreSQL", { skip: "TEST_DATABASE_URL required" }, () => {});
} else {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && /test|qa/.test(url.pathname));
  const uploadDir = await mkdtemp(path.join(tmpdir(), "maestro-media-"));
  Object.assign(process.env, {
    DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: "test", UPLOAD_DIR: uploadDir,
    CRM_SESSION_CACHE_TTL_MS: "0", CRM_SESSION_STALE_MAX_AGE_MS: "0",
    JWT_SECRET: "materials-library-test-secret", INTEGRATION_SERVICE_SECRET: "materials-integration-test-secret",
    INTEGRATION_SSO_SECRET: "materials-bridge-test-secret", CRM_API_URL: "http://127.0.0.1:9",
  });
  const { default: Fastify } = await import("fastify");
  const { default: fastifyJwt } = await import("@fastify/jwt");
  const { default: bcrypt } = await import("bcryptjs");
  const { prisma } = await import("../../infrastructure/database/prisma.js");
  const { authRoutes } = await import("./auth.routes.js");
  const { mediaRoutes } = await import("./media.routes.js");
  const { materialLibraryRoutes } = await import("./material-library.routes.js");
  const { errorHandler } = await import("../middleware/error-handler.js");
  const { materialBadge, materialKindFor } = await import("../../application/services/material-library.service.js");

  const app = Fastify();
  const suffix = randomUUID().slice(0, 8);
  const users: string[] = [];
  const cleanup: Array<() => Promise<unknown>> = [];

  async function role(slug: string, permissions: string[]) {
    const row = await prisma.role.upsert({ where: { slug }, create: { slug, name: slug }, update: {} });
    for (const code of permissions) {
      const permission = await prisma.permission.upsert({ where: { code }, create: { code }, update: {} });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: row.id, permissionId: permission.id } },
        create: { roleId: row.id, permissionId: permission.id },
        update: {},
      });
    }
    return row;
  }

  async function makeUser(slug: string, permissions: string[], extra: Record<string, unknown> = {}) {
    const roleRow = await role(slug, permissions);
    const user = await prisma.user.create({ data: {
      login: `mat_${slug}_${randomUUID().slice(0, 8)}`, phone: randomUUID().slice(0, 20),
      passwordHash: await bcrypt.hash("library-password", 4), firstName: "Материал", lastName: slug, roleId: roleRow.id, ...extra,
    } });
    users.push(user.id);
    return user;
  }

  async function login(user: { login: string | null }) {
    const response = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { phone: user.login, password: "library-password" } });
    assert.equal(response.statusCode, 200, response.body);
    const cookie = String(response.headers["set-cookie"] ?? "");
    return { token: response.json().data.token as string, cookie };
  }

  test.before(async () => {
    await app.register(fastifyJwt, { secret: process.env.JWT_SECRET!, sign: { expiresIn: "7d" } });
    app.setErrorHandler(errorHandler);
    await app.register(authRoutes, { prefix: "/api/v1" });
    await app.register(mediaRoutes, { prefix: "/api/v1" });
    await app.register(materialLibraryRoutes, { prefix: "/api/v1" });
    await app.ready();
  });

  test.after(async () => {
    await app.close();
    for (const step of cleanup.reverse()) await step().catch(() => undefined);
    await prisma.materialLibraryItem.deleteMany({ where: { createdById: { in: users } } });
    await prisma.userNotification.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  test("a material's kind and badge come from its type, host or extension", () => {
    assert.equal(materialKindFor("https://youtu.be/abc"), "video");
    assert.equal(materialKindFor("https://example.com/score.pdf"), "pdf");
    assert.equal(materialKindFor("/api/v1/media/files/x.mp4", "video/mp4"), "video");
    assert.equal(materialKindFor("https://example.com/chords"), "link");
    assert.equal(materialBadge("/api/v1/media/files/x.mp4", "video", "video/mp4"), "MP4");
    assert.equal(materialBadge("/api/v1/media/images/a.png", "image", "image/png"), "PNG");
    assert.equal(materialBadge("https://www.youtube.com/watch?v=1", "video"), "YouTube");
    assert.equal(materialBadge("https://example.com/chords", "link"), "ссылка");
  });

  test("uploaded files open only for signed-in users; avatars stay public; video seeks by range", async () => {
    const user = await makeUser("parent", []);
    await mkdir(path.join(uploadDir, "pdf"), { recursive: true });
    await mkdir(path.join(uploadDir, "images"), { recursive: true });
    await writeFile(path.join(uploadDir, "pdf", `sheet-${suffix}.pdf`), "%PDF-1.4 maestro");
    await writeFile(path.join(uploadDir, "images", `avatar-${suffix}.png`), "png-bytes");
    await prisma.user.update({ where: { id: user.id }, data: { avatar: `http://old.host/api/v1/media/images/avatar-${suffix}.png` } });

    const anonymous = await app.inject({ method: "GET", url: `/api/v1/media/pdf/sheet-${suffix}.pdf` });
    assert.equal(anonymous.statusCode, 401);
    // A person opening the link in a browser is sent to sign in and comes back to the file.
    const browser = await app.inject({ method: "GET", url: `/api/v1/media/pdf/sheet-${suffix}.pdf`, headers: { "sec-fetch-dest": "document", accept: "text/html" } });
    assert.equal(browser.statusCode, 302);
    assert.equal(browser.headers.location, `/login?next=${encodeURIComponent(`/api/v1/media/pdf/sheet-${suffix}.pdf`)}`);

    const { token, cookie } = await login(user);
    assert.match(cookie, /maestro_media=[^;]+; Path=\/api\/v1\/media; HttpOnly; SameSite=Lax/);
    const byCookie = await app.inject({ method: "GET", url: `/api/v1/media/pdf/sheet-${suffix}.pdf`, headers: { cookie: cookie.split(";")[0] } });
    assert.equal(byCookie.statusCode, 200);
    assert.equal(byCookie.body, "%PDF-1.4 maestro");
    assert.equal(byCookie.headers["x-frame-options"], "SAMEORIGIN");

    const byHeader = await app.inject({
      method: "GET", url: `/api/v1/media/pdf/sheet-${suffix}.pdf`,
      headers: { authorization: `Bearer ${token}`, range: "bytes=0-3" },
    });
    assert.equal(byHeader.statusCode, 206);
    assert.equal(byHeader.body, "%PDF");
    assert.equal(byHeader.headers["content-range"], `bytes 0-3/${"%PDF-1.4 maestro".length}`);

    const avatar = await app.inject({ method: "GET", url: `/api/v1/media/images/avatar-${suffix}.png` });
    assert.equal(avatar.statusCode, 200, "CRM still shows avatars");

    const refreshed = await app.inject({ method: "POST", url: "/api/v1/auth/media-session", headers: { authorization: `Bearer ${token}` } });
    assert.match(String(refreshed.headers["set-cookie"]), /^maestro_media=/);
    const cleared = await app.inject({ method: "DELETE", url: "/api/v1/auth/media-session" });
    assert.match(String(cleared.headers["set-cookie"]), /Max-Age=0/);
  });

  test("teachers build the shared library; captions find it; only the author or an admin changes it", async () => {
    const teacher = await makeUser("teacher", ["offline_school.read", "offline_school.write"]);
    const colleague = await makeUser("teacher", ["offline_school.read", "offline_school.write"]);
    const student = await makeUser("student", []);
    const { token } = await login(teacher);
    const { token: colleagueToken } = await login(colleague);
    const { token: studentToken } = await login(student);
    const auth = (value: string) => ({ authorization: `Bearer ${value}` });

    const added = await app.inject({ method: "POST", url: "/api/v1/materials/library/links", headers: auth(token),
      payload: { url: `https://www.youtube.com/watch?v=${suffix}`, title: `Бой восьмыми ${suffix}` } });
    assert.equal(added.statusCode, 201, added.body);
    assert.equal(added.json().data.kind, "video");
    assert.equal(added.json().data.badge, "YouTube");
    const again = await app.inject({ method: "POST", url: "/api/v1/materials/library/links", headers: auth(colleagueToken),
      payload: { url: `https://www.youtube.com/watch?v=${suffix}`, title: "Другая подпись" } });
    assert.equal(again.statusCode, 200);
    assert.equal(again.json().duplicate, true, "one link, one entry");

    const media = await app.inject({ method: "POST", url: "/api/v1/materials/library/links", headers: auth(token),
      payload: { url: `http://old.host/api/v1/media/pdf/sheet-${suffix}.pdf`, title: `Аккорды ${suffix}` } });
    assert.equal(media.json().data.url, `/api/v1/media/pdf/sheet-${suffix}.pdf`, "uploaded files keep a same-site path");

    const upload = await app.inject({ method: "POST", url: "/api/v1/materials/library/files", headers: auth(token),
      payload: { filename: "Табулатура.pdf", mimeType: "application/pdf", contentBase64: Buffer.from("%PDF tab").toString("base64"), title: `Табулатура ${suffix}` } });
    assert.equal(upload.statusCode, 201, upload.body);
    assert.equal(upload.json().data.kind, "pdf");
    assert.match(upload.json().data.url, /^\/api\/v1\/media\/pdf\/[0-9a-f-]+\.pdf$/);

    const found = await app.inject({ method: "GET", url: `/api/v1/materials/library?search=${encodeURIComponent(`бой восьмыми ${suffix}`)}`, headers: auth(colleagueToken) });
    assert.deepEqual(found.json().data.map((item: { title: string }) => item.title), [`Бой восьмыми ${suffix}`]);
    const forbidden = await app.inject({ method: "GET", url: "/api/v1/materials/library", headers: auth(studentToken) });
    assert.equal(forbidden.statusCode, 403, "students do not browse the staff library");

    const id = added.json().data.id;
    const rename = await app.inject({ method: "PATCH", url: `/api/v1/materials/library/${id}`, headers: auth(colleagueToken), payload: { title: "Чужая правка" } });
    assert.equal(rename.statusCode, 403);
    const own = await app.inject({ method: "DELETE", url: `/api/v1/materials/library/${id}`, headers: auth(token) });
    assert.equal(own.statusCode, 200);
    const after = await app.inject({ method: "GET", url: `/api/v1/materials/library?search=${encodeURIComponent(suffix)}`, headers: auth(token) });
    assert.equal(after.json().data.some((item: { id: string }) => item.id === id), false);
  });

  test("a teacher sends a course lesson; the student opens the bare lesson, nothing else moves", async (t) => {
    const crmStudentId = `crm-share-${suffix}`;
    const crmTeacherId = `crm-share-teacher-${suffix}`;
    const teacher = await makeUser("teacher", ["offline_school.read", "offline_school.write"], { crmTeacherId, externalLinkStatus: "linked" });
    const student = await makeUser("student", [], { crmStudentId, externalLinkStatus: "linked" });
    const other = await makeUser("student", []);
    const direction = await prisma.direction.create({ data: { title: `Гитара ${suffix}`, slug: `share-${suffix}`, isPublished: true } });
    const course = await prisma.course.create({ data: { directionId: direction.id, title: `Курс ${suffix}`, isPublished: true } });
    const module = await prisma.courseModule.create({ data: { courseId: course.id, title: "Модуль 1" } });
    const lesson = await prisma.lesson.create({ data: {
      moduleId: module.id, title: `Постановка руки ${suffix}`, description: "Смотри видео", videoUrl: "https://youtu.be/hand", isPublished: true,
    } });
    await prisma.lessonMaterial.create({ data: { lessonId: lesson.id, type: "pdf", title: "Схема", url: "/api/v1/media/pdf/scheme.pdf" } });
    cleanup.push(() => prisma.direction.delete({ where: { id: direction.id } }));
    cleanup.push(() => prisma.course.delete({ where: { id: course.id } }));
    cleanup.push(() => prisma.lesson.delete({ where: { id: lesson.id } }));

    t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => new Response(JSON.stringify({ success: true, data: String(input).includes("/session-state") ? {
      crmUserId: String(input).includes(crmTeacherId) ? crmTeacherId : crmStudentId,
      appUserId: new URL(String(input)).searchParams.get("appUserId"),
      role: String(input).includes(crmTeacherId) ? "teacher" : "student",
      sessionVersion: 0,
    } : {
      teacher: { crmTeacherId, name: "Учитель", directions: [] },
      students: [{ crmStudentId, name: "Ученик", firstName: "Ученик", lastName: suffix, phone: "+7", accountBalance: 0, directions: [], assignedDirectly: true, groups: [], schedules: [], attendanceHistory: [], memberships: [] }],
      groups: [], classes: [],
    } }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const { token } = await login(teacher);
    const { token: studentToken } = await login(student);
    const { token: otherToken } = await login(other);
    const auth = (value: string) => ({ authorization: `Bearer ${value}` });

    const catalog = await app.inject({ method: "GET", url: "/api/v1/teachers/me/course-lessons", headers: auth(token) });
    assert.ok(catalog.json().data.some((item: { lessons: Array<{ id: string }> }) => item.lessons.some((row) => row.id === lesson.id)));

    const shared = await app.inject({ method: "POST", url: `/api/v1/teachers/me/students/${crmStudentId}/lesson-shares`, headers: auth(token),
      payload: { lessonId: lesson.id, note: "Посмотри до урока" } });
    assert.equal(shared.statusCode, 201, shared.body);
    const shareId = shared.json().data.id;
    const note = await prisma.userNotification.findFirst({ where: { userId: student.id, type: "material_shared" } });
    assert.equal(note?.url, `/shared-lessons/${shareId}`);

    const list = await app.inject({ method: "GET", url: "/api/v1/students/me/shared-lessons", headers: auth(studentToken) });
    assert.equal(list.json().data[0]?.lesson.title, `Постановка руки ${suffix}`);
    const opened = await app.inject({ method: "GET", url: `/api/v1/students/me/shared-lessons/${shareId}`, headers: auth(studentToken) });
    assert.equal(opened.statusCode, 200, opened.body);
    assert.equal(opened.json().data.content.videoUrl, "https://youtu.be/hand");
    assert.equal(opened.json().data.content.materials[0].title, "Схема");
    assert.equal(await prisma.lessonProgress.count({ where: { studentId: student.id } }), 0, "course progress does not move");
    assert.equal(await prisma.studentCourse.count({ where: { studentId: student.id } }), 0, "no enrolment either");

    const stranger = await app.inject({ method: "GET", url: `/api/v1/students/me/shared-lessons/${shareId}`, headers: auth(otherToken) });
    assert.equal(stranger.statusCode, 403);
  });
}
