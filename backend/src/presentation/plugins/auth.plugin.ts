import type { FastifyInstance } from "fastify";
import { authenticate, requirePermission } from "../guards/auth.guards.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: typeof authenticate;
    requirePermission: typeof requirePermission;
  }
}

/** Registers auth decorators on root instance (optional — routes use guards directly). */
export async function authPlugin(app: FastifyInstance) {
  app.decorate("authenticate", authenticate);
  app.decorate("requirePermission", requirePermission);
}
