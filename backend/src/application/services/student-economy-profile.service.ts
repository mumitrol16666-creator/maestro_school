import { prisma } from "../../infrastructure/database/prisma.js";
import { getStudentCoins } from "./coins.service.js";
import { getStudentPointsReadModel } from "./points.service.js";
import { WEEKLY_STREAK_MILESTONES } from "./weekly-league-policy.js";

export async function getStudentEconomyProfile(studentId: string, now = new Date()) {
  const [points, coins] = await Promise.all([
    getStudentPointsReadModel(studentId, now),
    getStudentCoins(studentId),
  ]);
  if (!points.economicEpoch || !points.level) {
    return {
      economyV2Enabled: false as const,
      points: points.points,
      level: null,
      coins,
      streak: null,
      milestones: [],
    };
  }

  const [streak, earnedMilestones] = await Promise.all([
    prisma.weeklyStreakState.findUnique({
      where: {
        economicEpochId_studentId: {
          economicEpochId: points.economicEpoch.id,
          studentId,
        },
      },
    }),
    prisma.weeklyStreakMilestone.findMany({
      where: {
        economicEpochId: points.economicEpoch.id,
        studentId,
      },
      orderBy: { milestoneWeeks: "asc" },
    }),
  ]);
  const earnedByWeeks = new Map(
    earnedMilestones.map((milestone) => [milestone.milestoneWeeks, milestone]),
  );

  return {
    economyV2Enabled: true as const,
    points: points.points,
    level: points.level,
    coins,
    streak: {
      currentWeeks: streak?.currentWeeks ?? 0,
      bestWeeks: streak?.bestWeeks ?? 0,
    },
    milestones: WEEKLY_STREAK_MILESTONES.map((milestone) => ({
      ...milestone,
      earned: earnedByWeeks.has(milestone.weeks),
      earnedAt: earnedByWeeks.get(milestone.weeks)?.earnedAt ?? null,
    })),
  };
}
