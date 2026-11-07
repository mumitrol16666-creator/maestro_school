import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";

process.env.JWT_SECRET ??= "media-session-test-secret-1234";
process.env.DATABASE_URL ??= "postgresql://localhost:5432/media_session_test_unused";
const { mediaCookieHeader, tokenRemainingSeconds } = await import("./media-session.js");

const request = { headers: {}, protocol: "http" } as unknown as FastifyRequest;
const token = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;

test("media cookie Max-Age is the given session lifetime", () => {
  assert.match(mediaCookieHeader("t", request, 7 * 86400), /Max-Age=604800(;|$)/);
  assert.match(mediaCookieHeader("t", request, 30 * 86400), /Max-Age=2592000(;|$)/);
});

test("tokenRemainingSeconds follows the token exp and falls back to 7 days", () => {
  const now = Math.floor(Date.now() / 1000);
  const left = tokenRemainingSeconds(token({ exp: now + 10 * 86400 }));
  assert.ok(left >= 10 * 86400 - 2 && left <= 10 * 86400, String(left));
  assert.equal(tokenRemainingSeconds(token({ exp: now - 5 })), 0);
  assert.equal(tokenRemainingSeconds(token({})), 7 * 86400);
  assert.equal(tokenRemainingSeconds("garbage"), 7 * 86400);
});
