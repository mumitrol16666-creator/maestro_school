import type { LessonProgressStatus } from "@prisma/client";
import {
  countCompletedLessons,
  getActiveEnrollment,
  getOrderedPublishedLessons,
  getProgressMapForCourse,
} from "../repositories/learning.repository.js";
import { calculateCourseProgressPercent } from "./course-progress.service.js";
import { calculateStudentPoints } from "./points.service.js";
import { syncLessonAvailability } from "./lesson-unlock.service.js";

const ACTIONABLE_STATUSES: LessonProgressStatus[] = [
  "available",
  "in_progress",
  "submitted",
  "reviewed",
];

export interface StudentDashboardData {
  currentCourse: {
    id: string;
    title: string;
    description: string | null;
    thumbnail: string | null;
    difficultyLevel: string;
    direction: { id: string; title: string; slug: string };
  } | null;
  progressPercent: number;
  completedLessonsCount: number;
  totalLessonsCount: number;
  points: number;
  nextAvailableLesson: {
    id: string;
    title: string;
    status: LessonProgressStatus;
    moduleSortOrder: number;
    sortOrder: number;
  } | null;
}

/**
 * Data services for the student home page — API only, no UI.
 */
export async function getStudentDashboard(studentId: string): Promise<StudentDashboardData> {
  const enrollment = await getActiveEnrollment(studentId);

  if (!enrollment) {
    const points = await calculateStudentPoints(studentId);
    return {
      currentCourse: null,
      progressPercent: 0,
      completedLessonsCount: 0,
      totalLessonsCount: 0,
      points,
      nextAvailableLesson: null,
    };
  }

  const courseId = enrollment.courseId;

  await syncLessonAvailability(studentId, courseId);

  const [orderedLessons, progressMap, progressPercent, completedLessonsCount, points] =
    await Promise.all([
      getOrderedPublishedLessons(courseId),
      getProgressMapForCourse(studentId, courseId),
      calculateCourseProgressPercent(studentId, courseId),
      countCompletedLessons(studentId, courseId),
      calculateStudentPoints(studentId),
    ]);

  let nextAvailableLesson: StudentDashboardData["nextAvailableLesson"] = null;

  for (const lesson of orderedLessons) {
    const progress = progressMap.get(lesson.id);
    const status = progress?.status ?? "locked";

    if (ACTIONABLE_STATUSES.includes(status)) {
      nextAvailableLesson = {
        id: lesson.id,
        title: lesson.title,
        status,
        moduleSortOrder: lesson.moduleSortOrder,
        sortOrder: lesson.sortOrder,
      };
      break;
    }
  }

  return {
    currentCourse: {
      id: enrollment.course.id,
      title: enrollment.course.title,
      description: enrollment.course.description,
      thumbnail: enrollment.course.thumbnail,
      difficultyLevel: enrollment.course.difficultyLevel,
      direction: enrollment.course.direction,
    },
    progressPercent,
    completedLessonsCount,
    totalLessonsCount: orderedLessons.length,
    points,
    nextAvailableLesson,
  };
}
