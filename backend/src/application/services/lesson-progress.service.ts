import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../domain/errors.js";
import {
  assertStudentTransition,
  assertSystemTransition,
  canStudentCompleteWithoutHomework,
} from "../../domain/lesson-progress.state-machine.js";
import {
  completeLessonProgressIfInProgress,
  getLessonProgressRecord,
  getLessonWithCourse,
  updateLessonProgressStatus,
  upsertLessonProgress,
} from "../repositories/learning.repository.js";
import { syncLessonAvailability } from "./lesson-unlock.service.js";
import { requireCourseEnrollment } from "./enrollment.service.js";
import { isCourseCompleted, syncCourseCompletionStatus } from "./course-progress.service.js";
import { evaluateAchievements } from "./achievement.service.js";
import { courseHomeworkLeagueXp } from "./weekly-league-policy.js";

async function runLessonCompletionSideEffects(params: {
  studentId: string;
  lessonId: string;
  courseId: string;
  actorId: string;
  pointsReward: number;
  lessonTitle: string;
  awardHomeworkLeagueXp?: boolean;
}) {
  const { unlockNextLesson } = await import("./lesson-unlock.service.js");
  const { awardLessonPoints } = await import("./points.service.js");
  const { awardCourseCompletionCoins } = await import("./coins.service.js");

  const nextLessonId = await unlockNextLesson(params.studentId, params.courseId, params.lessonId);
  await awardLessonPoints({
    studentId: params.studentId,
    lessonId: params.lessonId,
    amount: params.pointsReward,
    reason: `Урок «${params.lessonTitle}»`,
    awardedBy: params.actorId,
  });

  if (params.awardHomeworkLeagueXp) {
    const submissionAttempts = await prisma.homeworkSubmission.count({
      where: {
        studentId: params.studentId,
        homework: { lessonId: params.lessonId },
      },
    });
    const { awardLeagueXp } = await import("./weekly-league.service.js");
    await awardLeagueXp({
      studentId: params.studentId,
      amount: courseHomeworkLeagueXp(submissionAttempts),
      sourceType: "course_homework",
      sourceKey: `course-homework:${params.studentId}:${params.lessonId}`,
      description: submissionAttempts > 1
        ? `ДЗ к уроку «${params.lessonTitle}» принято после доработки`
        : `ДЗ к уроку «${params.lessonTitle}» принято`,
      awardedById: params.actorId,
    });
  }

  const courseCompleted = await syncCourseCompletionStatus(params.studentId, params.courseId);
  if (courseCompleted) {
    await awardCourseCompletionCoins({
      studentId: params.studentId,
      courseId: params.courseId,
      createdBy: params.actorId,
    });
  }
  await evaluateAchievements(params.studentId, params.courseId);

  return { nextLessonId, courseCompleted };
}

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

  await runLessonCompletionSideEffects({
    studentId: params.studentId,
    lessonId: params.lessonId,
    courseId: params.courseId,
    actorId: params.reviewerId,
    pointsReward: params.pointsReward,
    lessonTitle: params.lessonTitle,
    awardHomeworkLeagueXp: true,
  });

  return { alreadyCompleted: false, progress: updated };
}

/** Student confirms a started lesson that has no homework. */
export async function completeLessonWithoutHomework(studentId: string, lessonId: string) {
  const lesson = await getLessonWithCourse(lessonId);
  const courseId = lesson.module.courseId;

  await requireCourseEnrollment(studentId, courseId);
  await syncLessonAvailability(studentId, courseId);

  const progress = await getLessonProgressRecord(studentId, lessonId);
  if (!progress) {
    throw new BadRequestError("Lesson progress not initialized. Start the lesson first.");
  }
  if (progress.status === "completed") {
    return {
      lessonId,
      courseId,
      status: progress.status,
      alreadyCompleted: true,
      nextLessonId: null,
      courseCompleted: await isCourseCompleted(studentId, courseId),
    };
  }
  if (lesson.homeworks.length > 0) {
    throw new ConflictError(
      "У этого урока есть домашнее задание. Сначала выполните его.",
      "LESSON_REQUIRES_HOMEWORK",
    );
  }
  if (!canStudentCompleteWithoutHomework(progress.status, false)) {
    throw new ConflictError(
      `Cannot complete lesson from status: ${progress.status}`,
      "INVALID_LESSON_TRANSITION",
    );
  }

  const update = await completeLessonProgressIfInProgress(studentId, lessonId, new Date());
  if (update.count === 0) {
    const current = await getLessonProgressRecord(studentId, lessonId);
    if (current?.status === "completed") {
      return {
        lessonId,
        courseId,
        status: current.status,
        alreadyCompleted: true,
        nextLessonId: null,
        courseCompleted: await isCourseCompleted(studentId, courseId),
      };
    }
    throw new ConflictError(
      `Cannot complete lesson from status: ${current?.status ?? "missing"}`,
      "INVALID_LESSON_TRANSITION",
    );
  }

  const completion = await runLessonCompletionSideEffects({
    studentId,
    lessonId,
    courseId,
    actorId: studentId,
    pointsReward: lesson.pointsReward,
    lessonTitle: lesson.title,
  });

  return {
    lessonId,
    courseId,
    status: "completed" as const,
    alreadyCompleted: false,
    ...completion,
  };
}

/** Admin sends for revision → IN_PROGRESS so the student can resubmit immediately. */
export async function reopenLessonForRevision(studentId: string, lessonId: string) {
  const progress = await getLessonProgressRecord(studentId, lessonId);
  if (!progress) throw new NotFoundError("Lesson progress");

  if (progress.status === "in_progress") return progress;

  assertSystemTransition(progress.status, "in_progress");

  return upsertLessonProgress(studentId, lessonId, {
    status: "in_progress",
    completedAt: null,
  });
}
