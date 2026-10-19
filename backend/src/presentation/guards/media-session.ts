import type { FastifyRequest } from "fastify";
import { prisma } from "../../infrastructure/database/prisma.js";
import { UnauthorizedError } from "../../domain/errors.js";
import { authenticate } from "./auth.guards.js";

/**
 * Plan 1.12: uploaded files are served to signed-in users only. Pages load them with plain
 * <img>, <video> and <a> tags, which cannot send the Bearer header, so the API also sets a
 * cookie that carries the same session token, scoped to the media path and readable by no script.
 */
export const MEDIA_COOKIE = "maestro_media";
const MEDIA_COOKIE_PATH = "/api/v1/media";
const MEDIA_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

function isHttps(request: FastifyRequest) {
  const forwarded = request.headers["x-forwarded-proto"];
  const scheme = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || request.protocol;
  return scheme === "https";
}

export function mediaCookieHeader(token: string, request: FastifyRequest) {
  return [
    `${MEDIA_COOKIE}=${encodeURIComponent(token)}`,
    `Path=${MEDIA_COOKIE_PATH}`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MEDIA_COOKIE_MAX_AGE}`,
    ...(isHttps(request) ? ["Secure"] : []),
  ].join("; ");
}

export function clearMediaCookieHeader(request: FastifyRequest) {
  return [`${MEDIA_COOKIE}=`, `Path=${MEDIA_COOKIE_PATH}`, "HttpOnly", "SameSite=Lax", "Max-Age=0", ...(isHttps(request) ? ["Secure"] : [])].join("; ");
}

export function readMediaCookie(request: FastifyRequest) {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === MEDIA_COOKIE) {
      const value = decodeURIComponent(rest.join("="));
      return value || null;
    }
  }
  return null;
}

/** Bearer token of the current request, for setting the media cookie after sign-in elsewhere. */
export function bearerToken(request: FastifyRequest) {
  const header = request.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

async function isPublicAvatar(folder: string, filename: string) {
  if (folder !== "images") return false;
  // Avatars stay public: CRM shows them on its own site, where the platform session does not exist.
  const owner = await prisma.user.findFirst({
    where: { avatar: { endsWith: `/api/v1/media/images/${filename}` } },
    select: { id: true },
  });
  return Boolean(owner);
}

/** Header session, media cookie session, or a public avatar; otherwise 401. */
export async function authorizeMediaRequest(request: FastifyRequest, folder: string, filename: string) {
  if (bearerToken(request)) {
    await authenticate(request);
    return "session" as const;
  }
  const cookie = readMediaCookie(request);
  if (cookie) {
    request.headers.authorization = `Bearer ${cookie}`;
    try {
      await authenticate(request);
      return "cookie" as const;
    } catch {
      // An expired cookie still lets a public avatar through below.
    } finally {
      delete request.headers.authorization;
    }
  }
  if (await isPublicAvatar(folder, filename)) return "public" as const;
  throw new UnauthorizedError("Войдите в Maestro, чтобы открыть файл");
}
