import jwt from "jsonwebtoken";
import { findUserWithRoleById } from "../repositories/auth.repository.js";
import { UnauthorizedError } from "../../domain/errors.js";
import { getStudentCoins } from "./coins.service.js";
import { getStudentPointsBalance } from "./points.service.js";

type SsoPayload = {
  purpose?: string;
  crmStudentId?: string;
  appUserId?: string;
  role?: string;
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

  if (payload.purpose !== "sso-bridge" || !payload.appUserId) {
    throw new UnauthorizedError("Некорректный SSO-токен");
  }

  const user = await findUserWithRoleById(payload.appUserId);
  if (!user) {
    throw new UnauthorizedError("Аккаунт в платформе не найден");
  }

  const stats = await studentStats(user.id, user.role.slug);

  return {
    user,
    stats,
    crmStudentId: payload.crmStudentId ?? null,
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
    avatar: user.avatar,
    phone: user.phone,
    role: user.role.slug,
    permissions: user.role.rolePermissions.map((item) => item.permission.code),
    points: stats?.points,
    coins: stats?.coins,
  };
}
