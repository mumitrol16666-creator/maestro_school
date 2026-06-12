import { prisma } from "../../infrastructure/database/prisma.js";
import { isModuleCompleted } from "./course-progress.service.js";
import { calculateStudentPoints } from "./points.service.js";
import { countCompletedLessons, getCourseModules } from "../repositories/learning.repository.js";

export async function evaluateAchievements(
  studentId: string,
  courseId?: string,
): Promise<string[]> {
  const achievements = await prisma.achievement.findMany({
    where: { isActive: true },
  });

  const existing = await prisma.studentAchievement.findMany({
    where: { studentId },
    select: { achievementId: true },
  });
  const earnedIds = new Set(existing.map((e) => e.achievementId));

  const newlyEarned: string[] = [];

  const [points, completedLessons] = await Promise.all([
    calculateStudentPoints(studentId),
    countCompletedLessons(studentId),
  ]);

  for (const achievement of achievements) {
    if (earnedIds.has(achievement.id)) continue;

    let earned = false;

    switch (achievement.criteriaType) {
      case "first_lesson_completed":
        earned = completedLessons >= achievement.threshold;
        break;
      case "points_threshold":
        earned = points >= achievement.threshold;
        break;
      case "lessons_completed_count":
        earned = completedLessons >= achievement.threshold;
        break;
      case "first_module_completed": {
        if (!courseId) break;
        const modules = await getCourseModules(courseId);
        const firstModule = modules[0];
        if (firstModule) {
          earned = await isModuleCompleted(studentId, firstModule.id);
        }
        break;
      }
    }

    if (earned) {
      await prisma.studentAchievement.create({
        data: { studentId, achievementId: achievement.id },
      });
      newlyEarned.push(achievement.code);
      earnedIds.add(achievement.id);
    }
  }

  return newlyEarned;
}

export async function getStudentAchievements(studentId: string) {
  return prisma.studentAchievement.findMany({
    where: { studentId },
    include: {
      achievement: {
        select: { code: true, title: true, description: true },
      },
    },
    orderBy: { earnedAt: "desc" },
  });
}

export interface StudentAchievementOverviewItem {
  code: string;
  title: string;
  description: string | null;
  earned: boolean;
  earnedAt: string | null;
  progressPercent: number;
  progressLabel: string;
}

export async function getStudentAchievementsOverview(
  studentId: string,
): Promise<StudentAchievementOverviewItem[]> {
  const [achievements, earnedRows, points, completedLessons] = await Promise.all([
    prisma.achievement.findMany({
      where: { isActive: true },
      orderBy: { threshold: "asc" },
    }),
    prisma.studentAchievement.findMany({
      where: { studentId },
      select: { achievementId: true, earnedAt: true },
    }),
    calculateStudentPoints(studentId),
    countCompletedLessons(studentId),
  ]);

  const earnedMap = new Map(
    earnedRows.map((row) => [row.achievementId, row.earnedAt]),
  );

  return achievements.map((achievement) => {
    const earnedAt = earnedMap.get(achievement.id) ?? null;
    const earned = earnedAt != null;
    const { progressPercent, progressLabel } = buildAchievementProgress({
      criteriaType: achievement.criteriaType,
      threshold: achievement.threshold,
      points,
      completedLessons,
      earned,
    });

    return {
      code: achievement.code,
      title: achievement.title,
      description: achievement.description,
      earned,
      earnedAt: earnedAt?.toISOString() ?? null,
      progressPercent,
      progressLabel,
    };
  });
}

function buildAchievementProgress(params: {
  criteriaType: string;
  threshold: number;
  points: number;
  completedLessons: number;
  earned: boolean;
}) {
  if (params.earned) {
    return { progressPercent: 100, progressLabel: "Получено" };
  }

  switch (params.criteriaType) {
    case "points_threshold": {
      const current = Math.min(params.points, params.threshold);
      return {
        progressPercent: Math.round((current / params.threshold) * 100),
        progressLabel: `${params.points} из ${params.threshold} баллов`,
      };
    }
    case "lessons_completed_count":
    case "first_lesson_completed": {
      const current = Math.min(params.completedLessons, params.threshold);
      return {
        progressPercent: Math.round((current / params.threshold) * 100),
        progressLabel: `${params.completedLessons} из ${params.threshold} уроков`,
      };
    }
    case "first_module_completed":
      return {
        progressPercent: 0,
        progressLabel: "Завершите все уроки первого модуля",
      };
    default:
      return { progressPercent: 0, progressLabel: "В процессе" };
  }
}
