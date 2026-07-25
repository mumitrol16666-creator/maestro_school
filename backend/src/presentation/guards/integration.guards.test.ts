import assert from "node:assert/strict";
import test from "node:test";
import { integrationSecretMatches } from "./integration.guards.js";

test("служебный токен приложения сравнивается безопасно", () => {
  assert.equal(integrationSecretMatches("same-secret", "same-secret"), true);
  assert.equal(integrationSecretMatches("same-secret", "other-secret"), false);
  assert.equal(integrationSecretMatches("short", "longer-secret"), false);
});
