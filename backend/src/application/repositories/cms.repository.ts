import type { DifficultyLevel, MaterialType } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { NotFoundError } from "../../domain/errors.js";

export interface PageInput {
  page: number;
  limit: number;
  search?: string;
}

const pageArgs = (input: PageInput) => ({
  skip: (input.page - 1) * input.limit,
  take: input.limit,
});

async function requireRecord<T>(promise: Promise<T | null>, resource: string): Promise<T> {
  const record = await promise;
  if (!record) throw new NotFoundError(resource);
  return record;
}

export async function listAdminDirections(input: PageInput) {
  const where = input.search
    ? { OR: [{ title: { contains: input.search, mode: "insensitive" as const } }, { slug: { contains: input.search, mode: "insensitive" as const } }] }
    : {};
  const [items, total] = await prisma.$transaction([
    prisma.direction.findMany({ where, orderBy: { updatedAt: "desc" }, ...pageArgs(input) }),
    prisma.direction.count({ where }),
  ]);
  return { items, total };
}

export const createDirection = (data: { title: string; slug: string; description?: string | null; imageUrl?: string | null; isPublished?: boolean }) =>
  prisma.direction.create({ data });

export async function updateDirection(id: string, data: { title?: string; slug?: string; description?: string | null; imageUrl?: string | null; isPublished?: boolean; deletedAt?: Date | null }) {
  await requireRecord(prisma.direction.findUnique({ where: { id }, select: { id: true } }), "Direction");
  return prisma.direction.update({ where: { id }, data });
}

export async function listAdminCourses(input: PageInput & { directionId?: string }) {
  const where = {
    ...(input.directionId ? { directionId: input.directionId } : {}),
    ...(input.search ? { title: { contains: input.search, mode: "insensitive" as const } } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.course.findMany({ where, include: { direction: { select: { id: true, title: true } }, _count: { select: { modules: true } } }, orderBy: { updatedAt: "desc" }, ...pageArgs(input) }),
    prisma.course.count({ where }),
  ]);
  return { items, total };
}

export async function getAdminCourse(id: string) {
  return requireRecord(prisma.course.findUnique({
    where: { id },
    include: { direction: { select: { id: true, title: true } } },
  }), "Course");
}

export const createCourse = (data: { directionId: string; title: string; description?: string | null; thumbnail?: string | null; difficultyLevel: DifficultyLevel; isPublished?: boolean }) =>
  prisma.course.create({ data });

export async function updateCourse(id: string, data: { directionId?: string; title?: string; description?: string | null; thumbnail?: string | null; difficultyLevel?: DifficultyLevel; isPublished?: boolean; deletedAt?: Date | null }) {
  await requireRecord(prisma.course.findUnique({ where: { id }, select: { id: true } }), "Course");
  return prisma.course.update({ where: { id }, data });
}

export const listModules = (courseId: string) =>
  prisma.courseModule.findMany({ where: { courseId, deletedAt: null }, include: { _count: { select: { lessons: true } } }, orderBy: { sortOrder: "asc" } });

export const createModule = (data: { courseId: string; title: string; description?: string | null; sortOrder: number }) =>
  prisma.courseModule.create({ data });

export async function updateModule(id: string, data: { courseId?: string; title?: string; description?: string | null; sortOrder?: number; deletedAt?: Date | null }) {
  await requireRecord(prisma.courseModule.findUnique({ where: { id }, select: { id: true } }), "Module");
  return prisma.courseModule.update({ where: { id }, data });
}

export const listLessons = (moduleId: string) =>
  prisma.lesson.findMany({ where: { moduleId, deletedAt: null }, include: { _count: { select: { materials: true, homeworks: true } } }, orderBy: { sortOrder: "asc" } });

export const createLesson = (data: { moduleId: string; title: string; description?: string | null; videoUrl?: string | null; pointsReward: number; sortOrder: number; isPublished?: boolean }) =>
  prisma.lesson.create({ data });

export async function updateLesson(id: string, data: { moduleId?: string; title?: string; description?: string | null; videoUrl?: string | null; pointsReward?: number; sortOrder?: number; isPublished?: boolean; deletedAt?: Date | null }) {
  await requireRecord(prisma.lesson.findUnique({ where: { id }, select: { id: true } }), "Lesson");
  return prisma.lesson.update({ where: { id }, data });
}

export const listMaterials = (lessonId: string) =>
  prisma.lessonMaterial.findMany({ where: { lessonId }, orderBy: { sortOrder: "asc" } });

export const createMaterial = (data: { lessonId: string; type: MaterialType; title: string; url: string; sortOrder: number }) =>
  prisma.lessonMaterial.create({ data });

export async function updateMaterial(id: string, data: { lessonId?: string; type?: MaterialType; title?: string; url?: string; sortOrder?: number }) {
  await requireRecord(prisma.lessonMaterial.findUnique({ where: { id }, select: { id: true } }), "Material");
  return prisma.lessonMaterial.update({ where: { id }, data });
}

export async function deleteMaterial(id: string) {
  await requireRecord(prisma.lessonMaterial.findUnique({ where: { id }, select: { id: true } }), "Material");
  return prisma.lessonMaterial.delete({ where: { id } });
}

export const listHomeworks = (lessonId: string) =>
  prisma.homework.findMany({ where: { lessonId, deletedAt: null }, orderBy: { createdAt: "asc" } });

export const createHomework = (data: { lessonId: string; description: string }) =>
  prisma.homework.create({ data });

export async function updateHomework(id: string, data: { lessonId?: string; description?: string; deletedAt?: Date | null }) {
  await requireRecord(prisma.homework.findUnique({ where: { id }, select: { id: true } }), "Homework");
  return prisma.homework.update({ where: { id }, data });
}

export async function listAdminNews(input: PageInput) {
  const where = input.search ? { title: { contains: input.search, mode: "insensitive" as const } } : {};
  const [items, total] = await prisma.$transaction([
    prisma.newsPost.findMany({ where, include: { author: { select: { firstName: true, lastName: true } } }, orderBy: { updatedAt: "desc" }, ...pageArgs(input) }),
    prisma.newsPost.count({ where }),
  ]);
  return { items, total };
}

export const createNews = (data: { title: string; content: string; authorId: string; isPublished?: boolean; publishedAt?: Date | null }) =>
  prisma.newsPost.create({ data });

export async function updateNews(id: string, data: { title?: string; content?: string; isPublished?: boolean; publishedAt?: Date | null; deletedAt?: Date | null }) {
  await requireRecord(prisma.newsPost.findUnique({ where: { id }, select: { id: true } }), "News post");
  return prisma.newsPost.update({ where: { id }, data });
}
