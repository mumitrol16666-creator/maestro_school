import { prisma } from "../../infrastructure/database/prisma.js";
import { rewardEconomyV2AppliesToEvent } from "../../config/product-features.js";
import { requireActiveEconomicEpochForEvent } from "./economic-epoch.service.js";
import { WEEKLY_STREAK_MILESTONES } from "./weekly-league-policy.js";

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
  // Achievements are the weekly streak milestones. The old catalog of 14 (first_lesson,
  // points_100 …) was retired in plan 1.7; its rows stay in the database as history.
  const economicEpoch = rewardEconomyV2AppliesToEvent(now)
    ? await requireActiveEconomicEpochForEvent(now)
    : null;
  const [state, earned] = economicEpoch ? await Promise.all([
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
  ]) : [null, []];
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
