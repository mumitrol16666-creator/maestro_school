import type { FastifyRequest } from "fastify";
import { UnauthorizedError, BadRequestError } from "../../domain/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    integrationSystem?: "crm" | "learning-platform";
  }
}

export async function requireIntegrationAuth(request: FastifyRequest): Promise<void> {
  const secret = process.env.INTEGRATION_SERVICE_SECRET;
  if (!secret) {
    throw new BadRequestError("Integration API is not configured");
  }

  const authHeader = request.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token || token !== secret) {
    throw new UnauthorizedError("Invalid integration credentials");
  }

  const system = request.headers["x-integration-system"];
  if (!system || (system !== "crm" && system !== "learning-platform")) {
    throw new BadRequestError("X-Integration-System header must be crm or learning-platform");
  }

  request.integrationSystem = system;
}
