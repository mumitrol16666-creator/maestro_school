import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requirePermission, requireStudent, requireTeacher } from "../guards/auth.guards.js";
import {
  addMaterialLink,
  archiveMaterial,
  listMaterialLibrary,
  renameMaterial,
  uploadMaterialFile,
} from "../../application/services/material-library.service.js";
import {
  getStudentLessonShare,
  listShareableCourseLessons,
  listStudentLessonShares,
  shareCourseLessonWithStudent,
} from "../../application/services/lesson-share.service.js";

/** Plan 1.12: the school's library of materials and course lessons sent to students. */
export async function materialLibraryRoutes(app: FastifyInstance) {
  const staffRead = [authenticate, requirePermission("offline_school.read")];
  const staffWrite = [authenticate, requirePermission("offline_school.write")];
  const kind = z.enum(["video", "image", "pdf", "audio", "file", "link"]);

  app.get("/materials/library", { preHandler: staffRead }, async (request) => {
    const query = z.object({
      search: z.string().max(255).optional(),
      kind: kind.optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    }).parse(request.query ?? {});
    return { data: await listMaterialLibrary(query) };
  });

  app.post("/materials/library/links", { preHandler: staffWrite }, async (request, reply) => {
    const body = z.object({ url: z.string().min(1).max(2048), title: z.string().min(1).max(255) }).parse(request.body);
    const result = await addMaterialLink(request.user!.id, body);
    return reply.status(result.duplicate ? 200 : 201).send({ data: result.item, duplicate: result.duplicate });
  });

  app.post("/materials/library/files", { preHandler: staffWrite }, async (request, reply) => {
    const body = z.object({
      filename: z.string().trim().min(1).max(255),
      mimeType: z.string().max(128).nullable().optional(),
      contentBase64: z.string().min(1),
      title: z.string().max(255).nullable().optional(),
    }).parse(request.body);
    return reply.status(201).send({ data: await uploadMaterialFile(request.user!.id, body) });
  });

  app.patch("/materials/library/:id", { preHandler: staffWrite }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ title: z.string().min(1).max(255) }).parse(request.body);
    return { data: await renameMaterial({ id: request.user!.id, roleSlug: request.user!.roleSlug }, id, body.title) };
  });

  app.delete("/materials/library/:id", { preHandler: staffWrite }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await archiveMaterial({ id: request.user!.id, roleSlug: request.user!.roleSlug }, id) };
  });

  app.get("/teachers/me/course-lessons", { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.read")] }, async () => ({
    data: await listShareableCourseLessons(),
  }));

  app.post(
    "/teachers/me/students/:crmStudentId/lesson-shares",
    { preHandler: [authenticate, requireTeacher, requirePermission("offline_school.write")] },
    async (request, reply) => {
      const { crmStudentId } = z.object({ crmStudentId: z.string().min(1).max(128) }).parse(request.params);
      const body = z.object({ lessonId: z.string().uuid(), note: z.string().max(1000).nullable().optional() }).parse(request.body);
      return reply.status(201).send({ data: await shareCourseLessonWithStudent(request.user!.id, crmStudentId, body) });
    },
  );

  app.get("/students/me/shared-lessons", { preHandler: [authenticate, requireStudent] }, async (request) => ({
    data: await listStudentLessonShares(request.user!.id),
  }));

  app.get("/students/me/shared-lessons/:shareId", { preHandler: [authenticate, requireStudent] }, async (request) => {
    const { shareId } = z.object({ shareId: z.string().uuid() }).parse(request.params);
    return { data: await getStudentLessonShare(request.user!.id, shareId) };
  });
}
