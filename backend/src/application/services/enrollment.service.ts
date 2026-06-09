import { prisma } from "../../infrastructure/database/prisma.js";
import { NotFoundError } from "../../domain/errors.js";
import { initializeCourseProgress } from "./lesson-unlock.service.js";

/**
 * Ensures a student is enrolled in a published course before progress sync.
 * Stabilization bridge: admin publishes course → student can open /courses/:id.
 */
export async function ensureStudentEnrolled(studentId: string, courseId: string) {
  const existing = await prisma.studentCourse.findUnique({
    where: { studentId_courseId: { studentId, courseId } },
  });
  if (existing) return existing;

  const course = await prisma.course.findFirst({
    where: { id: courseId, isPublished: true, deletedAt: null },
    select: { id: true },
  });
  if (!course) throw new NotFoundError("Course");

  const enrollment = await prisma.studentCourse.create({
    data: { studentId, courseId, status: "active" },
  });

  await initializeCourseProgress(studentId, courseId);
  return enrollment;
}
