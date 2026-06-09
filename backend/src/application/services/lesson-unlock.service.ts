import { resolveLessonAvailability, findNextLessonId } from "../../domain/lesson-unlock.logic.js";
import {
  getOrderedPublishedLessons,
  getProgressMapForCourse,
  upsertLessonProgress,
} from "../repositories/learning.repository.js";

/**
 * Initializes or synchronizes lesson availability for a course.
 * Rule: lesson #1 is AVAILABLE; each next opens when previous is COMPLETED.
 */
export async function syncLessonAvailability(studentId: string, courseId: string): Promise<void> {
  const [orderedLessons, progressMap] = await Promise.all([
    getOrderedPublishedLessons(courseId),
    getProgressMapForCourse(studentId, courseId),
  ]);

  for (let i = 0; i < orderedLessons.length; i++) {
    const lesson = orderedLessons[i];
    const targetStatus = resolveLessonAvailability(lesson.id, i, orderedLessons, progressMap);
    const existing = progressMap.get(lesson.id);

    if (!existing) {
      await upsertLessonProgress(studentId, lesson.id, { status: targetStatus });
      progressMap.set(lesson.id, { status: targetStatus });
      continue;
    }

    if (existing.status === "locked" && targetStatus === "available") {
      await upsertLessonProgress(studentId, lesson.id, { status: "available" });
      progressMap.set(lesson.id, { status: "available" });
    }
  }
}

/** After a lesson is completed, unlock the immediate next lesson if it exists. */
export async function unlockNextLesson(
  studentId: string,
  courseId: string,
  completedLessonId: string,
): Promise<string | null> {
  const orderedLessons = await getOrderedPublishedLessons(courseId);
  const nextId = findNextLessonId(completedLessonId, orderedLessons);
  if (!nextId) return null;

  await upsertLessonProgress(studentId, nextId, { status: "available" });
  return nextId;
}

export async function initializeCourseProgress(studentId: string, courseId: string): Promise<void> {
  await syncLessonAvailability(studentId, courseId);
}
