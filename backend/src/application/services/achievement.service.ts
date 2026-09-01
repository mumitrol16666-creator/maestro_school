import { prisma } from "../../infrastructure/database/prisma.js";
import { isModuleCompleted } from "./course-progress.service.js";
import { calculateStudentPoints } from "./points.service.js";
import { countCompletedLessons, getCourseModules } from "../repositories/learning.repository.js";
import { deliverUserNotification } from "./notification.service.js";
import { rewardEconomyV2AppliesToEvent } from "../../config/product-features.js";
import { requireActiveEconomicEpochForEvent } from "./economic-epoch.service.js";
import { WEEKLY_STREAK_MILESTONES } from "./weekly-league-policy.js";

type AchievementMetrics = {
  points: number;
  completedLessons: number;
  offlineLessons: number;
  completedHomework: number;
  completedMonthlyPlans: number;
  earnedCoins: number;
};

async function getAchievementMetrics(studentId: string): Promise<AchievementMetrics> {
  const [points, completedLessons, user, coinTotal] = await Promise.all([
    calculateStudentPoints(studentId),
    countCompletedLessons(studentId),
    prisma.user.findUnique({ where: { id: studentId }, select: { crmStudentId: true } }),
    prisma.maestroCoinTransaction.aggregate({
      where: { studentId, amount: { gt: 0 } },
      _sum: { amount: true },
    }),
  ]);

  if (!user?.crmStudentId) {
    return {
      points,
      completedLessons,
      offlineLessons: 0,
      completedHomework: 0,
      completedMonthlyPlans: 0,
      earnedCoins: coinTotal._sum.amount ?? 0,
    };
  }

  const [offlineLessons, completedHomework, plans] = await Promise.all([
    prisma.offlineLessonStudentCheck.count({
      where: {
        crmStudentId: user.crmStudentId,
        rewardsAppliedAt: { not: null },
        attendanceStatus: { in: ["present", "late"] },
      },
    }),
    prisma.offlineLessonStudentCheck.count({
      where: {
        crmStudentId: user.crmStudentId,
        rewardsAppliedAt: { not: null },
        homeworkStatus: "completed",
      },
    }),
    prisma.studentMonthlyPlan.findMany({
      where: { crmStudentId: user.crmStudentId },
      select: { items: true },
    }),
  ]);
  const completedMonthlyPlans = plans.filter((plan) => {
    const items = Array.isArray(plan.items)
      ? plan.items as Array<{ status?: string }>
      : [];
    const activeItems = items.filter((item) => item.status !== "moved");
    return activeItems.length > 0 && activeItems.every((item) => item.status === "completed");
  }).length;

  return {
    points,
    completedLessons,
    offlineLessons,
    completedHomework,
    completedMonthlyPlans,
    earnedCoins: coinTotal._sum.amount ?? 0,
  };
}

