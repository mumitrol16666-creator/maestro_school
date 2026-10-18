import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../domain/errors.js";
import { createCrmReadCache } from "./crm-cache.js";

test("a value is served from cache inside the window and refetched after it", async () => {
  const cache = createCrmReadCache<number>({ maxAgeMs: 1000, staleMaxAgeMs: 10_000 });
  let calls = 0;
  const loader = async () => { calls += 1; return calls; };

  assert.equal((await cache.read("k", loader, { now: 0 })).value, 1);
  assert.equal((await cache.read("k", loader, { now: 500 })).value, 1);
  assert.equal(calls, 1);
  const refreshed = await cache.read("k", loader, { now: 1500 });
  assert.equal(refreshed.value, 2);
  assert.equal(refreshed.stale, false);
  assert.equal((await cache.read("k", loader, { now: 1600, fresh: true })).value, 3);
});

test("a transport failure serves the last good value as stale inside the stale window", async () => {
  const cache = createCrmReadCache<string>({ maxAgeMs: 1000, staleMaxAgeMs: 5000 });
  let down = false;
  const loader = async () => {
    if (down) throw new AppError(502, "Не удалось связаться с CRM.", "CRM_UNAVAILABLE");
    return "ok";
  };
  await cache.read("k", loader, { now: 0 });
  down = true;
  const stale = await cache.read("k", loader, { now: 3000 });
  assert.equal(stale.value, "ok");
  assert.equal(stale.stale, true);
  assert.equal(stale.fetchedAt.getTime(), 0);
  await assert.rejects(cache.read("k", loader, { now: 6000 }), (error: AppError) => error.code === "CRM_UNAVAILABLE");
});

test("a CRM answer that is not a transport failure drops the cached value", async () => {
  const cache = createCrmReadCache<string>({ maxAgeMs: 1000, staleMaxAgeMs: 5000 });
  let revoked = false;
  const loader = async () => {
    if (revoked) throw new AppError(401, "disabled", "CRM_SESSION_REVOKED");
    return "ok";
  };
  await cache.read("k", loader, { now: 0 });
  revoked = true;
  await assert.rejects(cache.read("k", loader, { now: 1500 }));
  assert.equal(cache.size(), 0);
  revoked = false;
  assert.equal((await cache.read("k", loader, { now: 1600 })).value, "ok");
  cache.invalidate("k");
  assert.equal(cache.size(), 0);
});
