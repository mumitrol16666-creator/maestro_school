import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import crypto from "node:crypto";
import path from "node:path";
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
import { postStudentAvatarToCrm } from "../../infrastructure/crm/crm-client.js";
import {
  inferMimeType,
  mediaPublicUrl,
  writeMediaFile,
} from "../../application/services/media-storage.service.js";
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
  middleName: z.string().trim().max(128).optional(),
  login: z.string().trim().min(3).max(32).optional(),
  email: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
  phone: z.string().trim().min(10).max(32),
  password: z.string().min(8).max(72),
});

const profileUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(128).optional(),
  lastName: z.string().trim().min(1).max(128).optional(),
  middleName: z.string().trim().max(128).optional().nullable(),
  phone: z.string().trim().min(10).max(32).optional(),
  profileBio: z.string().trim().max(1000).optional().nullable(),
  profileInstrument: z.string().trim().max(128).optional().nullable(),
  profileInterests: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  profilePublic: z.boolean().optional(),
});

const avatarUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  base64: z.string().min(1),
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
    middleName: user.middleName,
    avatar: user.avatar,
    profileBio: user.profileBio,
    profileInstrument: user.profileInstrument,
    profileInterests: user.profileInterests,
    profilePublic: user.profilePublic,
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
        middleName: body.middleName || null,
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
      middleName: user.middleName,
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
    if (
      !body.firstName &&
      !body.lastName &&
      body.middleName === undefined &&
      !body.phone &&
      body.profileBio === undefined &&
      body.profileInstrument === undefined &&
      body.profileInterests === undefined &&
      body.profilePublic === undefined
    ) {
      throw new BadRequestError("Укажите хотя бы одно поле для обновления");
    }
    if (body.phone && !isValidPhone(body.phone)) {
      throw new BadRequestError("Укажите корректный номер телефона");
    }

    const user = await updateUserProfile(authUser.id, {
      ...(body.firstName ? { firstName: body.firstName } : {}),
      ...(body.lastName ? { lastName: body.lastName } : {}),
      ...(body.middleName !== undefined ? { middleName: body.middleName || null } : {}),
      ...(body.phone ? { phone: normalizePhoneDigits(body.phone) } : {}),
      ...(body.profileBio !== undefined ? { profileBio: body.profileBio || null } : {}),
      ...(body.profileInstrument !== undefined ? { profileInstrument: body.profileInstrument || null } : {}),
      ...(body.profileInterests !== undefined
        ? { profileInterests: Array.from(new Set(body.profileInterests.map((item) => item.trim()).filter(Boolean))) }
        : {}),
      ...(body.profilePublic !== undefined ? { profilePublic: body.profilePublic } : {}),
    });
    const stats = await studentStats(authUser.id, authUser.roleSlug);

    return {
      data: profile(user, stats),
    };
  });

  app.post("/auth/me/avatar", { preHandler: [authenticate] }, async (request, reply) => {
    const authUser = request.user!;
    const user = await findUserWithRoleById(authUser.id);
    if (!user) throw new UnauthorizedError();

    const body = avatarUploadSchema.parse(request.body);
    const bytes = Buffer.from(body.base64, "base64");
    if (bytes.length > 5 * 1024 * 1024) throw new BadRequestError("Файл больше 5 МБ");

    const mimeType = inferMimeType(body.filename, body.mimeType);
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      throw new BadRequestError("Загрузите JPG, PNG или WebP");
    }

    const extension = path.extname(body.filename).toLowerCase().replace(/[^a-z0-9.]/g, "") || ".jpg";
    const filename = `${crypto.randomUUID()}${extension}`;
    await writeMediaFile("images", filename, bytes, { originalFilename: body.filename, mimeType });
    const avatarUrl = mediaPublicUrl(request, "images", filename);

    const updated = await updateUserProfile(authUser.id, { avatar: avatarUrl });
    const stats = await studentStats(authUser.id, authUser.roleSlug);
    let avatarSyncStatus: "synced" | "not_linked" | "failed" = user.crmStudentId ? "synced" : "not_linked";

    if (user.crmStudentId) {
      try {
        await postStudentAvatarToCrm(user.crmStudentId, avatarUrl);
      } catch (error) {
        request.log.warn({ error, userId: user.id }, "Failed to sync student avatar to CRM");
        avatarSyncStatus = "failed";
      }
    }

    return reply.status(201).send({
      data: {
        ...profile(updated, stats),
        avatarSyncStatus,
      },
    });
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
