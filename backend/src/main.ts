import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env.js";
import { prisma } from "./infrastructure/database/prisma.js";
import { errorHandler } from "./presentation/middleware/error-handler.js";
import { authPlugin } from "./presentation/plugins/auth.plugin.js";
import { registerRoutes } from "./presentation/routes/index.js";
import { integrationRoutes } from "./presentation/routes/integration.routes.js";

async function bootstrap() {
  const app = Fastify({
    logger: true,
    // Base64 JSON uploads: allow ~20 MB files (+ overhead)
    bodyLimit: 28 * 1024 * 1024,
  });

  app.setErrorHandler(errorHandler);

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  await app.register(rateLimit, { global: false });
  await app.register(authPlugin);

  app.get("/health", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ok", service: "maestro-api", database: "ok" };
    } catch {
      return reply.status(503).send({
        status: "error",
        service: "maestro-api",
        database: "unavailable",
      });
    }
  });

  await registerRoutes(app);
  await app.register(integrationRoutes, { prefix: "/api/integration/v1" });

  await app.listen({ port: env.PORT, host: env.HOST });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
