import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, NotFoundError } from "../../domain/errors.js";
import { getLessonById } from "../repositories/catalog.repository.js";
import { requireCourseEnrollment } from "./enrollment.service.js";
import { syncLessonAvailability } from "./lesson-unlock.service.js";

export async function submitLessonQuestion(params: {
  lessonId: string;
  studentId: string;
  message: string;
}) {
  const lesson = await getLessonById(params.lessonId);
  if (!lesson) throw new NotFoundError("Lesson");
  if (!lesson.enableAskTeacher) {
    throw new BadRequestError("Вопросы преподавателю для этого урока отключены");
  }

  const courseId = lesson.module.courseId;
  await requireCourseEnrollment(params.studentId, courseId);
  await syncLessonAvailability(params.studentId, courseId);

  const progress = await prisma.lessonProgress.findUnique({
    where: { studentId_lessonId: { studentId: params.studentId, lessonId: params.lessonId } },
    select: { status: true },
  });
  if (!progress || progress.status === "locked" || progress.status === "available") {
    throw new BadRequestError("Сначала начните урок");
  }

  const message = params.message.trim();
  if (!message) throw new BadRequestError("Введите текст вопроса");

  return prisma.lessonQuestion.create({
    data: {
      lessonId: params.lessonId,
      studentId: params.studentId,
      message,
    },
    select: {
      id: true,
      lessonId: true,
      message: true,
      status: true,
      createdAt: true,
    },
  });
}

export async function listAdminLessonQuestions(input: {
  status?: "pending" | "answered";
  lessonId?: string;
  search?: string;
  page: number;
  limit: number;
}) {
  const where = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.lessonId ? { lessonId: input.lessonId } : {}),
    ...(input.search
      ? {
          OR: [
            { message: { contains: input.search, mode: "insensitive" as const } },
            { student: { firstName: { contains: input.search, mode: "insensitive" as const } } },
            { student: { lastName: { contains: input.search, mode: "insensitive" as const } } },
            { student: { email: { contains: input.search, mode: "insensitive" as const } } },
            { lesson: { title: { contains: input.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const skip = (input.page - 1) * input.limit;
  const [items, total] = await prisma.$transaction([
    prisma.lessonQuestion.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: input.limit,
      select: {
        id: true,
        lessonId: true,
        message: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        student: {
          select: { id: true, firstName: true, lastName: true, middleName: true, email: true },
        },
        lesson: {
          select: {
            id: true,
            title: true,
            module: {
              select: {
                title: true,
                course: { select: { id: true, title: true } },
              },
            },
          },
        },
      },
    }),
    prisma.lessonQuestion.count({ where }),
  ]);

  return { items, total };
}

export async function markLessonQuestionAnswered(id: string) {
  const existing = await prisma.lessonQuestion.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError("Lesson question");

  return prisma.lessonQuestion.update({
    where: { id },
    data: { status: "answered" },
    select: { id: true, status: true, updatedAt: true },
  });
}

export async function countPendingLessonQuestions() {
  return prisma.lessonQuestion.count({ where: { status: "pending" } });
}
