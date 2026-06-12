import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  createStudentUser,
  findUserWithRoleByEmail,
  findUserWithRoleById,
  findUserWithRoleByLogin,
  findUserWithRoleByLoginOrEmail,
} from "../../application/repositories/auth.repository.js";
import { BadRequestError, ConflictError, UnauthorizedError } from "../../domain/errors.js";
import { isValidLogin, normalizeLogin } from "../../lib/login.js";
import { isValidPhone, normalizePhoneDigits } from "../../lib/phone.js";
import { getStudentCoins } from "../../application/services/coins.service.js";
import { getStudentPointsBalance } from "../../application/services/points.service.js";
import { authenticate } from "../guards/auth.guards.js";

const loginSchema = z.object({
  login: z.string().trim().min(1).max(255),
  password: z.string().min(8).max(72),
});

const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(128),
  lastName: z.string().trim().min(1).max(128),
  login: z.string().trim().min(3).max(32),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  phone: z.string().trim().min(10).max(32),
  password: z.string().min(8).max(72),
});

function profile(
  user: Awaited<ReturnType<typeof findUserWithRoleByEmail>>,
  stats?: { points?: number; coins?: number },
) {
  if (!user) throw new UnauthorizedError();
  return {
    id: user.id,
    login: user.login,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatar: user.avatar,
    phone: user.phone,
    role: user.role.slug,
    permissions: user.role.rolePermissions.map((item) => item.permission.code),
    points: stats?.points,
    coins: stats?.coins,
  };
}

async function studentStats(userId: string, roleSlug: string) {
  if (roleSlug !== "student") return { points: 0, coins: 0 };
  const [points, coins] = await Promise.all([
    getStudentPointsBalance(userId),
    getStudentCoins(userId),
  ]);
  return { points, coins };
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await findUserWithRoleByLoginOrEmail(body.login);
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new UnauthorizedError("Неверный логин или пароль");
    }

    const token = await reply.jwtSign({ sub: user.id, role: user.role.slug });
    const stats = await studentStats(user.id, user.role.slug);

    return {
      data: {
        token,
        user: profile(user, stats),
      },
    };
  });

  app.post("/auth/register", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const login = normalizeLogin(body.login);
    if (!isValidLogin(login)) {
      throw new BadRequestError("Логин: 3–32 символа, латиница, цифры и _");
    }
    if (!isValidPhone(body.phone)) {
      throw new BadRequestError("Укажите корректный номер телефона");
    }

    const [existingEmail, existingLogin] = await Promise.all([
      findUserWithRoleByEmail(body.email),
      findUserWithRoleByLogin(login),
    ]);
    if (existingEmail) {
      throw new ConflictError("Пользователь с таким email уже зарегистрирован", "EMAIL_ALREADY_EXISTS");
    }
    if (existingLogin) {
      throw new ConflictError("Этот логин уже занят", "LOGIN_ALREADY_EXISTS");
    }

    let user;
    try {
      user = await createStudentUser({
        login,
        email: body.email,
        phone: normalizePhoneDigits(body.phone),
        passwordHash: await bcrypt.hash(body.password, 10),
        firstName: body.firstName,
        lastName: body.lastName,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : "";
        if (target.includes("login")) {
          throw new ConflictError("Этот логин уже занят", "LOGIN_ALREADY_EXISTS");
        }
        throw new ConflictError("Пользователь с таким email уже зарегистрирован", "EMAIL_ALREADY_EXISTS");
      }
      throw error;
    }
    const token = await reply.jwtSign({ sub: user.id, role: user.role.slug });

    return reply.status(201).send({
      data: {
        token,
        user: profile(user, { points: 0, coins: 0 }),
      },
    });
  });

  app.get("/auth/me", { preHandler: [authenticate] }, async (request) => {
    const authUser = request.user!;
    const user = await findUserWithRoleById(authUser.id);
    if (!user) throw new UnauthorizedError();
    const stats = await studentStats(authUser.id, authUser.roleSlug);

    return {
      data: profile(user, stats),
    };
  });
}
