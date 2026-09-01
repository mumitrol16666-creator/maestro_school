import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import { NotFoundError } from "../../domain/errors.js";
import { formatFio } from "../../domain/name.js";
import { getStudentAchievementsOverview } from "./achievement.service.js";
import { getStudentCoins } from "./coins.service.js";
import { calculateStudentPoints } from "./points.service.js";
import { countCompletedLessons } from "../repositories/learning.repository.js";
import { listStudentParents } from "./family.service.js";
import { rewardEconomyV2AppliesToEvent } from "../../config/product-features.js";
import { requireActiveEconomicEpochForEvent } from "./economic-epoch.service.js";

async function loadStudentListMetrics(studentIds: string[]) {
  const empty = {
    points: new Map<string, number>(),
    coins: new Map<string, number>(),
    completedLessons: new Map<string, number>(),
  };
  if (!studentIds.length) return empty;

  const [coinRowsResult, lessonRowsResult] = await Promise.allSettled([
    prisma.studentCoinBalance.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, balance: true },
    }),
    prisma.lessonProgress.groupBy({
      by: ["studentId"],
      where: { studentId: { in: studentIds }, status: "completed" },
      _count: { _all: true },
    }),
  ]);
  const coins = coinRowsResult.status === "fulfilled"
    ? new Map(coinRowsResult.value.map((row) => [row.studentId, row.balance]))
    : empty.coins;
  const completedLessons = lessonRowsResult.status === "fulfilled"
    ? new Map(lessonRowsResult.value.map((row) => [row.studentId, row._count._all]))
    : empty.completedLessons;

  const points = new Map<string, number>();
  try {
    const now = new Date();
    if (rewardEconomyV2AppliesToEvent(now)) {
      const epoch = await requireActiveEconomicEpochForEvent(now);
      const [participants, totals] = await Promise.all([
        prisma.economicEpochParticipant.findMany({
          where: { epochId: epoch.id, studentId: { in: studentIds } },
          select: { studentId: true, openingPoints: true },
        }),
        prisma.pointsTransaction.groupBy({
          by: ["studentId"],
          where: { economicEpochId: epoch.id, studentId: { in: studentIds } },
          _sum: { amount: true },
        }),
      ]);
      const totalsByStudent = new Map(totals.map((row) => [row.studentId, row._sum.amount ?? 0]));
      for (const participant of participants) {
        points.set(
          participant.studentId,
          Math.max(0, participant.openingPoints + (totalsByStudent.get(participant.studentId) ?? 0)),
        );
      }
    } else {
      const totals = await prisma.pointsTransaction.groupBy({
        by: ["studentId"],
        where: { economicEpochId: null, studentId: { in: studentIds } },
        _sum: { amount: true },
      });
      for (const row of totals) points.set(row.studentId, row._sum.amount ?? 0);
    }
  } catch {
    // A missing economic epoch must not make the whole admin list unavailable.
  }

  return { points, coins, completedLessons };
}

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

  const metrics = await loadStudentListMetrics(items.map((student) => student.id));
  const enriched = items.map((student) => ({
    ...student,
    fullName: formatFio(student),
    points: metrics.points.get(student.id) ?? 0,
    coins: metrics.coins.get(student.id) ?? 0,
    completedLessons: metrics.completedLessons.get(student.id) ?? 0,
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

  const [pointsResult, coinsResult, completedLessonsResult, achievementsResult, enrollmentsResult, onlineLessonsResult, parentsResult] = await Promise.allSettled([
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
    listStudentParents(studentId),
  ]);

  const achievements = achievementsResult.status === "fulfilled" ? achievementsResult.value : [];
  const enrollments = enrollmentsResult.status === "fulfilled" ? enrollmentsResult.value : [];
  const onlineLessons = onlineLessonsResult.status === "fulfilled" ? onlineLessonsResult.value : [];
  const parents = parentsResult.status === "fulfilled" ? parentsResult.value : [];
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
    parents,
  };
}
