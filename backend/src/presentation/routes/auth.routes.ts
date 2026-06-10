import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  createStudentUser,
  findUserWithRoleByEmail,
  findUserWithRoleById,
} from "../../application/repositories/auth.repository.js";
import { ConflictError, UnauthorizedError } from "../../domain/errors.js";
import { getStudentPointsBalance } from "../../application/services/points.service.js";
import { authenticate } from "../guards/auth.guards.js";

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(72),
});

const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(128),
  lastName: z.string().trim().min(1).max(128),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  phone: z.string().trim().min(3).max(32).optional(),
  password: z.string().min(8).max(72),
});

function profile(user: Awaited<ReturnType<typeof findUserWithRoleByEmail>>, points?: number) {
  if (!user) throw new UnauthorizedError();
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatar: user.avatar,
    phone: user.phone,
    role: user.role.slug,
    permissions: user.role.rolePermissions.map((item) => item.permission.code),
    points,
  };
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await findUserWithRoleByEmail(body.email);
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const token = await reply.jwtSign({ sub: user.id, role: user.role.slug });
    const points = user.role.slug === "student"
      ? await getStudentPointsBalance(user.id)
      : 0;

    return {
      data: {
        token,
        user: profile(user, points),
      },
    };
  });

  app.post("/auth/register", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const existing = await findUserWithRoleByEmail(body.email);
    if (existing) {
      throw new ConflictError("Пользователь с таким email уже зарегистрирован", "EMAIL_ALREADY_EXISTS");
    }

    let user;
    try {
      user = await createStudentUser({
        email: body.email,
        phone: body.phone || undefined,
        passwordHash: await bcrypt.hash(body.password, 10),
        firstName: body.firstName,
        lastName: body.lastName,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("Пользователь с таким email уже зарегистрирован", "EMAIL_ALREADY_EXISTS");
      }
      throw error;
    }
    const token = await reply.jwtSign({ sub: user.id, role: user.role.slug });

    return reply.status(201).send({
      data: {
        token,
        user: profile(user, 0),
      },
    });
  });

  app.get("/auth/me", { preHandler: [authenticate] }, async (request) => {
    const authUser = request.user!;
    const user = await findUserWithRoleById(authUser.id);
    if (!user) throw new UnauthorizedError();
    const points = authUser.roleSlug === "student"
      ? await getStudentPointsBalance(authUser.id)
      : 0;

    return {
      data: profile(user, points),
    };
  });
}
