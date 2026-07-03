import { Prisma, type DifficultyLevel, type HomeworkType, type MaterialType } from "@prisma/client";
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

export async function getAdminCourseTree(id: string) {
  const course = await requireRecord(prisma.course.findUnique({
    where: { id },
    select: {
      id: true,
      directionId: true,
      title: true,
      description: true,
      thumbnail: true,
      difficultyLevel: true,
      completionCoinsReward: true,
      isPublished: true,
      deletedAt: true,
      direction: { select: { id: true, title: true } },
      modules: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          courseId: true,
          title: true,
          description: true,
          sortOrder: true,
          lessons: {
            where: { deletedAt: null },
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              moduleId: true,
              title: true,
              videoUrl: true,
              sortOrder: true,
              isPublished: true,
              _count: { select: { materials: true, homeworks: { where: { deletedAt: null } } } },
            },
          },
          _count: { select: { lessons: { where: { deletedAt: null } } } },
        },
      },
    },
  }), "Course");

  return {
    ...course,
    modules: course.modules.map((module) => ({
      ...module,
      lessons: module.lessons.map(({ videoUrl, ...lesson }) => ({
        ...lesson,
        hasVideo: Boolean(videoUrl?.trim()),
      })),
    })),
  };
}

export const createCourse = (data: { directionId: string; title: string; description?: string | null; thumbnail?: string | null; difficultyLevel: DifficultyLevel; completionCoinsReward?: number; isPublished?: boolean }) =>
  prisma.course.create({ data });

export async function updateCourse(id: string, data: { directionId?: string; title?: string; description?: string | null; thumbnail?: string | null; difficultyLevel?: DifficultyLevel; completionCoinsReward?: number; isPublished?: boolean; deletedAt?: Date | null }) {
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

export async function getAdminLesson(id: string) {
  return requireRecord(prisma.lesson.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { materials: true, homeworks: { where: { deletedAt: null } } } } },
  }), "Lesson");
}

type LessonWrite = {
  moduleId?: string;
  title?: string;
  description?: string | null;
  videoUrl?: string | null;
  pointsReward?: number;
  sortOrder?: number;
  isPublished?: boolean;
  enableAskTeacher?: boolean;
  enableLessonSignup?: boolean;
  signupCourseId?: string | null;
  signupExternalUrl?: string | null;
  signupLabel?: string | null;
  deletedAt?: Date | null;
};

export const createLesson = (data: LessonWrite & { moduleId: string; title: string; pointsReward: number; sortOrder: number }) =>
  prisma.lesson.create({ data });

export async function updateLesson(id: string, data: LessonWrite) {
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

const materialUsageSelect = {
  id: true,
  title: true,
  lesson: {
    select: {
      id: true,
      title: true,
      module: {
        select: {
          id: true,
          title: true,
          course: { select: { id: true, title: true } },
        },
      },
    },
  },
} as const;

export async function listMaterialUsages(id: string) {
  const material = await requireRecord(prisma.lessonMaterial.findUnique({ where: { id }, select: { url: true } }), "Material");
  return prisma.lessonMaterial.findMany({ where: { url: material.url }, select: materialUsageSelect, orderBy: { createdAt: "asc" } });
}

export const listMaterialUsagesByUrlSuffix = (urlSuffix: string) =>
  prisma.lessonMaterial.findMany({ where: { url: { endsWith: urlSuffix } }, select: materialUsageSelect, orderBy: { createdAt: "asc" } });

export const listHomeworks = (lessonId: string) =>
  prisma.homework.findMany({ where: { lessonId, deletedAt: null }, orderBy: { createdAt: "asc" } });

type HomeworkWrite = {
  lessonId?: string;
  description?: string;
  type?: HomeworkType;
  passingScore?: number;
  testQuestions?: unknown[] | null;
  deletedAt?: Date | null;
};

function homeworkWriteData(data: HomeworkWrite): Prisma.HomeworkUncheckedUpdateInput {
  return {
    ...data,
    testQuestions: data.testQuestions === null
      ? Prisma.JsonNull
      : data.testQuestions as Prisma.InputJsonValue | undefined,
  };
}

export const createHomework = (data: HomeworkWrite & { lessonId: string; description: string }) =>
  prisma.homework.create({ data: homeworkWriteData(data) as Prisma.HomeworkUncheckedCreateInput });

export async function updateHomework(id: string, data: HomeworkWrite) {
  await requireRecord(prisma.homework.findUnique({ where: { id }, select: { id: true } }), "Homework");
  return prisma.homework.update({ where: { id }, data: homeworkWriteData(data) });
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
