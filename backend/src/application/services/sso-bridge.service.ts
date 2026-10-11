import jwt from "jsonwebtoken";
import { findUserWithRoleById } from "../repositories/auth.repository.js";
import { UnauthorizedError } from "../../domain/errors.js";
import { getStudentCoins } from "./coins.service.js";
import { getStudentPointsBalance } from "./points.service.js";
import { linkedCrmSession, sessionVersionMatches } from "./account-session.service.js";

type SsoPayload = {
  purpose?: string;
  crmStudentId?: string;
  appUserId?: string;
  role?: string;
  sessionVersion?: unknown;
  crmSessionVersion?: unknown;
};

function ssoSecret(): string {
  const secret = process.env.INTEGRATION_SSO_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new UnauthorizedError("SSO is not configured");
  }
  return secret;
}

async function studentStats(userId: string, roleSlug: string) {
  if (roleSlug !== "student") return { points: 0, coins: 0 };
  const [points, coins] = await Promise.all([
    getStudentPointsBalance(userId),
    getStudentCoins(userId),
  ]);
  return { points, coins };
}

export async function exchangeSsoBridgeToken(token: string) {
  let payload: SsoPayload;
  try {
    payload = jwt.verify(token, ssoSecret()) as SsoPayload;
  } catch {
    throw new UnauthorizedError("Ссылка для входа недействительна или устарела");
  }

  if (payload.purpose !== "sso-bridge" || !payload.appUserId || !payload.crmStudentId) {
    throw new UnauthorizedError("Некорректный SSO-токен");
  }

  const user = await findUserWithRoleById(payload.appUserId);
  if (!user) {
    throw new UnauthorizedError("Аккаунт в платформе не найден");
  }

  const crm = await linkedCrmSession(user);
  if (!crm || payload.crmStudentId !== crm.crmUserId || payload.role !== crm.role
      || !sessionVersionMatches(payload.sessionVersion, user.sessionVersion)
      || !sessionVersionMatches(payload.crmSessionVersion, crm.sessionVersion)) {
    throw new UnauthorizedError("Ссылка для входа отозвана. Запросите новую ссылку.");
  }

  const stats = await studentStats(user.id, user.role.slug);

  return {
    user,
    stats,
    crmStudentId: payload.crmStudentId ?? null,
    session: { sub: user.id, role: user.role.slug, sessionVersion: user.sessionVersion, crmSessionVersion: crm.sessionVersion },
  };
}

export function buildAuthUserProfile(
  user: NonNullable<Awaited<ReturnType<typeof findUserWithRoleById>>>,
  stats?: { points?: number; coins?: number },
) {
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
