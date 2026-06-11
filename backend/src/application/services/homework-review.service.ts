import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError } from "../../domain/errors.js";
import { getHomeworkSubmissionById } from "../repositories/learning.repository.js";
import {
  completeLesson,
  markLessonReviewed,
  reopenLessonForRevision,
} from "./lesson-progress.service.js";
import { notifyHomeworkReviewed } from "./push-notification.service.js";

export type HomeworkReviewAction = "approve" | "reject";

export async function reviewHomeworkSubmission(params: {
  submissionId: string;
  reviewerId: string;
  action: HomeworkReviewAction;
  reviewNote?: string;
}) {
  const submission = await getHomeworkSubmissionById(params.submissionId);
  const lesson = submission.homework.lesson;
  const studentId = submission.studentId;
  const lessonId = lesson.id;
  const courseId = lesson.module.courseId;

  if (submission.status === "approved" && params.action === "approve") {
    return { submission, lessonStatus: "completed" as const, pointsAwarded: false };
  }

  if (params.action === "approve") {
    if (submission.status !== "submitted" && submission.status !== "under_review") {
      throw new BadRequestError(`Cannot approve submission with status: ${submission.status}`);
    }

    const updatedSubmission = await prisma.homeworkSubmission.update({
      where: { id: params.submissionId },
      data: {
        status: "approved",
        reviewedById: params.reviewerId,
        reviewedAt: new Date(),
        ...(params.reviewNote ? { reviewComment: params.reviewNote } : {}),
      },
    });

    const result = await completeLesson({
      studentId,
      lessonId,
      courseId,
      reviewerId: params.reviewerId,
      pointsReward: lesson.pointsReward,
      lessonTitle: lesson.title,
    });

    void notifyHomeworkReviewed({
      studentId,
      lessonId,
      lessonTitle: lesson.title,
      action: "approve",
    }).catch(() => undefined);

    return {
      submission: updatedSubmission,
      lessonStatus: "completed" as const,
      pointsAwarded: !result.alreadyCompleted,
    };
  }

  // reject → revision
  if (submission.status !== "submitted" && submission.status !== "under_review") {
    throw new BadRequestError(`Cannot reject submission with status: ${submission.status}`);
  }

  if (!params.reviewNote?.trim()) {
    throw new BadRequestError("Review comment is required when returning homework for revision");
  }

  const updatedSubmission = await prisma.homeworkSubmission.update({
    where: { id: params.submissionId },
    data: {
      status: "rejected",
      reviewedById: params.reviewerId,
      reviewedAt: new Date(),
      reviewComment: params.reviewNote.trim(),
    },
  });

  await reopenLessonForRevision(studentId, lessonId);

  void notifyHomeworkReviewed({
    studentId,
    lessonId,
    lessonTitle: lesson.title,
    action: "reject",
  }).catch(() => undefined);

  return {
    submission: updatedSubmission,
    lessonStatus: "available" as const,
    pointsAwarded: false,
  };
}

/** Optional: mark submission as under review and lesson as REVIEWED */
export async function markSubmissionUnderReview(submissionId: string, reviewerId: string) {
  const submission = await getHomeworkSubmissionById(submissionId);

  const updated = await prisma.homeworkSubmission.update({
    where: { id: submissionId },
    data: {
      status: "under_review",
      reviewedById: reviewerId,
    },
  });

  await markLessonReviewed(submission.studentId, submission.homework.lesson.id);

  return updated;
}
