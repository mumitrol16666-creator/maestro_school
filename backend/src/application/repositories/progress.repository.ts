import { prisma } from "../../infrastructure/database/prisma.js";

export async function getStudentProgress(studentId: string, courseId?: string) {
  return prisma.lessonProgress.findMany({
    where: {
      studentId,
      ...(courseId
        ? { lesson: { module: { courseId } } }
        : {}),
    },
    include: {
      lesson: {
        select: {
          id: true,
          title: true,
          sortOrder: true,
          pointsReward: true,
          moduleId: true,
          module: { select: { courseId: true, title: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getStudentEnrollments(studentId: string) {
  return prisma.studentCourse.findMany({
    where: { studentId },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          directionId: true,
          difficultyLevel: true,
        },
      },
    },
  });
}
