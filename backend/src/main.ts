import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { env } from "./config/env.js";
import { errorHandler } from "./presentation/middleware/error-handler.js";
import { authPlugin } from "./presentation/plugins/auth.plugin.js";
import { registerRoutes } from "./presentation/routes/index.js";

async function bootstrap() {
  const app = Fastify({
    logger: true,
  });

  app.setErrorHandler(errorHandler);

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  await app.register(authPlugin);

  app.get("/health", async () => ({ status: "ok", service: "maestro-api" }));

  await registerRoutes(app);

  await app.listen({ port: env.PORT, host: env.HOST });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
