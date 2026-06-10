import { prisma } from "../../infrastructure/database/prisma.js";
import { ForbiddenError, NotFoundError } from "../../domain/errors.js";
import { initializeCourseProgress } from "./lesson-unlock.service.js";

const ACCESSIBLE_STATUSES = ["enrolled", "active", "completed"] as const;

export async function getStudentEnrollment(studentId: string, courseId: string) {
  return prisma.studentCourse.findFirst({
    where: {
      studentId,
      courseId,
      status: { in: [...ACCESSIBLE_STATUSES] },
    },
  });
}

export async function getStudentEnrollmentMap(studentId: string, courseIds: string[]) {
  if (!courseIds.length) return new Map<string, string>();
  const enrollments = await prisma.studentCourse.findMany({
    where: {
      studentId,
      courseId: { in: courseIds },
      status: { in: [...ACCESSIBLE_STATUSES] },
    },
    select: { courseId: true, status: true },
  });
  return new Map(enrollments.map((item) => [item.courseId, item.status]));
}

export async function enrollStudentInCourse(studentId: string, courseId: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, isPublished: true, deletedAt: null },
    select: { id: true },
  });
  if (!course) throw new NotFoundError("Course");

  const enrollment = await prisma.studentCourse.upsert({
    where: { studentId_courseId: { studentId, courseId } },
    create: { studentId, courseId, status: "active" },
    update: { status: "active" },
  });

  await initializeCourseProgress(studentId, courseId);
  return enrollment;
}

export async function requireCourseEnrollment(studentId: string, courseId: string) {
  const enrollment = await getStudentEnrollment(studentId, courseId);
  if (!enrollment || !ACCESSIBLE_STATUSES.includes(enrollment.status as typeof ACCESSIBLE_STATUSES[number])) {
    throw new ForbiddenError("Сначала начните обучение на этом курсе");
  }
  return enrollment;
}
