import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getAdminStudent,
  listAdminStudents,
} from "../../application/services/students-admin.service.js";
import { authenticate, requirePermission } from "../guards/auth.guards.js";

export async function studentsAdminRoutes(app: FastifyInstance) {
  const guards = [authenticate, requirePermission("users.manage")];

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
}
