import test from "node:test";
import assert from "node:assert/strict";

Object.assign(process.env, {
  NODE_ENV: "test", DATABASE_URL: "postgresql://test@127.0.0.1:9/test",
  JWT_SECRET: "local-crm-contract-test", INTEGRATION_SERVICE_SECRET: "local-integration-test-secret",
  CRM_API_URL: "http://127.0.0.1:9",
});
const { postAdminApproveClass } = await import("./crm-client.js");

test("Platform cannot send new or persisted lesson approvals to CRM", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls += 1; throw new Error("No network request is allowed"); });
  for (const payload of [{ topic: "Аккорды" }, { topic: "Аккорды", deduct: true }, { topic: "Аккорды", deduct: false }]) {
    const original = structuredClone(payload);
    await assert.rejects(() => postAdminApproveClass("lesson", payload, "old-queued-key"), (error: unknown) => {
      assert.equal((error as { statusCode: number }).statusCode, 409);
      assert.equal((error as { code: string }).code, "CRM_APPROVAL_REQUIRED");
      return true;
    });
    assert.deepEqual(payload, original);
  }
  assert.equal(calls, 0);
});
