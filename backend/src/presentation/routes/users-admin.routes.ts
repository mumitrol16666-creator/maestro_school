import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getAdminUser,
  listAdminUsers,
  listAssignableRoles,
  updateAdminUserRole,
} from "../../application/services/users-admin.service.js";
import {
  getAdminUserCrmLink,
  linkAdminUserToCrm,
  lookupCrmByPhone,
} from "../../application/services/user-link-admin.service.js";
import { authenticate, requirePermission } from "../guards/auth.guards.js";

export async function usersAdminRoutes(app: FastifyInstance) {
  const guards = [authenticate, requirePermission("users.manage")];

  app.get("/admin/users/roles", { preHandler: guards }, async () => {
    return { data: await listAssignableRoles() };
  });

  app.get("/admin/users", { preHandler: guards }, async (request) => {
    const query = z.object({
      search: z.string().trim().optional(),
      role: z.string().trim().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }).parse(request.query);

    const result = await listAdminUsers(query);
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

  app.get("/admin/users/:id", { preHandler: guards }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await getAdminUser(id) };
  });

  app.patch("/admin/users/:id/role", { preHandler: guards }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      role: z.string().trim().min(1),
    }).parse(request.body);
    const authUser = request.user!;

    return {
      data: await updateAdminUserRole({
        actorId: authUser.id,
        actorRole: authUser.roleSlug,
        userId: id,
        roleSlug: body.role,
      }),
    };
  });

  app.get("/admin/users/:id/crm-link", { preHandler: guards }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await getAdminUserCrmLink(id) };
  });

  app.post("/admin/users/:id/crm-link", { preHandler: guards }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      crmUserId: z.string().min(1).optional(),
    }).parse(request.body ?? {});
    return { data: await linkAdminUserToCrm(id, body.crmUserId) };
  });

  app.get("/admin/crm-lookup", { preHandler: guards }, async (request) => {
    const query = z.object({ phone: z.string().min(5) }).parse(request.query);
    return { data: await lookupCrmByPhone(query.phone) };
  });
}
