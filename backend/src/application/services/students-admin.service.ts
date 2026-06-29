import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import { NotFoundError } from "../../domain/errors.js";
import { formatFio } from "../../domain/name.js";
import { getStudentAchievementsOverview } from "./achievement.service.js";
import { getStudentCoins } from "./coins.service.js";
import { calculateStudentPoints } from "./points.service.js";
import { countCompletedLessons } from "../repositories/learning.repository.js";

export async function listAdminStudents(input: {
  search?: string;
  page: number;
  limit: number;
}) {
  const where = {
    role: { slug: "student" as const },
    ...notDeleted,
    ...(input.search
      ? {
          OR: [
            { firstName: { contains: input.search, mode: "insensitive" as const } },
            { lastName: { contains: input.search, mode: "insensitive" as const } },
            { middleName: { contains: input.search, mode: "insensitive" as const } },
            { login: { contains: input.search, mode: "insensitive" as const } },
            { email: { contains: input.search, mode: "insensitive" as const } },
            { phone: { contains: input.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const skip = (input.page - 1) * input.limit;
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: input.limit,
      select: {
        id: true,
        login: true,
        firstName: true,
        lastName: true,
        middleName: true,
        email: true,
        phone: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  const enriched = await Promise.all(items.map(async (student) => {
    const [pointsResult, coinsResult, completedLessonsResult] = await Promise.allSettled([
      calculateStudentPoints(student.id),
      getStudentCoins(student.id),
      countCompletedLessons(student.id),
    ]);
    return {
      ...student,
      fullName: formatFio(student),
      points: pointsResult.status === "fulfilled" ? pointsResult.value : 0,
      coins: coinsResult.status === "fulfilled" ? coinsResult.value : 0,
      completedLessons: completedLessonsResult.status === "fulfilled" ? completedLessonsResult.value : 0,
    };
  }));

  return { items: enriched, total };
}

export async function getAdminStudent(studentId: string) {
  const student = await prisma.user.findFirst({
    where: { id: studentId, role: { slug: "student" }, ...notDeleted },
    select: {
      id: true,
      login: true,
      firstName: true,
      lastName: true,
      middleName: true,
      email: true,
      phone: true,
      createdAt: true,
    },
  });
  if (!student) throw new NotFoundError("Student");

  const [pointsResult, coinsResult, completedLessonsResult, achievementsResult, enrollmentsResult, onlineLessonsResult] = await Promise.allSettled([
    calculateStudentPoints(studentId),
    getStudentCoins(studentId),
    countCompletedLessons(studentId),
    getStudentAchievementsOverview(studentId),
    prisma.studentCourse.findMany({
      where: { studentId },
      include: {
        course: { select: { id: true, title: true, isPublished: true } },
      },
      orderBy: { enrolledAt: "desc" },
    }),
    prisma.onlineLessonRequest.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        directionTitle: true,
        status: true,
        scheduledAt: true,
        createdAt: true,
      },
    }),
  ]);

  const achievements = achievementsResult.status === "fulfilled" ? achievementsResult.value : [];
  const enrollments = enrollmentsResult.status === "fulfilled" ? enrollmentsResult.value : [];
  const onlineLessons = onlineLessonsResult.status === "fulfilled" ? onlineLessonsResult.value : [];
  const earnedAchievements = achievements.filter((item) => item.earned);

  return {
    ...student,
    fullName: formatFio(student),
    points: pointsResult.status === "fulfilled" ? pointsResult.value : 0,
    coins: coinsResult.status === "fulfilled" ? coinsResult.value : 0,
    completedLessons: completedLessonsResult.status === "fulfilled" ? completedLessonsResult.value : 0,
    achievements,
    earnedAchievementsCount: earnedAchievements.length,
    enrollments: enrollments.map((item) => ({
      id: item.id,
      status: item.status,
      enrolledAt: item.enrolledAt,
      course: item.course,
    })),
    onlineLessons,
  };
}
