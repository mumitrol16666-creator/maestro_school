import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { applyUserLink, getUserLinkStatus } from "../../application/repositories/user-link.repository.js";
import { findUserWithRoleById } from "../../application/repositories/auth.repository.js";
import { BadRequestError, ConflictError } from "../../domain/errors.js";
import { requireIntegrationAuth } from "../guards/integration.guards.js";
import { exchangeSsoBridgeToken } from "../../application/services/sso-bridge.service.js";
import { provisionTeacherFromCrm } from "../../application/services/teacher-provision.service.js";

const linkSchema = z.object({
  phone: z.string().optional(),
  phoneNormalized: z.string().min(10).max(32),
  crmStudentId: z.string().optional(),
  crmTeacherId: z.string().optional(),
  appUserId: z.string().uuid().optional(),
  initiatedBy: z.enum(["crm", "learning-platform"]).optional(),
  crmRole: z.string().optional(),
});

const ssoExchangeSchema = z.object({
  token: z.string().min(10),
});

const provisionTeacherSchema = z.object({
  crmTeacherId: z.string().min(1).max(64),
  phone: z.string().min(10).max(32),
  firstName: z.string().trim().min(1).max(128),
  lastName: z.string().trim().min(1).max(128),
  email: z.string().trim().email().optional().nullable(),
  password: z.string().min(8).max(72).optional().nullable(),
  bio: z.string().max(5000).optional().nullable(),
});

function integrationProfile(
  user: NonNullable<Awaited<ReturnType<typeof findUserWithRoleById>>>,
) {
  return {
    id: user.id,
    login: user.login,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role.slug,
    crmStudentId: user.crmStudentId,
    crmTeacherId: user.crmTeacherId,
    permissions: user.role.rolePermissions.map((item) => item.permission.code),
  };
}

export async function integrationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireIntegrationAuth);

  app.post("/users/link", async (request, reply) => {
    const body = linkSchema.parse(request.body);
    const result = await applyUserLink(body);

    if (!result.success) {
      if (result.status === "conflict") {
        throw new ConflictError(result.error);
      }
      throw new BadRequestError(result.error);
    }

    return reply.send({ success: true, data: result.data });
  });

  app.get("/users/link-status/:phone", async (request) => {
    const { phone } = request.params as { phone: string };
    const result = await getUserLinkStatus(phone);
    return { success: true, data: result.data };
  });

  app.post("/users/provision-teacher", async (request, reply) => {
    const body = provisionTeacherSchema.parse(request.body);
    const result = await provisionTeacherFromCrm(body);
    return reply.status(result.created ? 201 : 200).send({ success: true, data: result });
  });

  app.post("/auth/sso-exchange", async (request, reply) => {
    const { token } = ssoExchangeSchema.parse(request.body);
    const { user, crmStudentId } = await exchangeSsoBridgeToken(token);
    const sessionToken = await reply.jwtSign({ sub: user.id, role: user.role.slug });

    return {
      success: true,
      data: {
        token: sessionToken,
        user: integrationProfile(user),
        crmStudentId,
      },
    };
  });
}
