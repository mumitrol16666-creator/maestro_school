import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import crypto from "node:crypto";
import {
  createStudentUser,
  findUserWithRoleByEmail,
  findUserWithRoleById,
  findUserWithRoleByLogin,
  findUserWithRoleByLoginOrEmail,
  findUserWithRoleByPhone,
  updateUserPassword,
  updateUserProfile,
} from "../../application/repositories/auth.repository.js";
import { BadRequestError, ConflictError, UnauthorizedError } from "../../domain/errors.js";
import { isValidLogin, normalizeLogin } from "../../lib/login.js";
import { isValidPhone, normalizePhoneDigits } from "../../lib/phone.js";
import { getStudentCoins } from "../../application/services/coins.service.js";
import { getStudentPointsBalance } from "../../application/services/points.service.js";
import { authenticate } from "../guards/auth.guards.js";
import { syncNewStudentToCrm } from "../../application/services/crm-sync.service.js";
import {
  buildAuthUserProfile,
  exchangeSsoBridgeToken,
} from "../../application/services/sso-bridge.service.js";

const ssoExchangeSchema = z.object({
  token: z.string().min(10),
});

const loginSchema = z.object({
  phone: z.string().trim().min(1).max(32),
  password: z.string().min(8).max(72),
});

const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(128),
  lastName: z.string().trim().min(1).max(128),
  login: z.string().trim().min(3).max(32).optional(),
  email: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
  phone: z.string().trim().min(10).max(32),
  password: z.string().min(8).max(72),
});

const profileUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(128).optional(),
  lastName: z.string().trim().min(1).max(128).optional(),
  phone: z.string().trim().min(10).max(32).optional(),
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(8).max(72),
  newPassword: z.string().min(8).max(72),
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
  app.post("/auth/sso-exchange", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { token } = ssoExchangeSchema.parse(request.body);
    const { user, stats } = await exchangeSsoBridgeToken(token);
    const sessionToken = await reply.jwtSign({ sub: user.id, role: user.role.slug });

    return {
      data: {
        token: sessionToken,
        user: buildAuthUserProfile(user, stats),
      },
    };
  });

  app.post("/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const input = body.phone.trim();

    let user;
    const looksLikePhone = /^\+?\d[\d\s\-()]{5,}$/.test(input);
    if (looksLikePhone) {
      const digits = normalizePhoneDigits(input);
      user = await findUserWithRoleByPhone(digits);
    } else if (input.includes("@")) {
      user = await findUserWithRoleByLoginOrEmail(input);
    } else {
      user = await findUserWithRoleByLoginOrEmail(input);
    }

    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new UnauthorizedError("Неверный телефон или пароль");
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
    if (!isValidPhone(body.phone)) {
      throw new BadRequestError("Укажите корректный номер телефона");
    }

    // Auto-generate login if not provided
    let login: string;
    if (body.login) {
      login = normalizeLogin(body.login);
      if (!isValidLogin(login)) {
        throw new BadRequestError("Логин: 3–32 символа, латиница, цифры и _");
      }
      const existingLogin = await findUserWithRoleByLogin(login);
      if (existingLogin) {
        throw new ConflictError("Этот логин уже занят", "LOGIN_ALREADY_EXISTS");
      }
    } else {
      const digits = normalizePhoneDigits(body.phone);
      let candidate = `s_${digits.slice(-10)}`.slice(0, 32);
      let suffix = 0;
      while (await findUserWithRoleByLogin(candidate)) {
        suffix += 1;
        candidate = `s_${digits.slice(-10)}_${suffix}`.slice(0, 32);
      }
      login = candidate;
    }

    // Use provided email or null
    const email = body.email ?? null;
    if (email) {
      const existingEmail = await findUserWithRoleByEmail(email);
      if (existingEmail) {
        throw new ConflictError("Пользователь с таким email уже зарегистрирован", "EMAIL_ALREADY_EXISTS");
      }
    }

    let user;
    try {
      user = await createStudentUser({
        login,
        email,
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
        if (target.includes("phone_normalized")) {
          throw new ConflictError("Пользователь с таким телефоном уже зарегистрирован", "PHONE_ALREADY_EXISTS");
        }
        throw new ConflictError("Пользователь с таким email уже зарегистрирован", "EMAIL_ALREADY_EXISTS");
      }
      throw error;
    }
    const token = await reply.jwtSign({ sub: user.id, role: user.role.slug });

    await syncNewStudentToCrm({
      appUserId: user.id,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email ?? "",
    });

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

  app.patch("/auth/me", { preHandler: [authenticate] }, async (request) => {
    const authUser = request.user!;
    const body = profileUpdateSchema.parse(request.body);
    if (!body.firstName && !body.lastName && !body.phone) {
      throw new BadRequestError("Укажите хотя бы одно поле для обновления");
    }
    if (body.phone && !isValidPhone(body.phone)) {
      throw new BadRequestError("Укажите корректный номер телефона");
    }

    const user = await updateUserProfile(authUser.id, {
      ...(body.firstName ? { firstName: body.firstName } : {}),
      ...(body.lastName ? { lastName: body.lastName } : {}),
      ...(body.phone ? { phone: normalizePhoneDigits(body.phone) } : {}),
    });
    const stats = await studentStats(authUser.id, authUser.roleSlug);

    return {
      data: profile(user, stats),
    };
  });

  app.patch("/auth/me/password", { preHandler: [authenticate] }, async (request) => {
    const authUser = request.user!;
    const body = passwordChangeSchema.parse(request.body);
    if (body.currentPassword === body.newPassword) {
      throw new BadRequestError("Новый пароль должен отличаться от текущего");
    }

    const user = await findUserWithRoleById(authUser.id);
    if (!user || !(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
      throw new UnauthorizedError("Текущий пароль указан неверно");
    }

    await updateUserPassword(authUser.id, await bcrypt.hash(body.newPassword, 10));

    return {
      data: { ok: true },
    };
  });
}
