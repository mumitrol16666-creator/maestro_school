import type { LessonProgressStatus } from "@prisma/client";
import {
  countCompletedLessons,
  getActiveEnrollment,
  getOrderedPublishedLessons,
  getProgressMapForCourse,
} from "../repositories/learning.repository.js";
import { calculateCourseProgressPercent } from "./course-progress.service.js";
import { getStudentPointsReadModel } from "./points.service.js";
import { syncLessonAvailability } from "./lesson-unlock.service.js";
import { getStudentRank } from "../../domain/student-rank.js";
import { findLockedLessonIdsInCourse } from "./course-access.service.js";

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
  rank: ReturnType<typeof getStudentRank> | null;
  level: Awaited<ReturnType<typeof getStudentPointsReadModel>>["level"];
  nextAvailableLesson: {
    id: string;
    /** Course of the lesson, for the «Оплатить курс» link. */
    courseId: string;
    title: string;
    status: LessonProgressStatus;
    moduleSortOrder: number;
    sortOrder: number;
    /** The lesson belongs to a paid course and the student holds no access: the home page says «Оплатить курс». */
    paymentRequired: boolean;
  } | null;
}

/**
 * Data services for the student home page — API only, no UI.
 */
export async function getStudentDashboard(studentId: string): Promise<StudentDashboardData> {
  const enrollment = await getActiveEnrollment(studentId);

  if (!enrollment) {
    const pointsOverview = await getStudentPointsReadModel(studentId);
    return {
      currentCourse: null,
      progressPercent: 0,
      completedLessonsCount: 0,
      totalLessonsCount: 0,
      points: pointsOverview.points,
      rank: pointsOverview.rank,
      level: pointsOverview.level,
      nextAvailableLesson: null,
    };
  }

  const courseId = enrollment.courseId;

  await syncLessonAvailability(studentId, courseId);

  const [orderedLessons, progressMap, progressPercent, completedLessonsCount, pointsOverview] =
    await Promise.all([
      getOrderedPublishedLessons(courseId),
      getProgressMapForCourse(studentId, courseId),
      calculateCourseProgressPercent(studentId, courseId),
      countCompletedLessons(studentId, courseId),
      getStudentPointsReadModel(studentId),
    ]);

  const closedByPayment = await findLockedLessonIdsInCourse(
    studentId,
    courseId,
    orderedLessons.map((lesson) => lesson.id),
  );
  let nextAvailableLesson: StudentDashboardData["nextAvailableLesson"] = null;

  for (const lesson of orderedLessons) {
    const progress = progressMap.get(lesson.id);
    const status = progress?.status ?? "locked";

    if (ACTIONABLE_STATUSES.includes(status)) {
      nextAvailableLesson = {
        id: lesson.id,
        courseId,
        title: lesson.title,
        status,
        moduleSortOrder: lesson.moduleSortOrder,
        sortOrder: lesson.sortOrder,
        paymentRequired: closedByPayment.has(lesson.id),
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
    points: pointsOverview.points,
    rank: pointsOverview.rank,
    level: pointsOverview.level,
    nextAvailableLesson,
  };
}
