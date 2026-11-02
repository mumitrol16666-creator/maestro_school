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
import { buildOpenLessonView } from "./student-lesson-view.js";
import {
  courseAccessDto,
  getCourseAccessStates,
  getLessonAccess,
} from "../../application/services/course-access.service.js";
import { canOpenLesson } from "../../domain/course-access.js";
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

    const accessStates = await getCourseAccessStates(request.user?.id, courses);

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
          completionCoinsReward: course.completionCoinsReward,
          isPublished: course.isPublished,
          direction: course.direction,
          modulesCount: course.modules.length,
          lessonsCount,
          progress,
          enrollmentStatus,
          priceKzt: course.priceKzt,
          includedInSchool: course.includedInSchool,
          freeLessonsCount: course.freeLessonsCount,
          access: courseAccessDto(accessStates.get(course.id)!),
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

    const accessState = (await getCourseAccessStates(request.user?.id, [course])).get(course.id)!;
    const orderedLessonIds = course.modules.flatMap((module) => module.lessons.map((lesson) => lesson.id));
    const access = { kind: accessState.kind, expiresAt: accessState.expiresAt };

    return {
      data: {
        ...course,
        // A lesson that stays closed until the course is paid for: the list can show a lock.
        modules: course.modules.map((module) => ({
          ...module,
          lessons: module.lessons.map((lesson) => ({
            ...lesson,
            locked: !canOpenLesson({
              course,
              access,
              preview: accessState.preview,
              orderedLessonIds,
              lessonId: lesson.id,
            }),
          })),
        })),
        progress,
        enrollmentStatus: enrollment?.status ?? null,
        access: courseAccessDto(accessState),
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
      const lessonAccess = await getLessonAccess(studentId, lessonId);

      // The order comes first: a lesson that is not yet reached stays «пока закрыт» whether it is
      // paid or not. Only a lesson that is open by order can meet the paywall.
      await requireCourseEnrollment(studentId, courseId);
      await syncLessonAvailability(studentId, courseId);
      const progress = await getLessonProgressRecord(studentId, lessonId);
      if (!progress || progress.status === "locked") {
        throw new ForbiddenError("Урок пока закрыт");
      }

      // A paid lesson without access answers with the paywall data and no content at all.
      if (!lessonAccess.open) {
        return {
          data: {
            id: lesson.id,
            moduleId: lesson.moduleId,
            courseId,
            title: lesson.title,
            description: lesson.description,
            videoUrl: null,
            sortOrder: lesson.sortOrder,
            pointsReward: lesson.pointsReward,
            materials: [],
            homework: null,
            endActions: { askTeacher: null, signup: null, hasActions: false },
            course: lesson.module.course,
            access: {
              kind: "locked" as const,
              reason: "payment_required" as const,
              courseId,
              priceKzt: lessonAccess.state.priceKzt,
              includedInSchool: lessonAccess.state.includedInSchool,
              freeLessonsCount: lessonAccess.state.freeLessonsCount,
              pendingPaymentRequest: lessonAccess.state.pendingPaymentRequest,
            },
          },
        };
      }

      const signupCourseIds = lesson.signupCourseId ? [lesson.signupCourseId] : [];
      const enrollmentMap = await getStudentEnrollmentMap(studentId, signupCourseIds);
      return {
        data: await buildOpenLessonView({
          lesson,
          request,
          contentOpen: progress.status !== "available",
          enrolledCourseIds: new Set(enrollmentMap.keys()),
          source: !lessonAccess.state.forSale
            ? "free_course"
            : lessonAccess.state.kind !== "none"
              ? lessonAccess.state.kind
              : "free_lesson",
          expiresAt: lessonAccess.state.expiresAt,
        }),
      };
    },
  );
}
