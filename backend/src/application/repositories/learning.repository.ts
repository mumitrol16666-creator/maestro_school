import type { LessonProgressStatus, StudentCourseStatus } from "@prisma/client";
import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import { NotFoundError } from "../../domain/errors.js";

export interface OrderedLesson {
  id: string;
  moduleId: string;
  courseId: string;
  sortOrder: number;
  moduleSortOrder: number;
  pointsReward: number;
  title: string;
}

export async function getOrderedPublishedLessons(courseId: string): Promise<OrderedLesson[]> {
  const lessons = await prisma.lesson.findMany({
    where: {
      isPublished: true,
      deletedAt: null,
      module: { courseId, deletedAt: null },
    },
    select: {
      id: true,
      moduleId: true,
      sortOrder: true,
      pointsReward: true,
      title: true,
      module: { select: { courseId: true, sortOrder: true } },
    },
    orderBy: [{ module: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });

  return lessons.map((l) => ({
    id: l.id,
    moduleId: l.moduleId,
    courseId: l.module.courseId,
    sortOrder: l.sortOrder,
    moduleSortOrder: l.module.sortOrder,
    pointsReward: l.pointsReward,
    title: l.title,
  }));
}

export async function getLessonWithCourse(lessonId: string) {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, ...notDeleted, isPublished: true },
    include: {
      module: {
        select: {
          id: true,
          courseId: true,
          sortOrder: true,
          title: true,
        },
      },
      homeworks: {
        where: notDeleted,
        take: 1,
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!lesson) throw new NotFoundError("Lesson");
  return lesson;
}

export async function getLessonProgressRecord(studentId: string, lessonId: string) {
  return prisma.lessonProgress.findUnique({
    where: { studentId_lessonId: { studentId, lessonId } },
  });
}

export async function upsertLessonProgress(
  studentId: string,
  lessonId: string,
  data: {
    status: LessonProgressStatus;
    completedAt?: Date | null;
  },
) {
  return prisma.lessonProgress.upsert({
    where: { studentId_lessonId: { studentId, lessonId } },
    create: {
      studentId,
      lessonId,
      status: data.status,
      completedAt: data.completedAt ?? null,
    },
    update: {
      status: data.status,
      completedAt: data.completedAt,
    },
  });
}

export async function updateLessonProgressStatus(
  studentId: string,
  lessonId: string,
  status: LessonProgressStatus,
  completedAt?: Date | null,
) {
  return prisma.lessonProgress.update({
    where: { studentId_lessonId: { studentId, lessonId } },
    data: {
      status,
      ...(completedAt !== undefined ? { completedAt } : {}),
    },
  });
}

export async function getProgressMapForCourse(studentId: string, courseId: string) {
  const rows = await prisma.lessonProgress.findMany({
    where: {
      studentId,
      lesson: { module: { courseId } },
    },
    select: { lessonId: true, status: true },
  });
  return new Map<string, { status: LessonProgressStatus }>(
    rows.map((r) => [r.lessonId, { status: r.status }]),
  );
}

export async function countCompletedLessons(studentId: string, courseId?: string) {
  return prisma.lessonProgress.count({
    where: {
      studentId,
      status: "completed",
      ...(courseId ? { lesson: { module: { courseId } } } : {}),
    },
  });
}

export async function countTotalPublishedLessons(courseId: string) {
  return prisma.lesson.count({
    where: {
      isPublished: true,
      deletedAt: null,
      module: { courseId, deletedAt: null },
    },
  });
}

export async function getModuleLessons(moduleId: string) {
  return prisma.lesson.findMany({
    where: { moduleId, isPublished: true, deletedAt: null },
    select: { id: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getCourseModules(courseId: string) {
  return prisma.courseModule.findMany({
    where: { courseId, deletedAt: null },
    select: { id: true, sortOrder: true, title: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getActiveEnrollment(studentId: string, courseId?: string) {
  return prisma.studentCourse.findFirst({
    where: {
      studentId,
      status: { in: ["enrolled", "active"] },
      ...(courseId ? { courseId } : {}),
    },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          description: true,
          thumbnail: true,
          difficultyLevel: true,
          directionId: true,
          direction: { select: { id: true, title: true, slug: true } },
        },
      },
    },
    orderBy: { enrolledAt: "desc" },
  });
}

export async function updateStudentCourseStatus(
  studentId: string,
  courseId: string,
  status: StudentCourseStatus,
) {
  return prisma.studentCourse.update({
    where: { studentId_courseId: { studentId, courseId } },
    data: { status },
  });
}

export async function getHomeworkSubmissionById(submissionId: string) {
  const submission = await prisma.homeworkSubmission.findUnique({
    where: { id: submissionId },
    include: {
      homework: {
        include: {
          lesson: {
            include: {
              module: { select: { courseId: true } },
            },
          },
        },
      },
    },
  });
  if (!submission) throw new NotFoundError("Homework submission");
  return submission;
}
