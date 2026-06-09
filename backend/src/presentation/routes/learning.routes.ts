import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { startLesson } from "../../application/services/lesson-progress.service.js";
import { getStudentDashboard } from "../../application/services/student-dashboard.service.js";
import { writeAuditLog } from "../../application/services/audit.service.js";
import { authenticate, requirePermission } from "../guards/auth.guards.js";

export async function learningRoutes(app: FastifyInstance) {
  app.post(
    "/lessons/:lessonId/start",
    { preHandler: [authenticate, requirePermission("progress.write")] },
    async (request) => {
      const { lessonId } = z.object({ lessonId: z.string().uuid() }).parse(request.params);
      const studentId = request.user!.id;

      const result = await startLesson(studentId, lessonId);

      await writeAuditLog({
        entityType: "lesson_progress",
        entityId: lessonId,
        action: "update",
        actorId: studentId,
        payload: { status: result.status, courseId: result.courseId },
      });

      return { data: result };
    },
  );

  app.get(
    "/students/me/dashboard",
    { preHandler: [authenticate, requirePermission("progress.read")] },
    async (request) => {
      const studentId = request.user!.id;
      const dashboard = await getStudentDashboard(studentId);
      return { data: dashboard };
    },
  );
}
