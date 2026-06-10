import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  listPublishedDirections,
  listPublishedCourses,
  getCourseById,
  getLessonById,
} from "../../application/repositories/catalog.repository.js";
import { ForbiddenError, NotFoundError } from "../../domain/errors.js";
import { calculateCourseProgressPercent } from "../../application/services/course-progress.service.js";
import {
  enrollStudentInCourse,
  getStudentEnrollment,
  getStudentEnrollmentMap,
  requireCourseEnrollment,
} from "../../application/services/enrollment.service.js";
import { getLessonProgressRecord } from "../../application/repositories/learning.repository.js";
import { syncLessonAvailability } from "../../application/services/lesson-unlock.service.js";
import { publicHomeworkTestQuestions } from "../../domain/homework-test.js";
import {
  authenticate,
  optionalAuthenticate,
  requirePermission,
  requireStudent,
} from "../guards/auth.guards.js";

export async function catalogRoutes(app: FastifyInstance) {
  app.get("/directions", async () => {
    const directions = await listPublishedDirections();
    return { data: directions };
  });

  app.get("/courses", { preHandler: [optionalAuthenticate] }, async (request) => {
    const query = z.object({
      directionId: z.string().uuid().optional(),
      directionSlug: z.string().optional(),
    }).parse(request.query);

    const courses = await listPublishedCourses(query);
    const studentId = request.user?.roleSlug === "student" ? request.user.id : undefined;
    const enrollmentMap = studentId
      ? await getStudentEnrollmentMap(studentId, courses.map((course) => course.id))
      : new Map<string, string>();

    const data = await Promise.all(
      courses.map(async (course) => {
        const enrollmentStatus = enrollmentMap.get(course.id) ?? null;
        const progress = studentId && enrollmentStatus
          ? await calculateCourseProgressPercent(studentId, course.id)
          : 0;
        const lessonsCount = course.modules.reduce((sum, m) => sum + m._count.lessons, 0);
        return {
          id: course.id,
          directionId: course.directionId,
          title: course.title,
          description: course.description,
          thumbnail: course.thumbnail,
          difficultyLevel: course.difficultyLevel,
          isPublished: course.isPublished,
          direction: course.direction,
          modulesCount: course.modules.length,
          lessonsCount,
          progress,
          enrollmentStatus,
        };
      }),
    );

    return { data };
  });

  app.get("/courses/:courseId", { preHandler: [optionalAuthenticate] }, async (request) => {
    const { courseId } = z.object({ courseId: z.string().uuid() }).parse(request.params);
    const course = await getCourseById(courseId);
    if (!course) throw new NotFoundError("Course");

    const studentId = request.user?.roleSlug === "student" ? request.user.id : undefined;
    const enrollment = studentId ? await getStudentEnrollment(studentId, course.id) : null;
    const progress = studentId && enrollment
      ? await calculateCourseProgressPercent(studentId, course.id)
      : 0;

    return {
      data: {
        ...course,
        progress,
        enrollmentStatus: enrollment?.status ?? null,
      },
    };
  });

  app.post(
    "/courses/:courseId/enroll",
    { preHandler: [authenticate, requireStudent, requirePermission("courses.read")] },
    async (request) => {
      const { courseId } = z.object({ courseId: z.string().uuid() }).parse(request.params);
      const enrollment = await enrollStudentInCourse(request.user!.id, courseId);
      return {
        data: {
          id: enrollment.id,
          courseId: enrollment.courseId,
          status: enrollment.status,
          enrolledAt: enrollment.enrolledAt,
        },
      };
    },
  );

  app.get(
    "/lessons/:lessonId",
    { preHandler: [authenticate, requireStudent, requirePermission("lessons.read")] },
    async (request) => {
      const { lessonId } = z.object({ lessonId: z.string().uuid() }).parse(request.params);
      const lesson = await getLessonById(lessonId);
      if (!lesson) throw new NotFoundError("Lesson");

      const studentId = request.user!.id;
      const courseId = lesson.module.courseId;
      await requireCourseEnrollment(studentId, courseId);
      await syncLessonAvailability(studentId, courseId);
      const progress = await getLessonProgressRecord(studentId, lessonId);
      if (!progress || progress.status === "locked") {
        throw new ForbiddenError("Урок пока закрыт");
      }
      const contentOpen = progress.status !== "available";

      return {
        data: {
          id: lesson.id,
          moduleId: lesson.moduleId,
          courseId: lesson.module.courseId,
          title: lesson.title,
          description: lesson.description,
          videoUrl: contentOpen ? lesson.videoUrl : null,
          sortOrder: lesson.sortOrder,
          pointsReward: lesson.pointsReward,
          materials: contentOpen ? lesson.materials : [],
          homework: contentOpen && lesson.homeworks[0]
            ? {
                id: lesson.homeworks[0].id,
                description: lesson.homeworks[0].description,
                type: lesson.homeworks[0].type,
                passingScore: lesson.homeworks[0].passingScore,
                testQuestions: lesson.homeworks[0].type === "test"
                  ? publicHomeworkTestQuestions(lesson.homeworks[0].testQuestions)
                  : null,
              }
            : null,
          course: lesson.module.course,
        },
      };
    },
  );
}
