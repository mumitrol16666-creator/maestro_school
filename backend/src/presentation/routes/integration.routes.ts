import type { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { applyUserLink, getUserLinkStatus } from "../../application/repositories/user-link.repository.js";
import { findUserWithRoleById } from "../../application/repositories/auth.repository.js";
import { BadRequestError, ConflictError, UnauthorizedError } from "../../domain/errors.js";
import { requireIntegrationAuth } from "../guards/integration.guards.js";

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

  app.post("/auth/sso-exchange", async (request, reply) => {
    const { token } = ssoExchangeSchema.parse(request.body);
    const secret = process.env.INTEGRATION_SSO_SECRET || process.env.JWT_SECRET;
    if (!secret) {
      throw new BadRequestError("SSO secret is not configured");
    }

    let payload: {
      purpose?: string;
      crmStudentId?: string;
      appUserId?: string;
      role?: string;
    };

    try {
      payload = jwt.verify(token, secret) as typeof payload;
    } catch {
      throw new UnauthorizedError("Invalid or expired SSO token");
    }

    if (payload.purpose !== "sso-bridge" || !payload.appUserId) {
      throw new UnauthorizedError("Invalid SSO token payload");
    }

    const user = await findUserWithRoleById(payload.appUserId);
    if (!user) {
      throw new UnauthorizedError("Linked App user not found");
    }

    const sessionToken = await reply.jwtSign({ sub: user.id, role: user.role.slug });

    return {
      success: true,
      data: {
        token: sessionToken,
        user: integrationProfile(user),
        crmStudentId: payload.crmStudentId,
      },
    };
  });
}
