import assert from "node:assert/strict";
import test from "node:test";
import { isCorsOriginAllowed, isQaLanOrigin } from "./cors-origin.js";

test("QA LAN origins accept private addresses and the Mac local hostname", () => {
  assert.equal(isQaLanOrigin("http://192.168.1.100:3321"), true);
  assert.equal(isQaLanOrigin("http://10.0.0.25:3321"), true);
  assert.equal(isQaLanOrigin("http://172.20.10.2:3321"), true);
  assert.equal(isQaLanOrigin("http://macbook-air-vladislav.local:3321"), true);
});

test("QA LAN origins reject public hosts, other ports and HTTPS", () => {
  assert.equal(isQaLanOrigin("http://8.8.8.8:3321"), false);
  assert.equal(isQaLanOrigin("http://192.168.1.100:4001"), false);
  assert.equal(isQaLanOrigin("https://192.168.1.100:3321"), false);
  assert.equal(isQaLanOrigin("invalid"), false);
});

test("dynamic LAN access is enabled only in the explicit QA-local mode", () => {
  const configured = new Set(["https://app.maestro.example"]);
  assert.equal(isCorsOriginAllowed("https://app.maestro.example", configured, false), true);
  assert.equal(isCorsOriginAllowed("http://192.168.1.100:3321", configured, false), false);
  assert.equal(isCorsOriginAllowed("http://192.168.1.100:3321", configured, true), true);
  assert.equal(isCorsOriginAllowed(undefined, configured, false), true);
});
