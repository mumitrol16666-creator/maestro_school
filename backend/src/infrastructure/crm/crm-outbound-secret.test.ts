import test from "node:test";
import assert from "node:assert/strict";

Object.assign(process.env, {
  NODE_ENV: "test", DATABASE_URL: "postgresql://test@127.0.0.1:9/test",
  JWT_SECRET: "local-crm-contract-test", CRM_API_URL: "http://127.0.0.1:9",
});
const { crmOutboundSecret, integrationHeaders } = await import("./crm-client.js");

test("requests to CRM are signed with CRM_OUTBOUND_SECRET when it is set", () => {
  process.env.INTEGRATION_SERVICE_SECRET = "shared-secret-for-incoming-crm";
  process.env.CRM_OUTBOUND_SECRET = "outbound-secret-platform-to-crm";
  assert.equal(crmOutboundSecret(), "outbound-secret-platform-to-crm");
  assert.equal(integrationHeaders().Authorization, "Bearer outbound-secret-platform-to-crm");
});

test("without CRM_OUTBOUND_SECRET (or with an empty one) the shared INTEGRATION_SERVICE_SECRET signs", () => {
  process.env.INTEGRATION_SERVICE_SECRET = "shared-secret-for-incoming-crm";
  for (const empty of [undefined, ""]) {
    if (empty === undefined) delete process.env.CRM_OUTBOUND_SECRET; else process.env.CRM_OUTBOUND_SECRET = empty;
    assert.equal(crmOutboundSecret(), "shared-secret-for-incoming-crm");
    assert.equal(integrationHeaders().Authorization, "Bearer shared-secret-for-incoming-crm");
    assert.equal(integrationHeaders()["X-Integration-System"], "learning-platform");
  }
});

test("with neither secret the client refuses to build headers", () => {
  delete process.env.CRM_OUTBOUND_SECRET;
  delete process.env.INTEGRATION_SERVICE_SECRET;
  assert.equal(crmOutboundSecret(), undefined);
  assert.throws(() => integrationHeaders(), /not configured/);
});
