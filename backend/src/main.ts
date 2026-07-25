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
import { startOfflineReportReminderJob } from "./application/services/offline-report-reminder.service.js";
import { startLessonReminderJob } from "./application/services/lesson-reminder.service.js";

async function bootstrap() {
  const app = Fastify({
    logger: true,
    // Base64 JSON uploads: allow ~20 MB files (+ overhead)
    bodyLimit: 28 * 1024 * 1024,
  });

  app.setErrorHandler(errorHandler);
  app.addHook("onRequest", async (_request, reply) => {
    reply.headers({
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    });
  });

  const corsOrigins = env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
  await app.register(cors, {
    origin: corsOrigins.length > 1 ? corsOrigins : corsOrigins[0],
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
  startOfflineReportReminderJob();
  startLessonReminderJob();
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
