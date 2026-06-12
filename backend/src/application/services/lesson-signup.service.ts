import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, NotFoundError } from "../../domain/errors.js";
import { getLessonById } from "../repositories/catalog.repository.js";
import { enrollStudentInCourse, getStudentEnrollment, requireCourseEnrollment } from "./enrollment.service.js";
import { syncLessonAvailability } from "./lesson-unlock.service.js";

export async function signupFromLesson(params: { lessonId: string; studentId: string }) {
  const lesson = await getLessonById(params.lessonId);
  if (!lesson) throw new NotFoundError("Lesson");

  const courseId = lesson.module.courseId;
  await requireCourseEnrollment(params.studentId, courseId);
  await syncLessonAvailability(params.studentId, courseId);

  const progress = await prisma.lessonProgress.findUnique({
    where: { studentId_lessonId: { studentId: params.studentId, lessonId: params.lessonId } },
    select: { status: true },
  });
  if (!progress || progress.status === "locked" || progress.status === "available") {
    throw new BadRequestError("Сначала начните урок");
  }

  if (!lesson.enableLessonSignup) {
    throw new BadRequestError("Запись с этого урока отключена");
  }

  if (lesson.signupCourseId) {
    const targetCourse = await prisma.course.findFirst({
      where: { id: lesson.signupCourseId, isPublished: true, deletedAt: null },
      select: { id: true, title: true },
    });
    if (!targetCourse) throw new BadRequestError("Курс для записи не найден или не опубликован");

    const existing = await getStudentEnrollment(params.studentId, targetCourse.id);
    if (existing) {
      return {
        mode: "course" as const,
        alreadyEnrolled: true,
        courseId: targetCourse.id,
        courseTitle: targetCourse.title,
        enrollment: existing,
      };
    }

    const enrollment = await enrollStudentInCourse(params.studentId, targetCourse.id);
    return {
      mode: "course" as const,
      alreadyEnrolled: false,
      courseId: targetCourse.id,
      courseTitle: targetCourse.title,
      enrollment,
    };
  }

  if (lesson.signupExternalUrl) {
    return {
      mode: "external" as const,
      url: lesson.signupExternalUrl,
      label: lesson.signupLabel ?? "Записаться на урок",
    };
  }

  throw new BadRequestError("Запись на урок не настроена");
}

export function buildLessonEndActions(
  lesson: {
    enableAskTeacher: boolean;
    enableLessonSignup: boolean;
    signupCourseId: string | null;
    signupExternalUrl: string | null;
    signupLabel: string | null;
    signupCourse?: { id: string; title: string } | null;
  },
  enrollmentCourseIds: Set<string>,
) {
  const askTeacher = lesson.enableAskTeacher ? { enabled: true } : null;

  let signup: {
    enabled: true;
    label: string;
    mode: "course" | "external";
    courseId?: string;
    courseTitle?: string;
    alreadyEnrolled?: boolean;
    externalUrl?: string;
  } | null = null;

  if (lesson.enableLessonSignup) {
    const label = lesson.signupLabel?.trim() || "Записаться на урок";
    if (lesson.signupCourseId && lesson.signupCourse) {
      signup = {
        enabled: true,
        label,
        mode: "course",
        courseId: lesson.signupCourse.id,
        courseTitle: lesson.signupCourse.title,
        alreadyEnrolled: enrollmentCourseIds.has(lesson.signupCourse.id),
      };
    } else if (lesson.signupExternalUrl) {
      signup = {
        enabled: true,
        label,
        mode: "external",
        externalUrl: lesson.signupExternalUrl,
      };
    }
  }

  return {
    askTeacher,
    signup,
    hasActions: Boolean(askTeacher || signup),
  };
}
