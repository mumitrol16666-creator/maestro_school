import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getAdminStudent,
  listAdminStudents,
} from "../../application/services/students-admin.service.js";
import {
  createParentForStudent,
  linkExistingParentToStudent,
  resetLinkedParentPassword,
  revokeParentLink,
} from "../../application/services/family.service.js";
import {
  decideParentVisibilityRequest,
  getParentVisibilityWorkspace,
  updateParentVisibility,
} from "../../application/services/parent-visibility.service.js";
import { authenticate, requirePermission } from "../guards/auth.guards.js";

export async function studentsAdminRoutes(app: FastifyInstance) {
  const guards = [authenticate, requirePermission("users.manage")];
  const relationship = z.enum(["mother", "father", "guardian", "other"]);
  const visibility = z.object({
    showSchedule: z.boolean(),
    showBalance: z.boolean(),
    showPlanProgress: z.boolean(),
    showAchievements: z.boolean(),
  });

  app.get("/admin/students", { preHandler: guards }, async (request) => {
    const query = z.object({
      search: z.string().trim().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }).parse(request.query);

    const result = await listAdminStudents(query);
    return {
      data: result.items,
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        pages: Math.ceil(result.total / query.limit),
      },
    };
  });

  app.get("/admin/students/:id", { preHandler: guards }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await getAdminStudent(id) };
  });

  app.get("/admin/students/:id/parent-visibility", { preHandler: guards }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await getParentVisibilityWorkspace(id) };
  });

  app.patch("/admin/students/:id/parent-visibility", { preHandler: guards }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      visibility,
      reason: z.string().trim().min(3).max(1000),
    }).parse(request.body);
    return {
      data: await updateParentVisibility({
        studentId: id,
        actorId: request.user!.id,
        visibility: body.visibility,
        reason: body.reason,
      }),
    };
  });

  app.post(
    "/admin/students/:id/parent-visibility-requests/:requestId/decision",
    { preHandler: guards },
    async (request) => {
      const { id, requestId } = z.object({
        id: z.string().uuid(),
        requestId: z.string().uuid(),
      }).parse(request.params);
      const body = z.object({
        decision: z.enum(["approved", "rejected"]),
        note: z.string().trim().min(3).max(1000),
      }).parse(request.body);
      return {
        data: await decideParentVisibilityRequest({
          studentId: id,
          requestId,
          actorId: request.user!.id,
          decision: body.decision,
          note: body.note,
        }),
      };
    },
  );

  app.post("/admin/students/:id/parents", { preHandler: guards }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.discriminatedUnion("mode", [
      z.object({
        mode: z.literal("create"),
        firstName: z.string().trim().min(1, "Укажите имя родителя").max(128, "Имя слишком длинное"),
        lastName: z.string().trim().min(1, "Укажите фамилию родителя").max(128, "Фамилия слишком длинная"),
        middleName: z.string().trim().max(128, "Отчество слишком длинное").optional().nullable(),
        phone: z.string().trim()
          .min(10, "Укажите корректный номер телефона")
          .max(32, "Номер телефона слишком длинный"),
        login: z.string().trim()
          .min(3, "Логин должен содержать минимум 3 символа")
          .max(32, "Логин должен содержать не более 32 символов"),
        password: z.string()
          .min(8, "Пароль должен содержать минимум 8 символов")
          .max(72, "Пароль должен содержать не более 72 символов"),
        relationship: relationship.default("guardian"),
      }),
      z.object({
        mode: z.literal("link"),
        login: z.string().trim()
          .min(3, "Укажите логин существующего родителя")
          .max(32, "Логин должен содержать не более 32 символов"),
        relationship: relationship.default("guardian"),
      }),
    ]).parse(request.body);

    const data = body.mode === "create"
      ? await createParentForStudent({
          studentId: id,
          actorId: request.user!.id,
          firstName: body.firstName,
          lastName: body.lastName,
          middleName: body.middleName,
          phone: body.phone,
          login: body.login,
          password: body.password,
          relationship: body.relationship,
        })
      : await linkExistingParentToStudent({
          studentId: id,
          actorId: request.user!.id,
          login: body.login,
          relationship: body.relationship,
        });

    return reply.status(201).send({ data });
  });

  app.delete(
    "/admin/students/:id/parents/:linkId",
    { preHandler: guards },
    async (request) => {
      const { id, linkId } = z.object({
        id: z.string().uuid(),
        linkId: z.string().uuid(),
      }).parse(request.params);
      return {
        data: await revokeParentLink({
          studentId: id,
          linkId,
          actorId: request.user!.id,
        }),
      };
    },
  );

  app.patch(
    "/admin/students/:id/parents/:linkId/password",
    { preHandler: guards },
    async (request) => {
      const { id, linkId } = z.object({
        id: z.string().uuid(),
        linkId: z.string().uuid(),
      }).parse(request.params);
      const { password } = z.object({
        password: z.string()
          .min(8, "Пароль должен содержать минимум 8 символов")
          .max(72, "Пароль должен содержать не более 72 символов"),
      }).parse(request.body);
      return {
        data: await resetLinkedParentPassword({
          studentId: id,
          linkId,
          password,
        }),
      };
    },
  );
}
