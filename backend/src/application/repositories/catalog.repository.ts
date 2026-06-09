import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";

export async function listPublishedDirections() {
  return prisma.direction.findMany({
    where: { ...notDeleted, isPublished: true },
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      isPublished: true,
    },
  });
}

export async function listPublishedCourses(filters?: { directionId?: string; directionSlug?: string }) {
  const directionFilter = filters?.directionId
    ? { directionId: filters.directionId }
    : filters?.directionSlug
      ? { direction: { slug: filters.directionSlug, ...notDeleted } }
      : {};

  return prisma.course.findMany({
    where: { ...notDeleted, isPublished: true, ...directionFilter },
    orderBy: { title: "asc" },
    include: {
      direction: { select: { id: true, title: true, slug: true } },
      modules: {
        where: notDeleted,
        select: { id: true, _count: { select: { lessons: true } } },
      },
    },
  });
}

export async function getCourseById(courseId: string) {
  return prisma.course.findFirst({
    where: { id: courseId, ...notDeleted, isPublished: true },
    include: {
      direction: { select: { id: true, title: true, slug: true } },
      modules: {
        where: notDeleted,
        orderBy: { sortOrder: "asc" },
        include: {
          lessons: {
            where: { ...notDeleted, isPublished: true },
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              title: true,
              description: true,
              sortOrder: true,
              pointsReward: true,
              videoUrl: true,
            },
          },
        },
      },
    },
  });
}

export async function getLessonById(lessonId: string) {
  return prisma.lesson.findFirst({
    where: { id: lessonId, ...notDeleted, isPublished: true },
    include: {
      materials: { orderBy: { sortOrder: "asc" } },
      homeworks: { where: notDeleted, take: 1 },
      module: {
        select: {
          id: true,
          courseId: true,
          course: { select: { id: true, directionId: true, title: true } },
        },
      },
    },
  });
}
