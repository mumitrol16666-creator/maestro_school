import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getStudentProgress,
  getStudentEnrollments,
} from "../../application/repositories/progress.repository.js";
import { calculateStudentPoints, getStudentPointsHistory } from "../../application/services/points.service.js";
import { calculateCourseProgressPercent } from "../../application/services/course-progress.service.js";
import { syncLessonAvailability } from "../../application/services/lesson-unlock.service.js";
import { ensureStudentEnrolled } from "../../application/services/enrollment.service.js";
import { authenticate, requirePermission } from "../guards/auth.guards.js";

export async function progressRoutes(app: FastifyInstance) {
  app.get(
    "/students/me/progress",
    { preHandler: [authenticate, requirePermission("progress.read")] },
    async (request) => {
      const query = z.object({ courseId: z.string().uuid().optional() }).parse(request.query);
      const studentId = request.user!.id;

      if (query.courseId) {
        await ensureStudentEnrolled(studentId, query.courseId);
      }

      const enrollments = await getStudentEnrollments(studentId);

      if (query.courseId) {
        await syncLessonAvailability(studentId, query.courseId);
      } else {
        for (const e of enrollments) {
          await syncLessonAvailability(studentId, e.courseId);
        }
      }

      const [progress, points, history] = await Promise.all([
        getStudentProgress(studentId, query.courseId),
        calculateStudentPoints(studentId),
        getStudentPointsHistory(studentId, 20),
      ]);

      let courseProgressPercent: number | undefined;
      if (query.courseId) {
        courseProgressPercent = await calculateCourseProgressPercent(studentId, query.courseId);
      }

      return {
        data: {
          points,
          courseProgressPercent,
          enrollments,
          lessons: progress.map((p) => ({
            lessonId: p.lessonId,
            status: p.status,
            completedAt: p.completedAt,
            lesson: p.lesson,
          })),
          pointsHistory: history,
        },
      };
    },
  );
}
