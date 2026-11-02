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
import { requireLessonAccess } from "./course-access.service.js";
import { syncCourseCompletionStatus } from "./course-progress.service.js";
import { awardCourseProgressPoints } from "./course-completion-rewards.service.js";

async function runLessonCompletionSideEffects(params: {
  studentId: string;
  lessonId: string;
  courseId: string;
  actorId: string;
  lessonTitle: string;
  awardHomeworkLeagueXp?: boolean;
  eventAt?: Date;
}) {
  const { unlockNextLesson } = await import("./lesson-unlock.service.js");

  const nextLessonId = await unlockNextLesson(params.studentId, params.courseId, params.lessonId);
  const eventAt = params.eventAt ?? new Date();

  // A person from outside the school (no CRM link) has no league and earns no XP:
  // awardHomeworkAcceptedXp checks it (isLeagueStudent), so no special case here.
  if (params.awardHomeworkLeagueXp) {
    const submissionAttempts = await prisma.homeworkSubmission.count({
      where: {
        studentId: params.studentId,
        homework: { lessonId: params.lessonId },
      },
    });
    const course = await prisma.course.findUnique({
      where: { id: params.courseId },
      select: { directionId: true },
    });
    const { awardHomeworkAcceptedXp } = await import("./weekly-league.service.js");
    await awardHomeworkAcceptedXp({
      studentId: params.studentId,
      directionId: course?.directionId,
      sourceType: "course_homework",
      sourceKey: `course-homework:${params.studentId}:${params.lessonId}`,
      attemptNumber: submissionAttempts,
      description: submissionAttempts > 1
        ? `ДЗ к уроку «${params.lessonTitle}» принято после доработки`
        : `ДЗ к уроку «${params.lessonTitle}» принято`,
      awardedById: params.actorId,
      eventAt: params.eventAt,
    });
  }

  const courseCompleted = await syncCourseCompletionStatus(params.studentId, params.courseId);
  // Points for the module and the course, no Coins. A failed reward never undoes the completed
  // lesson; the failure is logged as an error (the award is idempotent by source key).
  await awardCourseProgressPoints({
    studentId: params.studentId,
    lessonId: params.lessonId,
    courseId: params.courseId,
    courseCompleted,
    eventAt,
  }).catch((error) => {
    console.error(
      `[course-rewards] ERROR Points for module/course failed student=${params.studentId} lesson=${params.lessonId}`,
      error instanceof Error ? error.message : error,
    );
  });

  return { nextLessonId, courseCompleted };
}

/** Student opens an available lesson → IN_PROGRESS */
export async function startLesson(studentId: string, lessonId: string) {
  const lesson = await getLessonWithCourse(lessonId);
  const courseId = lesson.module.courseId;

  await requireLessonAccess(studentId, lessonId);
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
  lessonTitle: string;
}) {
  const progress = await getLessonProgressRecord(params.studentId, params.lessonId);
  if (!progress) throw new NotFoundError("Lesson progress");

  if (progress.status === "completed") {
    const completion = await runLessonCompletionSideEffects({
      studentId: params.studentId,
      lessonId: params.lessonId,
      courseId: params.courseId,
      actorId: params.reviewerId,
      lessonTitle: params.lessonTitle,
      awardHomeworkLeagueXp: true,
      eventAt: progress.completedAt ?? new Date(),
    });
    return { alreadyCompleted: true, progress, nextLessonId: completion.nextLessonId };
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

  const completion = await runLessonCompletionSideEffects({
    studentId: params.studentId,
    lessonId: params.lessonId,
    courseId: params.courseId,
    actorId: params.reviewerId,
    lessonTitle: params.lessonTitle,
    awardHomeworkLeagueXp: true,
    eventAt: completedAt,
  });

  return { alreadyCompleted: false, progress: updated, nextLessonId: completion.nextLessonId };
}

/** Student confirms a started lesson that has no homework. */
export async function completeLessonWithoutHomework(studentId: string, lessonId: string) {
  const lesson = await getLessonWithCourse(lessonId);
  const courseId = lesson.module.courseId;

  await requireLessonAccess(studentId, lessonId);
  await requireCourseEnrollment(studentId, courseId);
  await syncLessonAvailability(studentId, courseId);

  const progress = await getLessonProgressRecord(studentId, lessonId);
  if (!progress) {
    throw new BadRequestError("Lesson progress not initialized. Start the lesson first.");
  }
  if (progress.status === "completed") {
    const completion = await runLessonCompletionSideEffects({
      studentId,
      lessonId,
      courseId,
      actorId: studentId,
      lessonTitle: lesson.title,
      eventAt: progress.completedAt ?? new Date(),
    });
    return {
      lessonId,
      courseId,
      status: progress.status,
      alreadyCompleted: true,
      ...completion,
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
      const completion = await runLessonCompletionSideEffects({
        studentId,
        lessonId,
        courseId,
        actorId: studentId,
        lessonTitle: lesson.title,
        eventAt: current.completedAt ?? new Date(),
      });
      return {
        lessonId,
        courseId,
        status: current.status,
        alreadyCompleted: true,
        ...completion,
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
