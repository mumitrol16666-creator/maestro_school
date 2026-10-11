import { UnauthorizedError } from "../../domain/errors.js";
import { fetchCrmAccountSession } from "../../infrastructure/crm/crm-client.js";

type SessionUser = {
  id: string;
  sessionVersion: number;
  crmStudentId?: string | null;
  crmTeacherId?: string | null;
  externalLinkStatus?: string | null;
  role: { slug: string };
};

export function sessionVersionMatches(claim: unknown, current: number): boolean {
  const version = claim === undefined ? 0 : claim;
  return typeof version === "number" && Number.isSafeInteger(version) && version >= 0
    && Number.isSafeInteger(current) && version === current;
}

export async function linkedCrmSession(user: SessionUser) {
  const crmUserId = user.crmTeacherId || user.crmStudentId;
  if (!crmUserId) return null;
  if (user.externalLinkStatus !== "linked") {
    throw new UnauthorizedError("Связь с учётной записью школы изменилась");
  }
  const state = await fetchCrmAccountSession(crmUserId, user.id);
  // Platform roles (including curator/owner) are assigned independently. A
  // legacy student ID may coexist with a teacher ID; the staff binding owns it.
  if (state.crmUserId !== crmUserId || state.appUserId !== user.id
      || (user.crmTeacherId && state.role !== "teacher")
      || !Number.isSafeInteger(state.sessionVersion) || state.sessionVersion < 0) {
    throw new UnauthorizedError("Доступ к учётной записи школы изменился");
  }
  return state;
}

export async function sessionClaims(user: SessionUser) {
  if (!Number.isSafeInteger(user.sessionVersion) || user.sessionVersion < 0) throw new UnauthorizedError();
  // School enrollment status is not the lifetime of a student's online account.
  // Student/parent access is revoked by the Platform's own account state.
  const crm = user.crmTeacherId ? await linkedCrmSession(user) : null;
  return { sub: user.id, role: user.role.slug, sessionVersion: user.sessionVersion,
    ...(crm ? { crmSessionVersion: crm.sessionVersion } : {}) };
}

export async function assertCurrentSession(user: SessionUser, payload: {
  sessionVersion?: unknown; crmSessionVersion?: unknown; iat?: unknown;
}) {
  // Old platform JWTs had no exp. Bound those to the same seven-day lifetime.
  if (!Number.isSafeInteger(payload.iat) || typeof payload.iat !== "number"
      || payload.iat > Date.now() / 1000 + 60 || Date.now() / 1000 - payload.iat > 7 * 86400
      || !sessionVersionMatches(payload.sessionVersion, user.sessionVersion)) throw new UnauthorizedError();
  const crm = user.crmTeacherId ? await linkedCrmSession(user) : null;
  if (crm && !sessionVersionMatches(payload.crmSessionVersion, crm.sessionVersion)) throw new UnauthorizedError();
  return crm ? { crmSessionVersion: crm.sessionVersion } : {};
}
