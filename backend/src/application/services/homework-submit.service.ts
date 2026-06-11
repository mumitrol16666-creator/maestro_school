import type { HomeworkAttachmentType } from "@prisma/client";
import { BadRequestError } from "../../domain/errors.js";
import {
  gradeHomeworkTest,
  parseHomeworkTestQuestions,
  type HomeworkTestAnswerMap,
} from "../../domain/homework-test.js";
import { getHomeworkById, createHomeworkSubmission } from "../repositories/homework.repository.js";
import { getLessonProgressRecord, getLessonWithCourse } from "../repositories/learning.repository.js";
import { markLessonSubmitted } from "./lesson-progress.service.js";
import { syncLessonAvailability } from "./lesson-unlock.service.js";
import { requireCourseEnrollment } from "./enrollment.service.js";

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

  let testResult: { score: number; correctAnswers: number; totalQuestions: number } | null = null;
  if (homework.type === "test") {
    const questions = parseHomeworkTestQuestions(homework.testQuestions);
    testResult = gradeHomeworkTest(questions, params.testAnswers ?? {});
  }

  const submission = await createHomeworkSubmission({
    homeworkId: params.homeworkId,
    studentId: params.studentId,
    comment: params.comment,
    attachmentUrl: params.attachmentUrl,
    attachmentType: params.attachmentType,
    testAnswers: homework.type === "test" ? params.testAnswers : undefined,
    testScore: testResult?.score,
    testPassed: testResult ? testResult.score >= homework.passingScore : undefined,
  });

  await markLessonSubmitted(params.studentId, lessonId);

  return { submission, lessonId, courseId, testResult };
}