export async function evaluateAchievements(
  studentId: string,
  courseId?: string,
): Promise<string[]> {
  if (rewardEconomyV2AppliesToEvent(new Date())) {
    return [];
  }
  const achievements = await prisma.achievement.findMany({
    where: { isActive: true },
  });

  const existing = await prisma.studentAchievement.findMany({
    where: { studentId },
    select: { achievementId: true },
  });
  const earnedIds = new Set(existing.map((e) => e.achievementId));

  const newlyEarned: string[] = [];

  const metrics = await getAchievementMetrics(studentId);

  for (const achievement of achievements) {
    if (earnedIds.has(achievement.id)) continue;

    let earned = false;

    switch (achievement.criteriaType) {
      case "first_lesson_completed":
        earned = metrics.completedLessons >= achievement.threshold;
        break;
      case "points_threshold":
        earned = metrics.points >= achievement.threshold;
        break;
      case "lessons_completed_count":
        earned = metrics.completedLessons >= achievement.threshold;
        break;
      case "offline_lessons_completed_count":
        earned = metrics.offlineLessons >= achievement.threshold;
        break;
      case "homework_completed_count":
        earned = metrics.completedHomework >= achievement.threshold;
        break;
      case "monthly_plans_completed_count":
        earned = metrics.completedMonthlyPlans >= achievement.threshold;
        break;
      case "coins_earned_threshold":
        earned = metrics.earnedCoins >= achievement.threshold;
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
      const earnedAchievement = await prisma.studentAchievement.create({
        data: { studentId, achievementId: achievement.id },
      });
      await deliverUserNotification({
        userId: studentId,
        type: "achievement_earned",
        title: "Новое достижение",
        body: achievement.description
          ? `${achievement.title}. ${achievement.description}`
          : achievement.title,
        url: "/dashboard",
        tag: `achievement-${earnedAchievement.id}`,
        dedupeKey: `achievement:${earnedAchievement.id}`,
      }).catch(() => undefined);
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
  const now = new Date();
  if (rewardEconomyV2AppliesToEvent(now)) {
    const economicEpoch = await requireActiveEconomicEpochForEvent(now);
    const [state, earned] = await Promise.all([
      prisma.weeklyStreakState.findUnique({
        where: {
          economicEpochId_studentId: {
            economicEpochId: economicEpoch.id,
            studentId,
          },
        },
      }),
      prisma.weeklyStreakMilestone.findMany({
        where: { economicEpochId: economicEpoch.id, studentId },
      }),
    ]);
    const earnedByWeeks = new Map(earned.map((item) => [item.milestoneWeeks, item]));
    const currentWeeks = state?.currentWeeks ?? 0;
    return WEEKLY_STREAK_MILESTONES.map((milestone) => {
      const earnedMilestone = earnedByWeeks.get(milestone.weeks);
      return {
        code: `weekly_streak_${milestone.weeks}`,
        title: milestone.title,
        description: `Сохраняйте учебную активность ${milestone.weeks} недель подряд`,
        earned: Boolean(earnedMilestone),
        earnedAt: earnedMilestone?.earnedAt.toISOString() ?? null,
        progressPercent: earnedMilestone
          ? 100
          : Math.min(100, Math.round(currentWeeks / milestone.weeks * 100)),
        progressLabel: earnedMilestone
          ? "Получено"
          : `${Math.min(currentWeeks, milestone.weeks)} из ${milestone.weeks} недель`,
      };
    });
  }

  const [achievements, earnedRows, metrics] = await Promise.all([
    prisma.achievement.findMany({
      where: { isActive: true },
      orderBy: { threshold: "asc" },
    }),
    prisma.studentAchievement.findMany({
      where: { studentId },
      select: { achievementId: true, earnedAt: true },
    }),
    getAchievementMetrics(studentId),
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
      ...metrics,
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
  offlineLessons: number;
  completedHomework: number;
  completedMonthlyPlans: number;
  earnedCoins: number;
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
    case "offline_lessons_completed_count": {
      const current = Math.min(params.offlineLessons, params.threshold);
      return {
        progressPercent: Math.round((current / params.threshold) * 100),
        progressLabel: `${params.offlineLessons} из ${params.threshold} уроков с преподавателем`,
      };
    }
    case "homework_completed_count": {
      const current = Math.min(params.completedHomework, params.threshold);
      return {
        progressPercent: Math.round((current / params.threshold) * 100),
        progressLabel: `${params.completedHomework} из ${params.threshold} выполненных ДЗ`,
      };
    }
    case "monthly_plans_completed_count": {
      const current = Math.min(params.completedMonthlyPlans, params.threshold);
      return {
        progressPercent: Math.round((current / params.threshold) * 100),
        progressLabel: `${params.completedMonthlyPlans} из ${params.threshold} завершённых планов`,
      };
    }
    case "coins_earned_threshold": {
      const current = Math.min(params.earnedCoins, params.threshold);
      return {
        progressPercent: Math.round((current / params.threshold) * 100),
        progressLabel: `${params.earnedCoins} из ${params.threshold} Maestro Coins`,
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
