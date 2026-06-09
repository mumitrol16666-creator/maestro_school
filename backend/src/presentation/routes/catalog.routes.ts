import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  listPublishedDirections,
  listPublishedCourses,
  getCourseById,
  getLessonById,
} from "../../application/repositories/catalog.repository.js";
import { NotFoundError } from "../../domain/errors.js";
import { calculateCourseProgressPercent } from "../../application/services/course-progress.service.js";
import { optionalAuthenticate } from "../guards/auth.guards.js";

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
    const studentId = request.user?.id;

    const data = await Promise.all(
      courses.map(async (course) => {
        const progress = studentId
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
        };
      }),
    );

    return { data };
  });

  app.get("/courses/:courseId", { preHandler: [optionalAuthenticate] }, async (request) => {
    const { courseId } = z.object({ courseId: z.string().uuid() }).parse(request.params);
    const course = await getCourseById(courseId);
    if (!course) throw new NotFoundError("Course");

    const studentId = request.user?.id;
    const progress = studentId
      ? await calculateCourseProgressPercent(studentId, course.id)
      : 0;

    return {
      data: {
        ...course,
        progress,
      },
    };
  });

  app.get("/lessons/:lessonId", async (request) => {
    const { lessonId } = z.object({ lessonId: z.string().uuid() }).parse(request.params);
    const lesson = await getLessonById(lessonId);
    if (!lesson) throw new NotFoundError("Lesson");

    return {
      data: {
        id: lesson.id,
        moduleId: lesson.moduleId,
        courseId: lesson.module.courseId,
        title: lesson.title,
        description: lesson.description,
        videoUrl: lesson.videoUrl,
        sortOrder: lesson.sortOrder,
        pointsReward: lesson.pointsReward,
        materials: lesson.materials,
        homework: lesson.homeworks[0] ?? null,
        course: lesson.module.course,
      },
    };
  });
}
