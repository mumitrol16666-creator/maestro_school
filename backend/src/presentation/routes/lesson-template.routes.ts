import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireContentAdmin, requirePermission, requireTeacher } from "../guards/auth.guards.js";
import {
  addOwnLessonTemplate,
  addSchoolLessonTemplate,
  archiveOwnLessonTemplate,
  archiveSchoolLessonTemplate,
  listLessonTemplatesForTeacher,
  listSchoolLessonTemplates,
  updateSchoolLessonTemplate,
} from "../../application/services/lesson-text-template.service.js";

/** Plan 1.14: summary and homework phrases — a teacher's own and the school's per direction. */
export async function lessonTemplateRoutes(app: FastifyInstance) {
  const teacher = [authenticate, requireTeacher, requirePermission("offline_school.read")];
  const admin = [authenticate, requireContentAdmin];
  const kind = z.enum(["summary", "homework"]);
  const id = z.object({ id: z.string().uuid() });

  app.get("/teachers/me/lesson-templates", { preHandler: teacher }, async (request) => {
    const query = z.object({ crmDirectionId: z.string().max(64).optional() }).parse(request.query ?? {});
    return { data: await listLessonTemplatesForTeacher(request.user!.id, query) };
  });

  app.post("/teachers/me/lesson-templates", { preHandler: teacher }, async (request, reply) => {
    const body = z.object({ kind, text: z.string().min(1).max(1000) }).parse(request.body);
    const result = await addOwnLessonTemplate(request.user!.id, body);
    return reply.status(result.duplicate ? 200 : 201).send({ data: result.item, duplicate: result.duplicate });
  });

  app.delete("/teachers/me/lesson-templates/:id", { preHandler: teacher }, async (request) => {
    const params = id.parse(request.params);
    return { data: await archiveOwnLessonTemplate(request.user!.id, params.id) };
  });

  app.get("/admin/lesson-templates", { preHandler: admin }, async (request) => {
    const query = z.object({ crmDirectionId: z.string().max(64).optional() }).parse(request.query ?? {});
    return { data: await listSchoolLessonTemplates(query) };
  });

  app.post("/admin/lesson-templates", { preHandler: admin }, async (request, reply) => {
    const body = z.object({
      kind,
      text: z.string().min(1).max(1000),
      crmDirectionId: z.string().max(64).nullable().optional(),
      sortOrder: z.number().int().min(0).max(10_000).optional(),
    }).parse(request.body);
    const result = await addSchoolLessonTemplate(body);
    return reply.status(result.duplicate ? 200 : 201).send({ data: result.item, duplicate: result.duplicate });
  });

  app.patch("/admin/lesson-templates/:id", { preHandler: admin }, async (request) => {
    const params = id.parse(request.params);
    const body = z.object({
      text: z.string().min(1).max(1000).optional(),
      crmDirectionId: z.string().max(64).nullable().optional(),
      sortOrder: z.number().int().min(0).max(10_000).optional(),
    }).parse(request.body);
    return { data: await updateSchoolLessonTemplate(params.id, body) };
  });

  app.delete("/admin/lesson-templates/:id", { preHandler: admin }, async (request) => {
    const params = id.parse(request.params);
    return { data: await archiveSchoolLessonTemplate(params.id) };
  });
}
