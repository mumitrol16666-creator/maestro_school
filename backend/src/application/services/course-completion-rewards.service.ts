import { prisma } from "../../infrastructure/database/prisma.js";
import { rewardEconomyV2AppliesToEvent } from "../../config/product-features.js";
import {
  COURSE_COMPLETION_POINTS,
  COURSE_MODULE_COMPLETION_POINTS,
} from "../../domain/product-economy-v2.js";
import { isModuleCompleted } from "./course-progress.service.js";
import { awardSystemPoints } from "./points.service.js";

/**
 * Stage 4: Points for finishing a module and a whole course of the app, one time each, for anyone
 * who studies it — a school student and a person from outside alike. They exist in the new economy
 * only. Maestro Coins for a finished course no longer exist.
 * A refund of the course payment does not take these back.
 */

export const courseModuleCompletionSourceKey = (moduleId: string, studentId: string) =>
  `course-module-completion:${moduleId}:${studentId}`;

export const courseCompletionSourceKey = (courseId: string, studentId: string) =>
  `course-completion:${courseId}:${studentId}`;

async function awardOnce(params: {
  studentId: string;
  amount: number;
  reason: string;
  sourceKey: string;
  eventAt: Date;
}) {
  // A module or a course renamed since the first award must not turn a repeat into a conflict.
  const existing = await prisma.pointsTransaction.findUnique({
    where: { sourceKey: params.sourceKey },
    select: { id: true },
  });
  if (existing) return { awarded: false, transactionId: existing.id };
  return awardSystemPoints(params);
}

/**
 * Called after a lesson is completed. Idempotent: calling it again for the same lesson, module or
 * course awards nothing new.
 */
export async function awardCourseProgressPoints(params: {
  studentId: string;
  lessonId: string;
  courseId: string;
  /** The course is finished now (every published lesson completed). */
  courseCompleted: boolean;
  eventAt: Date;
}) {
  const result = { module: false, course: false };
  if (!rewardEconomyV2AppliesToEvent(params.eventAt)) return result;

  const lesson = await prisma.lesson.findUnique({
    where: { id: params.lessonId },
    select: { moduleId: true, module: { select: { title: true } } },
  });
  if (lesson && await isModuleCompleted(params.studentId, lesson.moduleId)) {
    const award = await awardOnce({
      studentId: params.studentId,
      amount: COURSE_MODULE_COMPLETION_POINTS,
      reason: `Пройден модуль «${lesson.module.title}»`,
      sourceKey: courseModuleCompletionSourceKey(lesson.moduleId, params.studentId),
      eventAt: params.eventAt,
    });
    result.module = award.awarded;
  }

  if (params.courseCompleted) {
    const course = await prisma.course.findUnique({
      where: { id: params.courseId },
      select: { title: true },
    });
    if (course) {
      const award = await awardOnce({
        studentId: params.studentId,
        amount: COURSE_COMPLETION_POINTS,
        reason: `Пройден курс «${course.title}»`,
        sourceKey: courseCompletionSourceKey(params.courseId, params.studentId),
        eventAt: params.eventAt,
      });
      result.course = award.awarded;
    }
  }
  return result;
}
