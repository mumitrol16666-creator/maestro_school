import type { FastifyRequest } from "fastify";
import { UnauthorizedError, ForbiddenError } from "../../domain/errors.js";
import { findUserWithRoleById } from "../../application/repositories/auth.repository.js";
import { isContentAdminRole } from "../../domain/cms-access.js";

/**
 * Auth guards as plain functions — safe inside encapsulated route plugins.
 * Using app.authenticate in child plugins causes FST_ERR_HOOK_INVALID_HANDLER
 * because Fastify decorators do not propagate without fastify-plugin.
 */
export async function authenticate(request: FastifyRequest): Promise<void> {
  try {
    const payload = await request.jwtVerify<{ sub: string }>();
    const user = await findUserWithRoleById(payload.sub);
    if (!user) throw new UnauthorizedError();

    request.user = {
      id: user.id,
      email: user.email,
      roleSlug: user.role.slug,
      permissions: user.role.rolePermissions.map((rp) => rp.permission.code),
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    throw new UnauthorizedError();
  }
}

export function requirePermission(code: string) {
  return async function permissionGuard(request: FastifyRequest): Promise<void> {
    if (!request.user) throw new UnauthorizedError();
    if (!request.user.permissions.includes(code)) {
      throw new ForbiddenError(`Missing permission: ${code}`);
    }
  };
}

/** Sets request.user when JWT is valid; silently continues as guest otherwise. */
export async function optionalAuthenticate(request: FastifyRequest): Promise<void> {
  try {
    await authenticate(request);
  } catch {
    delete request.user;
  }
}

export async function requireContentAdmin(request: FastifyRequest): Promise<void> {
  if (!request.user) throw new UnauthorizedError();
  if (!isContentAdminRole(request.user.roleSlug)) {
    throw new ForbiddenError("Content CMS is available only to Admin and Owner");
  }
}

export async function requireStudent(request: FastifyRequest): Promise<void> {
  if (!request.user) throw new UnauthorizedError();
  if (request.user.roleSlug !== "student") {
    throw new ForbiddenError("Student account required");
  }
}

export async function requireTeacher(request: FastifyRequest): Promise<void> {
  if (!request.user) throw new UnauthorizedError();
  if (request.user.roleSlug !== "teacher") {
    throw new ForbiddenError("Teacher account required");
  }
}
