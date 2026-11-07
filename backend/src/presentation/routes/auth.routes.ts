import { sessionClaims, sessionLifetimeSeconds } from "../../application/services/account-session.service.js";
import type { FastifyInstance } from "fastify";
import { bearerToken, clearMediaCookieHeader, mediaCookieHeader, tokenRemainingSeconds } from "../guards/media-session.js";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import crypto from "node:crypto";
import path from "node:path";
import {
  findUserWithRoleByEmail,
  findUserWithRoleById,
  findUserWithRoleByLogin,
  findUserWithRoleByLoginOrEmail,
  findUsersWithRoleByPhone,
  updateOwnPassword,
  updateUserProfile,
} from "../../application/repositories/auth.repository.js";
import { BadRequestError, ConflictError, ForbiddenError, UnauthorizedError } from "../../domain/errors.js";
import { isValidLogin, normalizeLogin } from "../../lib/login.js";
import { isValidPhone, normalizePhoneDigits } from "../../lib/phone.js";
import { getStudentCoins } from "../../application/services/coins.service.js";
import { getStudentPointsBalance } from "../../application/services/points.service.js";
import { authenticate } from "../guards/auth.guards.js";
import {
  parentRegistrationLeadComment,
  registerExternalStudent,
  registerParentWithChild,
  reserveLogin,
  sendAppRegistrationLead,
} from "../../application/services/app-registration.service.js";
import { postPasswordChangedInApp, postStudentAvatarToCrm } from "../../infrastructure/crm/crm-client.js";
import {
  inferMimeType,
  mediaPublicUrl,
  writeMediaFile,
} from "../../application/services/media-storage.service.js";
import {
  buildAuthUserProfile,
  exchangeSsoBridgeToken,
} from "../../application/services/sso-bridge.service.js";
import { classifyPhoneLoginCandidates } from "../../domain/shared-phone-accounts.js";
import {
  filterLoginCandidatesByProfile,
  roleMatchesLoginProfile,
} from "../../domain/login-profile.js";
import { getProductFeatureSnapshot } from "../../config/product-features.js";
import { recordStudentLogin } from "../../application/services/app-usage.service.js";
import { resolveAudience } from "../../domain/course-access.js";

const ssoExchangeSchema = z.object({
  token: z.string().min(10),
});

const loginSchema = z.object({
  phone: z.string().trim().min(1).max(32),
  password: z.string().min(8).max(72),
  profile: z.enum(["student", "parent", "staff"]).optional(),
});

const configuredLoginRateLimit = Number(process.env.AUTH_LOGIN_RATE_LIMIT_MAX ?? 10);
const loginRateLimitMax = Number.isInteger(configuredLoginRateLimit) && configuredLoginRateLimit > 0
  ? configuredLoginRateLimit
  : 10;

const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(128),
  lastName: z.string().trim().min(1).max(128),
  middleName: z.string().trim().max(128).optional(),
  login: z.string().trim().min(3).max(32).optional(),
  email: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
  phone: z.string().trim().min(10).max(32),
  password: z.string().min(8).max(72),
});

const registerPerson = (who: "родителя" | "ребёнка") => z.object({
  firstName: z.string().trim().min(1, `Укажите имя ${who}`).max(128),
  lastName: z.string().trim().min(1, `Укажите фамилию ${who}`).max(128),
  phone: z.string({ required_error: `Укажите телефон ${who}` }).trim().min(10, `Укажите телефон ${who}`).max(32),
  password: z.string({ required_error: `Укажите пароль ${who}` }).min(8, "Пароль — не короче 8 символов").max(72),
});

