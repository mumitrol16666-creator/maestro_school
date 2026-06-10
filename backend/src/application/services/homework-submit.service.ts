import type { HomeworkAttachmentType } from "@prisma/client";
import { BadRequestError } from "../../domain/errors.js";
import { getHomeworkById, createHomeworkSubmission } from "../repositories/homework.repository.js";
import { getLessonProgressRecord, getLessonWithCourse } from "../repositories/learning.repository.js";
import { startLesson, markLessonSubmitted } from "./lesson-progress.service.js";
import { syncLessonAvailability } from "./lesson-unlock.service.js";
import { requireCourseEnrollment } from "./enrollment.service.js";

export async function submitHomework(params: {
  homeworkId: string;
  studentId: string;
  comment?: string;
  attachmentUrl?: string;
  attachmentType?: HomeworkAttachmentType;
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
    await startLesson(params.studentId, lessonId);
  }

  const submission = await createHomeworkSubmission({
    homeworkId: params.homeworkId,
    studentId: params.studentId,
    comment: params.comment,
    attachmentUrl: params.attachmentUrl,
    attachmentType: params.attachmentType,
  });

  await markLessonSubmitted(params.studentId, lessonId);

  return { submission, lessonId, courseId };
}
