import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { findUserWithRoleByEmail } from "../../application/repositories/auth.repository.js";
import { UnauthorizedError } from "../../domain/errors.js";
import { getStudentPointsBalance } from "../../application/services/points.service.js";
import { authenticate } from "../guards/auth.guards.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await findUserWithRoleByEmail(body.email);
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const token = await reply.jwtSign({ sub: user.id, role: user.role.slug });
    const points = user.role.slug === "student"
      ? await getStudentPointsBalance(user.id)
      : undefined;

    return {
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
          role: user.role.slug,
          points,
        },
      },
    };
  });

  app.get("/auth/me", { preHandler: [authenticate] }, async (request) => {
    const user = request.user!;
    const points = user.roleSlug === "student"
      ? await getStudentPointsBalance(user.id)
      : undefined;

    return {
      data: {
        id: user.id,
        email: user.email,
        role: user.roleSlug,
        permissions: user.permissions,
        points,
      },
    };
  });
}
