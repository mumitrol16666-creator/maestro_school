import { calculateProgressPercent } from "../../domain/lesson-unlock.logic.js";
import { isLessonCompleted } from "../../domain/lesson-progress.state-machine.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import {
  countCompletedLessons,
  countTotalPublishedLessons,
  getCourseModules,
  getModuleLessons,
  updateStudentCourseStatus,
} from "../repositories/learning.repository.js";

/** completedLessons / totalLessons * 100 */
export async function calculateCourseProgressPercent(
  studentId: string,
  courseId: string,
): Promise<number> {
  const [completed, total] = await Promise.all([
    countCompletedLessons(studentId, courseId),
    countTotalPublishedLessons(courseId),
  ]);

  return calculateProgressPercent(completed, total);
}

export async function isModuleCompleted(studentId: string, moduleId: string): Promise<boolean> {
  const lessons = await getModuleLessons(moduleId);
  if (lessons.length === 0) return false;

  const rows = await prisma.lessonProgress.findMany({
    where: {
      studentId,
      lessonId: { in: lessons.map((l) => l.id) },
    },
    select: { status: true },
  });

  if (rows.length < lessons.length) return false;
  return rows.every((r) => isLessonCompleted(r.status));
}

export async function isCourseCompleted(studentId: string, courseId: string): Promise<boolean> {
  const modules = await getCourseModules(courseId);
  for (const mod of modules) {
    const completed = await isModuleCompleted(studentId, mod.id);
    if (!completed) return false;
  }
  return modules.length > 0;
}

/** Updates StudentCourse.status to completed when all modules are done. */
export async function syncCourseCompletionStatus(
  studentId: string,
  courseId: string,
): Promise<boolean> {
  const completed = await isCourseCompleted(studentId, courseId);
  if (completed) {
    await updateStudentCourseStatus(studentId, courseId, "completed");
  }
  return completed;
}
