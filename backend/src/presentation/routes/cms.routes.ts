import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  createCourse, createDirection, createHomework, createLesson, createMaterial, createModule, createNews,
  deleteMaterial, getAdminCourse, getAdminCourseTree, getAdminLesson, listAdminCourses, listAdminDirections, listAdminNews, listHomeworks, listLessons,
  listMaterials, listMaterialUsages, listModules, updateCourse, updateDirection, updateHomework, updateLesson,
  updateMaterial, updateModule, updateNews,
} from "../../application/repositories/cms.repository.js";
import { writeAuditLog } from "../../application/services/audit.service.js";
import { getMediaInfoFromUrl } from "../../application/services/media-storage.service.js";
import { authenticate, requireContentAdmin, requirePermission } from "../guards/auth.guards.js";
import { BadRequestError } from "../../domain/errors.js";

const idParams = z.object({ id: z.string().uuid() });
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
});
const nullableUrl = z.string().url().max(1024).nullable().optional();
const publishBody = z.object({ isPublished: z.boolean() });
const difficulty = z.enum(["beginner", "intermediate", "advanced", "all_levels"]);
const materialType = z.enum(["pdf", "image", "file", "link"]);
const homeworkType = z.enum(["assignment", "test"]);
const testOption = z.object({ id: z.string().min(1).max(100), text: z.string().trim().min(1).max(500) });
const testQuestion = z.object({
  id: z.string().min(1).max(100),
  prompt: z.string().trim().min(1).max(1000),
  options: z.array(testOption).min(2).max(10),
  correctOptionId: z.string().min(1).max(100),
}).superRefine((question, ctx) => {
  if (!question.options.some((option) => option.id === question.correctOptionId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Correct option must belong to question", path: ["correctOptionId"] });
  }
});
const homeworkBody = z.object({
  lessonId: z.string().uuid().optional(),
  description: z.string().min(1).optional(),
  type: homeworkType.optional(),
  passingScore: z.number().int().min(0).max(100).optional(),
  testQuestions: z.array(testQuestion).min(1).max(100).nullable().optional(),
});

const catalogGuards = () => [authenticate, requireContentAdmin, requirePermission("catalog.manage")];
const newsGuards = () => [authenticate, requireContentAdmin, requirePermission("news.manage")];
const meta = (page: number, limit: number, total: number) => ({ page, limit, total, pages: Math.ceil(total / limit) });

async function audit(request: FastifyRequest, entityType: string, entityId: string, action: "create" | "update" | "delete" | "publish" | "unpublish") {
  await writeAuditLog({ entityType, entityId, action, actorId: request.user!.id });
}

function validateVideoUrl(value?: string | null) {
  if (!value) return;
  const host = new URL(value).hostname.toLowerCase();
  const allowed = ["youtube.com", "youtu.be", "vimeo.com", "videodelivery.net", "cloudflarestream.com"];
  if (!allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    throw new BadRequestError("videoUrl must use YouTube, Vimeo, or Cloudflare Stream");
  }
}

export async function cmsRoutes(app: FastifyInstance) {
  app.get("/admin/directions", { preHandler: catalogGuards() }, async (request) => {
    const query = pageQuery.parse(request.query);
    const result = await listAdminDirections(query);
    return { data: result.items, meta: meta(query.page, query.limit, result.total) };
  });
  app.post("/admin/directions", { preHandler: catalogGuards() }, async (request, reply) => {
    const body = z.object({ title: z.string().min(1).max(255), slug: z.string().regex(/^[a-z0-9-]+$/), description: z.string().nullable().optional(), imageUrl: nullableUrl, isPublished: z.boolean().optional() }).parse(request.body);
    const item = await createDirection(body); await audit(request, "direction", item.id, "create");
    return reply.status(201).send({ data: item });
  });
  app.patch("/admin/directions/:id", { preHandler: catalogGuards() }, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = z.object({ title: z.string().min(1).max(255).optional(), slug: z.string().regex(/^[a-z0-9-]+$/).optional(), description: z.string().nullable().optional(), imageUrl: nullableUrl }).parse(request.body);
    const item = await updateDirection(id, body); await audit(request, "direction", id, "update"); return { data: item };
  });
  app.post("/admin/directions/:id/publish", { preHandler: catalogGuards() }, async (request) => {
    const { id } = idParams.parse(request.params); const body = publishBody.parse(request.body);
    const item = await updateDirection(id, { isPublished: body.isPublished, deletedAt: null });
    await audit(request, "direction", id, body.isPublished ? "publish" : "unpublish"); return { data: item };
  });
  app.delete("/admin/directions/:id", { preHandler: catalogGuards() }, async (request) => {
    const { id } = idParams.parse(request.params);
    const item = await updateDirection(id, { isPublished: false, deletedAt: new Date() });
    await audit(request, "direction", id, "delete"); return { data: item };
  });

  app.get("/admin/courses", { preHandler: catalogGuards() }, async (request) => {
    const query = pageQuery.extend({ directionId: z.string().uuid().optional() }).parse(request.query);
    const result = await listAdminCourses(query);
    return { data: result.items, meta: meta(query.page, query.limit, result.total) };
  });
  app.get("/admin/courses/:id", { preHandler: catalogGuards() }, async (request) => {
    const { id } = idParams.parse(request.params); return { data: await getAdminCourse(id) };
  });
  app.get("/admin/courses/:id/tree", { preHandler: catalogGuards() }, async (request) => {
    const { id } = idParams.parse(request.params); return { data: await getAdminCourseTree(id) };
  });
  app.post("/admin/courses", { preHandler: catalogGuards() }, async (request, reply) => {
    const body = z.object({ directionId: z.string().uuid(), title: z.string().min(1).max(255), description: z.string().nullable().optional(), thumbnail: nullableUrl, difficultyLevel: difficulty.default("beginner"), isPublished: z.boolean().optional() }).parse(request.body);
    const item = await createCourse(body); await audit(request, "course", item.id, "create"); return reply.status(201).send({ data: item });
  });
  app.patch("/admin/courses/:id", { preHandler: catalogGuards() }, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = z.object({ directionId: z.string().uuid().optional(), title: z.string().min(1).max(255).optional(), description: z.string().nullable().optional(), thumbnail: nullableUrl, difficultyLevel: difficulty.optional() }).parse(request.body);
    const item = await updateCourse(id, body); await audit(request, "course", id, "update"); return { data: item };
  });
  app.post("/admin/courses/:id/publish", { preHandler: catalogGuards() }, async (request) => {
    const { id } = idParams.parse(request.params); const body = publishBody.parse(request.body);
    const item = await updateCourse(id, { isPublished: body.isPublished, deletedAt: null });
    await audit(request, "course", id, body.isPublished ? "publish" : "unpublish"); return { data: item };
  });
  app.delete("/admin/courses/:id", { preHandler: catalogGuards() }, async (request) => {
    const { id } = idParams.parse(request.params); const item = await updateCourse(id, { isPublished: false, deletedAt: new Date() });
    await audit(request, "course", id, "delete"); return { data: item };
  });

  app.get("/admin/modules", { preHandler: catalogGuards() }, async (request) => {
    const { courseId } = z.object({ courseId: z.string().uuid() }).parse(request.query); return { data: await listModules(courseId) };
  });
  app.post("/admin/modules", { preHandler: catalogGuards() }, async (request, reply) => {
    const body = z.object({ courseId: z.string().uuid(), title: z.string().min(1).max(255), description: z.string().nullable().optional(), sortOrder: z.number().int().min(0).default(0) }).parse(request.body);
    const item = await createModule(body); await audit(request, "course_module", item.id, "create"); return reply.status(201).send({ data: item });
  });
  app.patch("/admin/modules/:id", { preHandler: catalogGuards() }, async (request) => {
    const { id } = idParams.parse(request.params); const body = z.object({ courseId: z.string().uuid().optional(), title: z.string().min(1).max(255).optional(), description: z.string().nullable().optional(), sortOrder: z.number().int().min(0).optional() }).parse(request.body);
    const item = await updateModule(id, body); await audit(request, "course_module", id, "update"); return { data: item };
  });
  app.delete("/admin/modules/:id", { preHandler: catalogGuards() }, async (request) => {
    const { id } = idParams.parse(request.params); const item = await updateModule(id, { deletedAt: new Date() });
    await audit(request, "course_module", id, "delete"); return { data: item };
  });

  app.get("/admin/lessons", { preHandler: catalogGuards() }, async (request) => {
    const { moduleId } = z.object({ moduleId: z.string().uuid() }).parse(request.query); return { data: await listLessons(moduleId) };
  });
  app.get("/admin/lessons/:id", { preHandler: catalogGuards() }, async (request) => {
    const { id } = idParams.parse(request.params); return { data: await getAdminLesson(id) };
  });
  app.post("/admin/lessons", { preHandler: catalogGuards() }, async (request, reply) => {
    const body = z.object({ moduleId: z.string().uuid(), title: z.string().min(1).max(255), description: z.string().nullable().optional(), videoUrl: nullableUrl, pointsReward: z.number().int().min(0).default(0), sortOrder: z.number().int().min(0).default(0), isPublished: z.boolean().optional() }).parse(request.body);
    validateVideoUrl(body.videoUrl); const item = await createLesson(body); await audit(request, "lesson", item.id, "create"); return reply.status(201).send({ data: item });
  });
  app.patch("/admin/lessons/:id", { preHandler: catalogGuards() }, async (request) => {
    const { id } = idParams.parse(request.params); const body = z.object({ moduleId: z.string().uuid().optional(), title: z.string().min(1).max(255).optional(), description: z.string().nullable().optional(), videoUrl: nullableUrl, pointsReward: z.number().int().min(0).optional(), sortOrder: z.number().int().min(0).optional() }).parse(request.body);
    validateVideoUrl(body.videoUrl); const item = await updateLesson(id, body); await audit(request, "lesson", id, "update"); return { data: item };
  });
  app.post("/admin/lessons/:id/publish", { preHandler: catalogGuards() }, async (request) => {
    const { id } = idParams.parse(request.params); const body = publishBody.parse(request.body);
    const item = await updateLesson(id, { isPublished: body.isPublished, deletedAt: null });
    await audit(request, "lesson", id, body.isPublished ? "publish" : "unpublish"); return { data: item };
  });
  app.delete("/admin/lessons/:id", { preHandler: catalogGuards() }, async (request) => {
    const { id } = idParams.parse(request.params); const item = await updateLesson(id, { isPublished: false, deletedAt: new Date() });
    await audit(request, "lesson", id, "delete"); return { data: item };
  });

  app.get("/admin/materials", { preHandler: catalogGuards() }, async (request) => {
    const { lessonId } = z.object({ lessonId: z.string().uuid() }).parse(request.query);
    const items = await listMaterials(lessonId);
    return { data: await Promise.all(items.map(async (item) => ({ ...item, media: await getMediaInfoFromUrl(item.url, request) }))) };
  });
  app.get("/admin/materials/:id/usages", { preHandler: catalogGuards() }, async (request) => {
    const { id } = idParams.parse(request.params); return { data: await listMaterialUsages(id) };
  });
  app.post("/admin/materials", { preHandler: catalogGuards() }, async (request, reply) => {
    const body = z.object({ lessonId: z.string().uuid(), type: materialType, title: z.string().min(1).max(255), url: z.string().url().max(1024), sortOrder: z.number().int().min(0).default(0) }).parse(request.body);
    const item = await createMaterial(body); await audit(request, "lesson_material", item.id, "create"); return reply.status(201).send({ data: item });
  });
  app.patch("/admin/materials/:id", { preHandler: catalogGuards() }, async (request) => {
    const { id } = idParams.parse(request.params); const body = z.object({ lessonId: z.string().uuid().optional(), type: materialType.optional(), title: z.string().min(1).max(255).optional(), url: z.string().url().max(1024).optional(), sortOrder: z.number().int().min(0).optional() }).parse(request.body);
    const item = await updateMaterial(id, body); await audit(request, "lesson_material", id, "update"); return { data: item };
  });
  app.delete("/admin/materials/:id", { preHandler: catalogGuards() }, async (request) => {
    const { id } = idParams.parse(request.params); const item = await deleteMaterial(id); await audit(request, "lesson_material", id, "delete"); return { data: item };
  });

  app.get("/admin/homeworks", { preHandler: catalogGuards() }, async (request) => {
    const { lessonId } = z.object({ lessonId: z.string().uuid() }).parse(request.query); return { data: await listHomeworks(lessonId) };
  });
  app.post("/admin/homeworks", { preHandler: catalogGuards() }, async (request, reply) => {
    const body = homeworkBody.extend({
      lessonId: z.string().uuid(),
      description: z.string().min(1),
      type: homeworkType.default("assignment"),
    }).parse(request.body);
    if (body.type === "test" && !body.testQuestions?.length) throw new BadRequestError("Test homework must contain at least one question");
    const item = await createHomework(body); await audit(request, "homework", item.id, "create"); return reply.status(201).send({ data: item });
  });
  app.patch("/admin/homeworks/:id", { preHandler: catalogGuards() }, async (request) => {
    const { id } = idParams.parse(request.params); const body = homeworkBody.parse(request.body);
    if (body.type === "test" && !body.testQuestions?.length) throw new BadRequestError("Test homework must contain at least one question");
    const item = await updateHomework(id, body); await audit(request, "homework", id, "update"); return { data: item };
  });
  app.delete("/admin/homeworks/:id", { preHandler: catalogGuards() }, async (request) => {
    const { id } = idParams.parse(request.params); const item = await updateHomework(id, { deletedAt: new Date() });
    await audit(request, "homework", id, "delete"); return { data: item };
  });

  app.get("/admin/news", { preHandler: newsGuards() }, async (request) => {
    const query = pageQuery.parse(request.query); const result = await listAdminNews(query);
    return { data: result.items, meta: meta(query.page, query.limit, result.total) };
  });
  app.post("/admin/news", { preHandler: newsGuards() }, async (request, reply) => {
    const body = z.object({ title: z.string().min(1).max(255), content: z.string().min(1), isPublished: z.boolean().optional() }).parse(request.body);
    const item = await createNews({ ...body, authorId: request.user!.id, publishedAt: body.isPublished ? new Date() : null });
    await audit(request, "news_post", item.id, "create"); return reply.status(201).send({ data: item });
  });
  app.patch("/admin/news/:id", { preHandler: newsGuards() }, async (request) => {
    const { id } = idParams.parse(request.params); const body = z.object({ title: z.string().min(1).max(255).optional(), content: z.string().min(1).optional() }).parse(request.body);
    const item = await updateNews(id, body); await audit(request, "news_post", id, "update"); return { data: item };
  });
  app.post("/admin/news/:id/publish", { preHandler: newsGuards() }, async (request) => {
    const { id } = idParams.parse(request.params); const body = publishBody.parse(request.body);
    const item = await updateNews(id, { isPublished: body.isPublished, publishedAt: body.isPublished ? new Date() : null, deletedAt: null });
    await audit(request, "news_post", id, body.isPublished ? "publish" : "unpublish"); return { data: item };
  });
  app.delete("/admin/news/:id", { preHandler: newsGuards() }, async (request) => {
    const { id } = idParams.parse(request.params); const item = await updateNews(id, { isPublished: false, deletedAt: new Date() });
    await audit(request, "news_post", id, "delete"); return { data: item };
  });
}
