import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { prisma } from "../../infrastructure/database/prisma.js";
import { adminOfflineRoutes } from "./admin-offline.routes.js";

test("Platform HTTP approval is disabled for admins and remains forbidden for teachers", async t => {
  const app = Fastify();
  await app.register(jwt, { secret: "local-crm-only-route-test" });
  let role = "admin";
  const findFirst = prisma.user.findFirst;
  prisma.user.findFirst = (async () => ({
    id: "fixture-user", email: null,
    role: { slug: role, rolePermissions: [{ permission: { code: "offline_school.write" } }] },
  })) as typeof findFirst;
  t.after(() => { prisma.user.findFirst = findFirst; });
  let networkCalls = 0;
  t.mock.method(globalThis, "fetch", async () => { networkCalls++; throw new Error("No business request allowed"); });
  app.setErrorHandler((error, _request, reply) => reply.code(error.statusCode ?? 500).send({ code: (error as { code?: string }).code }));
  await app.register(adminOfflineRoutes);
  t.after(() => app.close());
  const headers = { authorization: `Bearer ${app.jwt.sign({ sub: "fixture-user" })}` };
  for (const payload of [{}, { deduct: false }, { billingDecisions: [{ studentId: "pupil", amount: 4000 }] }]) {
    const response = await app.inject({ method: "POST", url: "/admin/offline-lessons/fixture/approve", headers, payload });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json().code, "CRM_APPROVAL_REQUIRED");
  }
  role = "teacher";
  assert.equal((await app.inject({ method: "POST", url: "/admin/offline-lessons/fixture/approve", headers, payload: {} })).statusCode, 403);
  assert.equal(networkCalls, 0);
});