/** A parent registers themselves and the child in one form: the child signs in with their own phone. */
const registerParentSchema = z.object({
  parent: registerPerson("родителя"),
  child: registerPerson("ребёнка"),
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
    // Stage 4: a student without a CRM link is external; everyone else works in the school interface.
    audience: resolveAudience({ roleSlug: user.role.slug, crmStudentId: user.crmStudentId }),
    permissions: user.role.rolePermissions.map((item) => item.permission.code),
    productFeatures: getProductFeatureSnapshot().flags,
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

/**
 * One limit for both registration forms: 5 requests a minute per IP across `/auth/register` and
 * `/auth/register/parent` together. A per-route `config.rateLimit` gets its own counter, so the two
 * routes share one limiter created here and passed as `preHandler`. Without the rate-limit plugin
 * (some tests) there is no limiter.
 */
export const REGISTRATION_RATE_LIMIT = { max: 5, timeWindow: "1 minute" } as const;

export async function authRoutes(app: FastifyInstance) {
  const registrationRateLimit = typeof app.rateLimit === "function"
    ? [app.rateLimit({ ...REGISTRATION_RATE_LIMIT, keyGenerator: (request) => `register:${request.ip}` })]
    : [];

  app.post("/auth/sso-exchange", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { token } = ssoExchangeSchema.parse(request.body);
    const { user, stats, session } = await exchangeSsoBridgeToken(token);
    const lifetime = sessionLifetimeSeconds(user.role.slug);
    const sessionToken = await reply.jwtSign(session, { expiresIn: lifetime });
    reply.header("Set-Cookie", mediaCookieHeader(sessionToken, request, lifetime));
    if (user.role.slug === "student") {
      await recordStudentLogin(user.id, "sso").catch(() => undefined);
    }

    return {
      data: {
        token: sessionToken,
        user: buildAuthUserProfile(user, stats),
      },
    };
  });

  app.post("/auth/login", { config: { rateLimit: { max: loginRateLimitMax, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const input = body.phone.trim();

    let user;
    const looksLikePhone = /^\+?\d[\d\s\-()]{5,}$/.test(input);
    if (looksLikePhone) {
      const digits = normalizePhoneDigits(input);
      const candidates = filterLoginCandidatesByProfile(
        await findUsersWithRoleByPhone(digits),
        body.profile,
      );
      const resolution = classifyPhoneLoginCandidates(candidates);
      if (resolution.kind === "ambiguous") {
        throw new ConflictError(
          "На этот номер зарегистрировано несколько профилей этого типа. Войдите по уникальному логину.",
          "PHONE_LOGIN_AMBIGUOUS",
        );
      }
      user = resolution.kind === "single" ? resolution.user : null;
    } else if (input.includes("@")) {
      user = await findUserWithRoleByLoginOrEmail(input);
    } else {
      user = await findUserWithRoleByLoginOrEmail(input);
    }

    if (user && !roleMatchesLoginProfile(user.role.slug, body.profile)) {
      user = null;
    }
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new UnauthorizedError("Неверный логин, email или пароль");
    }

    const lifetime = sessionLifetimeSeconds(user.role.slug);
    const token = await reply.jwtSign(await sessionClaims(user), { expiresIn: lifetime });
    reply.header("Set-Cookie", mediaCookieHeader(token, request, lifetime));
    const stats = await studentStats(user.id, user.role.slug);
    if (user.role.slug === "student") {
      await recordStudentLogin(user.id, "password").catch(() => undefined);
    }

    return {
      data: {
        token,
        user: profile(user, stats),
      },
    };
  });

  app.post("/auth/register", { preHandler: registrationRateLimit }, async (request, reply) => {
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
      login = await reserveLogin("s", normalizePhoneDigits(body.phone));
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
      user = await registerExternalStudent({
        login,
        email,
        phone: body.phone,
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
        throw new ConflictError("Пользователь с таким email уже зарегистрирован", "EMAIL_ALREADY_EXISTS");
      }
      throw error;
    }
    await recordStudentLogin(user.id, "registration").catch(() => undefined);

    // The school learns about the registration as a lead in CRM, not as a CRM student. Sent after the
    // account is stored and not awaited: CRM being down never fails or delays the registration.
    void sendAppRegistrationLead({
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
    });

    // Stage 4: registration no longer links a CRM student, so the stored account is the final state.
    // Package 4: the session lives as long as the role allows (a student: 30 days), the cookie too.
    const lifetime = sessionLifetimeSeconds(user.role.slug);
    const token = await reply.jwtSign(await sessionClaims(user), { expiresIn: lifetime });
    reply.header("Set-Cookie", mediaCookieHeader(token, request, lifetime));

    return reply.status(201).send({
      data: {
        token,
        user: profile(user, { points: 0, coins: 0 }),
      },
    });
  });

  // Stage 4, decision ★1: «Я родитель» registers the parent, the child and the link in one transaction.
  // The answer is the parent's session. The school gets one lead, from the parent, naming the child.
  app.post("/auth/register/parent", { preHandler: registrationRateLimit }, async (request, reply) => {
    const body = registerParentSchema.parse(request.body);
    const { parent, child } = await registerParentWithChild(body);

    void sendAppRegistrationLead({
      userId: parent.id,
      firstName: parent.firstName,
      lastName: parent.lastName,
      phone: parent.phone,
      comment: parentRegistrationLeadComment(child),
    });

    const parentWithRole = await findUserWithRoleById(parent.id);
    if (!parentWithRole) throw new UnauthorizedError();
    // A parent's session: 7 days by the role policy, the media cookie lives exactly as long.
    const lifetime = sessionLifetimeSeconds(parentWithRole.role.slug);
    const token = await reply.jwtSign(await sessionClaims(parentWithRole), { expiresIn: lifetime });
    reply.header("Set-Cookie", mediaCookieHeader(token, request, lifetime));

    return reply.status(201).send({
      data: {
        token,
        user: profile(parentWithRole, { points: 0, coins: 0 }),
        child: { id: child.id, firstName: child.firstName, lastName: child.lastName, login: child.login },
      },
    });
  });

  // Plan 1.12: refresh or clear the media cookie for sessions signed in before it existed.
  app.post("/auth/media-session", { preHandler: [authenticate] }, async (request, reply) => {
    const token = bearerToken(request);
    if (token) reply.header("Set-Cookie", mediaCookieHeader(token, request, tokenRemainingSeconds(token)));
    return { data: { ok: true } };
  });

  // Every opening of the student app renews the sign-in (30 days from the last visit). Parents and
  // staff keep a hard 7 days from sign-in. authenticate has already rejected an expired token, a changed
  // password (sessionVersion), a disabled or archived account and a revoked CRM link.
  // The limit counts per token: behind a proxy the IP is shared by the whole school.
  app.post("/auth/refresh", {
    preHandler: [authenticate],
    config: {
      rateLimit: {
        max: 30,
        timeWindow: "1 minute",
        keyGenerator: (request) => crypto.createHash("sha256").update(request.headers.authorization ?? request.ip).digest("hex"),
      },
    },
  }, async (request, reply) => {
    const verified = request.user!;
    if (verified.roleSlug !== "student") {
      throw new ForbiddenError("Продление входа доступно только ученикам. Войдите заново, когда срок закончится.");
    }
    const user = await findUserWithRoleById(verified.id);
    if (!user) throw new UnauthorizedError();
    const claims = await sessionClaims(user);
    // The password may change between authenticate and this read. Never sign an account revision
    // other than the one the presented token was verified against.
    if (claims.sessionVersion !== verified.sessionVersion
        || (claims as { crmSessionVersion?: number }).crmSessionVersion !== verified.crmSessionVersion) {
      throw new UnauthorizedError();
    }
    const lifetime = sessionLifetimeSeconds(user.role.slug);
    const token = await reply.jwtSign(claims, { expiresIn: lifetime });
    reply.header("Set-Cookie", mediaCookieHeader(token, request, lifetime));
    // «Последний вход» follows the renewal: a student no longer signs in with a password every week.
    await recordStudentLogin(user.id, "refresh").catch(() => undefined);
    const stats = await studentStats(user.id, user.role.slug);
    return { data: { token, user: profile(user, stats) } };
  });

  app.delete("/auth/media-session", async (request, reply) => {
    reply.header("Set-Cookie", clearMediaCookieHeader(request));
    return { data: { ok: true } };
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
      ...(body.phone
        ? {
            phone: normalizePhoneDigits(body.phone),
            phoneNormalized: normalizePhoneDigits(body.phone),
          }
        : {}),
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

  app.patch("/auth/me/password", { preHandler: [authenticate] }, async (request, reply) => {
    const authUser = request.user!;
    const body = passwordChangeSchema.parse(request.body);
    if (body.currentPassword === body.newPassword) {
      throw new BadRequestError("Новый пароль должен отличаться от текущего");
    }

    const user = await findUserWithRoleById(authUser.id);
    if (!user) throw new UnauthorizedError();
    // В-41, З-1: a typo in the current password is a form error, not a lost session — 401 would
    // make the app sign the student out.
    if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
      throw new BadRequestError("Текущий пароль указан неверно", "CURRENT_PASSWORD_INVALID");
    }

    const updated = await updateOwnPassword(authUser.id, await bcrypt.hash(body.newPassword, 10));
    // CRM forgets its copy of the old password. Not awaited: the change is already saved, and CRM
    // also compares passwordChangedInAppAt before it shows a copy, so a lost notice shows nothing stale.
    const crmUserId = user.crmStudentId || user.crmTeacherId;
    if (crmUserId && user.externalLinkStatus === "linked" && updated.passwordChangedInAppAt) {
      void postPasswordChangedInApp({ appUserId: updated.id, crmUserId, changedAt: updated.passwordChangedInAppAt.toISOString() })
        .catch((error) => request.log.warn({ error, userId: updated.id }, "Failed to tell CRM about a password change"));
    }
    // Authentication already checked CRM. Do not make a fallible remote call
    // after committing the new password; retain that checked revision instead.
    const lifetime = sessionLifetimeSeconds(user.role.slug);
    const token = await reply.jwtSign({ sub: updated.id, role: user.role.slug, sessionVersion: updated.sessionVersion,
      ...(authUser.crmSessionVersion === undefined ? {} : { crmSessionVersion: authUser.crmSessionVersion }),
    }, { expiresIn: lifetime });
    reply.header("Set-Cookie", mediaCookieHeader(token, request, lifetime));

    return {
      data: { ok: true, token },
    };
  });
}
