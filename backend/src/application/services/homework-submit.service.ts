import type { HomeworkAttachmentType, LessonProgressStatus } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError } from "../../domain/errors.js";
import {
  gradeHomeworkTest,
  parseHomeworkTestQuestions,
  type HomeworkTestAnswerMap,
} from "../../domain/homework-test.js";
import { getHomeworkById, createHomeworkSubmission } from "../repositories/homework.repository.js";
import { getLessonProgressRecord, getLessonWithCourse } from "../repositories/learning.repository.js";
import { completeLesson, markLessonSubmitted } from "./lesson-progress.service.js";
import { syncLessonAvailability } from "./lesson-unlock.service.js";
import { requireCourseEnrollment } from "./enrollment.service.js";
import { deliverNotificationsToUsers, deliverUserNotification, listUsersWithPermission } from "./notification.service.js";

async function notifyHomeworkReviewQueue(params: { lessonId: string; lessonTitle: string }) {
  const recipients = await listUsersWithPermission("homework.review").catch(() => []);
  await deliverNotificationsToUsers(
    recipients.map((recipient) => recipient.id),
    {
      type: "homework_submitted",
      title: "Новое домашнее задание на проверку",
      body: `Поступила работа по уроку «${params.lessonTitle}».`,
      url: "/admin/homework-review?status=submitted",
      tag: `homework-review-${params.lessonId}`,
      dedupeWindowMs: 2 * 60 * 1000,
    },
  ).catch(() => undefined);
}

export async function submitHomework(params: {
  homeworkId: string;
  studentId: string;
  comment?: string;
  attachmentUrl?: string;
  attachmentType?: HomeworkAttachmentType;
  testAnswers?: HomeworkTestAnswerMap;
}) {
  const homework = await getHomeworkById(params.homeworkId);
  const lessonId = homework.lesson.id;
  const lesson = await getLessonWithCourse(lessonId);
  const courseId = lesson.module.courseId;

  await requireCourseEnrollment(params.studentId, courseId);
  await syncLessonAvailability(params.studentId, courseId);

  const progress = await getLessonProgressRecord(params.studentId, lessonId);

  if (!progress || progress.status === "locked") {
    throw new BadRequestError("Lesson is locked. Complete the previous lesson first.");
  }

  if (progress.status === "completed") {
    throw new BadRequestError("Lesson already completed. Resubmission is not allowed.");
  }

  if (progress.status === "submitted" || progress.status === "reviewed") {
    throw new BadRequestError("Homework is already submitted and awaiting review.");
  }

  if (progress.status === "available") {
    throw new BadRequestError("Сначала начните урок");
  }

  if (homework.type === "test") {
    return submitHomeworkTest({
      homework,
      lesson,
      lessonId,
      courseId,
      studentId: params.studentId,
      testAnswers: params.testAnswers,
      hasAssignmentPayload: Boolean(params.comment || params.attachmentUrl),
    });
  }

  const submission = await createHomeworkSubmission({
    homeworkId: params.homeworkId,
    studentId: params.studentId,
    comment: params.comment,
    attachmentUrl: params.attachmentUrl,
    attachmentType: params.attachmentType,
  });

  await markLessonSubmitted(params.studentId, lessonId);
  await notifyHomeworkReviewQueue({ lessonId, lessonTitle: lesson.title });

  return {
    submission,
    lessonId,
    courseId,
    testResult: null,
    lessonProgress: "submitted" as LessonProgressStatus,
  };
}

async function submitHomeworkTest(params: {
  homework: Awaited<ReturnType<typeof getHomeworkById>>;
  lesson: Awaited<ReturnType<typeof getLessonWithCourse>>;
  lessonId: string;
  courseId: string;
  studentId: string;
  testAnswers?: HomeworkTestAnswerMap;
  hasAssignmentPayload: boolean;
}) {
  if (params.hasAssignmentPayload) {
    throw new BadRequestError("Для теста нужны только ответы на вопросы");
  }

  const questions = parseHomeworkTestQuestions(params.homework.testQuestions);
  const testResult = gradeHomeworkTest(questions, params.testAnswers ?? {});
  const testPassed = testResult.score >= params.homework.passingScore;

  if (testPassed) {
    const submission = await createHomeworkSubmission({
      homeworkId: params.homework.id,
      studentId: params.studentId,
      testAnswers: params.testAnswers,
      testScore: testResult.score,
      testPassed: true,
      status: "submitted",
    });

    await markLessonSubmitted(params.studentId, params.lessonId);

    const approved = await prisma.homeworkSubmission.update({
      where: { id: submission.id },
      data: {
        status: "approved",
        reviewedAt: new Date(),
      },
    });

    await completeLesson({
      studentId: params.studentId,
      lessonId: params.lessonId,
      courseId: params.courseId,
      reviewerId: params.studentId,
      pointsReward: params.lesson.pointsReward,
      lessonTitle: params.lesson.title,
    });

    await deliverUserNotification({
      userId: params.studentId,
      type: "homework_reviewed",
      title: "Тест пройден",
      body: `Урок «${params.lesson.title}» завершён — результат ${testResult.score}%.`,
      url: `/lessons/${params.lessonId}`,
      tag: `homework-${params.lessonId}`,
      dedupeWindowMs: 2 * 60 * 1000,
    }).catch(() => undefined);

    return {
      submission: approved,
      lessonId: params.lessonId,
      courseId: params.courseId,
      testResult,
      lessonProgress: "completed" as LessonProgressStatus,
    };
  }

  const reviewComment = `Набрано ${testResult.score}%. Для прохождения нужно не менее ${params.homework.passingScore}%.`;
  const submission = await createHomeworkSubmission({
    homeworkId: params.homework.id,
    studentId: params.studentId,
    testAnswers: params.testAnswers,
    testScore: testResult.score,
    testPassed: false,
    status: "rejected",
    reviewComment,
    reviewedAt: new Date(),
  });

  await deliverUserNotification({
    userId: params.studentId,
    type: "homework_reviewed",
    title: "Тест нужно повторить",
    body: `По уроку «${params.lesson.title}» набрано ${testResult.score}%. Для прохождения нужно не менее ${params.homework.passingScore}%.`,
    url: `/lessons/${params.lessonId}`,
    tag: `homework-${params.lessonId}`,
    dedupeWindowMs: 2 * 60 * 1000,
  }).catch(() => undefined);

  return {
    submission,
    lessonId: params.lessonId,
    courseId: params.courseId,
    testResult,
    lessonProgress: "in_progress" as LessonProgressStatus,
  };
}
