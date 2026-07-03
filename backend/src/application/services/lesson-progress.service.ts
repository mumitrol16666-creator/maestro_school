import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../domain/errors.js";
import {
  assertStudentTransition,
  assertSystemTransition,
} from "../../domain/lesson-progress.state-machine.js";
import {
  getLessonProgressRecord,
  getLessonWithCourse,
  updateLessonProgressStatus,
  upsertLessonProgress,
} from "../repositories/learning.repository.js";
import { syncLessonAvailability } from "./lesson-unlock.service.js";
import { requireCourseEnrollment } from "./enrollment.service.js";
import { syncCourseCompletionStatus } from "./course-progress.service.js";
import { evaluateAchievements } from "./achievement.service.js";

/** Student opens an available lesson → IN_PROGRESS */
export async function startLesson(studentId: string, lessonId: string) {
  const lesson = await getLessonWithCourse(lessonId);
  const courseId = lesson.module.courseId;

  await requireCourseEnrollment(studentId, courseId);
  await syncLessonAvailability(studentId, courseId);

  const progress = await getLessonProgressRecord(studentId, lessonId);
  const currentStatus = progress?.status ?? "locked";

  if (currentStatus === "in_progress") {
    return { lessonId, status: currentStatus, courseId };
  }

  assertStudentTransition(currentStatus, "in_progress");

  const updated = await updateLessonProgressStatus(studentId, lessonId, "in_progress");

  return {
    lessonId: updated.lessonId,
    status: updated.status,
    courseId,
  };
}

/** After homework submission → SUBMITTED */
export async function markLessonSubmitted(studentId: string, lessonId: string) {
  const lesson = await getLessonWithCourse(lessonId);
  const progress = await getLessonProgressRecord(studentId, lessonId);

  if (!progress) {
    throw new BadRequestError("Lesson progress not initialized. Start the lesson first.");
  }

  if (progress.status === "submitted") {
    return progress;
  }

  assertStudentTransition(progress.status, "submitted");

  return updateLessonProgressStatus(studentId, lessonId, "submitted");
}

/** Admin marks submission under review → REVIEWED */
export async function markLessonReviewed(studentId: string, lessonId: string) {
  const progress = await getLessonProgressRecord(studentId, lessonId);
  if (!progress) throw new NotFoundError("Lesson progress");

  if (progress.status === "reviewed") return progress;

  assertSystemTransition(progress.status, "reviewed");
  return updateLessonProgressStatus(studentId, lessonId, "reviewed");
}

/** Admin approves → COMPLETED, unlock next, sync course, achievements */
export async function completeLesson(params: {
  studentId: string;
  lessonId: string;
  courseId: string;
  reviewerId: string;
  pointsReward: number;
  lessonTitle: string;
}) {
  const progress = await getLessonProgressRecord(params.studentId, params.lessonId);
  if (!progress) throw new NotFoundError("Lesson progress");

  if (progress.status === "completed") {
    return { alreadyCompleted: true, progress };
  }

  if (progress.status === "submitted" || progress.status === "reviewed") {
    assertSystemTransition(progress.status, "completed");
  } else {
    throw new ConflictError(
      `Cannot complete lesson from status: ${progress.status}`,
      "INVALID_LESSON_TRANSITION",
    );
  }

  const completedAt = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const lessonProgress = await tx.lessonProgress.update({
      where: {
        studentId_lessonId: {
          studentId: params.studentId,
          lessonId: params.lessonId,
        },
      },
      data: { status: "completed", completedAt },
    });

    return lessonProgress;
  });

  const { unlockNextLesson } = await import("./lesson-unlock.service.js");
  const { awardLessonPoints } = await import("./points.service.js");
  const { awardCourseCompletionCoins } = await import("./coins.service.js");

  await unlockNextLesson(params.studentId, params.courseId, params.lessonId);
  await awardLessonPoints({
    studentId: params.studentId,
    lessonId: params.lessonId,
    amount: params.pointsReward,
    reason: `Урок «${params.lessonTitle}»`,
    awardedBy: params.reviewerId,
  });
  const courseCompleted = await syncCourseCompletionStatus(params.studentId, params.courseId);
  if (courseCompleted) {
    await awardCourseCompletionCoins({
      studentId: params.studentId,
      courseId: params.courseId,
      createdBy: params.reviewerId,
    });
  }
  await evaluateAchievements(params.studentId, params.courseId);

  return { alreadyCompleted: false, progress: updated };
}

/** Admin sends for revision → AVAILABLE */
export async function reopenLessonForRevision(studentId: string, lessonId: string) {
  const progress = await getLessonProgressRecord(studentId, lessonId);
  if (!progress) throw new NotFoundError("Lesson progress");

  if (progress.status === "available") return progress;

  assertSystemTransition(progress.status, "available");

  return upsertLessonProgress(studentId, lessonId, {
    status: "available",
    completedAt: null,
  });
}
