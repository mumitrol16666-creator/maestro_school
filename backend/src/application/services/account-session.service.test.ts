import assert from "node:assert/strict";
import test from "node:test";

process.env.CRM_SESSION_CACHE_TTL_MS = "30000";
process.env.CRM_SESSION_STALE_MAX_AGE_MS = "3600000";
process.env.INTEGRATION_SERVICE_SECRET ??= "account-session-test-secret-1234";
process.env.CRM_API_URL ??= "http://127.0.0.1:9";

const teacher = {
  id: "11111111-1111-4111-8111-111111111111",
  sessionVersion: 1,
  crmTeacherId: "crm-teacher-1",
  externalLinkStatus: "linked",
  role: { slug: "teacher" },
};

test("teacher session checks reuse the CRM answer and survive a CRM outage", async t => {
  const { linkedCrmSession, invalidateCrmSessionCache } = await import("./account-session.service.js");
  invalidateCrmSessionCache();
  let calls = 0;
  let mode: "ok" | "down" | "revoked" = "ok";
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    if (mode === "down") throw new Error("CRM offline");
    if (mode === "revoked") {
      return new Response(JSON.stringify({ success: false, error: "disabled" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ success: true, data: { crmUserId: teacher.crmTeacherId, appUserId: teacher.id, role: "teacher", sessionVersion: 0 } }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  assert.equal((await linkedCrmSession(teacher))?.sessionVersion, 0);
  assert.equal((await linkedCrmSession(teacher))?.sessionVersion, 0);
  assert.equal(calls, 1, "the second check inside the window does not call CRM");

  mode = "down";
  assert.equal((await linkedCrmSession(teacher, { fresh: true }))?.sessionVersion, 0, "an outage serves the verified state");

  mode = "revoked";
  await assert.rejects(linkedCrmSession(teacher, { fresh: true }), (error: { statusCode?: number }) => error.statusCode === 401);

  mode = "down";
  await assert.rejects(linkedCrmSession(teacher, { fresh: true }), (error: { statusCode?: number }) => error.statusCode === 502,
    "after a revocation there is no verified state to fall back to");
});
