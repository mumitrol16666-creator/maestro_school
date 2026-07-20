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
import { pushRoutes } from "./push.routes.js";
import { lessonQuestionsRoutes } from "./lesson-questions.routes.js";
import { onlineLessonsRoutes } from "./online-lessons.routes.js";
import { notificationsRoutes } from "./notifications.routes.js";
import { studentsAdminRoutes } from "./students-admin.routes.js";
import { usersAdminRoutes } from "./users-admin.routes.js";
import { schoolOfflineRoutes } from "./school-offline.routes.js";
import { teacherOfflineRoutes } from "./teacher-offline.routes.js";
import { adminOfflineRoutes } from "./admin-offline.routes.js";
import { publicTrialRoutes } from "./public-trial.routes.js";
import { messagesRoutes } from "./messages.routes.js";

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
    await api.register(pushRoutes);
    await api.register(lessonQuestionsRoutes);
    await api.register(onlineLessonsRoutes);
    await api.register(notificationsRoutes);
    await api.register(messagesRoutes);
    await api.register(studentsAdminRoutes);
    await api.register(usersAdminRoutes);
    await api.register(schoolOfflineRoutes);
    await api.register(teacherOfflineRoutes);
    await api.register(adminOfflineRoutes);
    await api.register(publicTrialRoutes);
  }, { prefix: "/api/v1" });
}
