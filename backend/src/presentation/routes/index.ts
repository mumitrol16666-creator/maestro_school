import type { FastifyInstance } from "fastify";
import { authRoutes } from "./auth.routes.js";
import { catalogRoutes } from "./catalog.routes.js";
import { progressRoutes } from "./progress.routes.js";
import { newsRoutes } from "./news.routes.js";
import { homeworkRoutes } from "./homework.routes.js";
import { homeworkReviewRoutes } from "./homework-review.routes.js";
import { learningRoutes } from "./learning.routes.js";
import { cmsRoutes } from "./cms.routes.js";
import { mediaRoutes } from "./media.routes.js";

export async function registerRoutes(app: FastifyInstance) {
  await app.register(async (api) => {
    await api.register(authRoutes);
    await api.register(catalogRoutes);
    await api.register(progressRoutes);
    await api.register(learningRoutes);
    await api.register(newsRoutes);
    await api.register(homeworkRoutes);
    await api.register(homeworkReviewRoutes);
    await api.register(cmsRoutes);
    await api.register(mediaRoutes);
  }, { prefix: "/api/v1" });
}
