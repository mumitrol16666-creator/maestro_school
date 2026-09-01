export type ProductLevel = {
  level: number;
  code: `level_${number}`;
  title: `LEVEL ${number}`;
  minPoints: number;
  tone: ProductLevelTone;
  emblem: ProductLevelEmblem;
};

export type ProductLevelTone =
  | "graphite"
  | "silver"
  | "green"
  | "emerald"
  | "gold"
  | "amber"
  | "orange"
  | "fire_orange"
  | "crimson"
  | "red";

export type ProductLevelEmblem =
  | "disc"
  | "square"
  | "diamond"
  | "hexagon"
  | "pentagon"
  | "shield"
  | "octagon"
  | "notched"
  | "crest"
  | "crown";

export const PRODUCT_LEVELS: ProductLevel[] = [
  { level: 1, code: "level_1", title: "LEVEL 1", minPoints: 0, tone: "graphite", emblem: "disc" },
  { level: 2, code: "level_2", title: "LEVEL 2", minPoints: 300, tone: "silver", emblem: "square" },
  { level: 3, code: "level_3", title: "LEVEL 3", minPoints: 800, tone: "green", emblem: "diamond" },
  { level: 4, code: "level_4", title: "LEVEL 4", minPoints: 1_500, tone: "emerald", emblem: "hexagon" },
  { level: 5, code: "level_5", title: "LEVEL 5", minPoints: 2_500, tone: "gold", emblem: "pentagon" },
  { level: 6, code: "level_6", title: "LEVEL 6", minPoints: 3_800, tone: "amber", emblem: "shield" },
  { level: 7, code: "level_7", title: "LEVEL 7", minPoints: 5_400, tone: "orange", emblem: "octagon" },
  { level: 8, code: "level_8", title: "LEVEL 8", minPoints: 7_300, tone: "fire_orange", emblem: "notched" },
  { level: 9, code: "level_9", title: "LEVEL 9", minPoints: 9_500, tone: "crimson", emblem: "crest" },
  { level: 10, code: "level_10", title: "LEVEL 10", minPoints: 12_000, tone: "red", emblem: "crown" },
];

export const TOPIC_COMPLETION_POINTS = 100;
export const NON_EMPTY_PLAN_COMPLETION_POINTS = 250;

export function getProductLevel(points: number) {
  const safePoints = Math.max(0, Math.floor(points));
  let index = 0;
  for (let current = 0; current < PRODUCT_LEVELS.length; current += 1) {
    if (safePoints >= PRODUCT_LEVELS[current].minPoints) index = current;
  }

  const level = PRODUCT_LEVELS[index];
  const next = PRODUCT_LEVELS[index + 1] ?? null;
  const range = next ? next.minPoints - level.minPoints : 0;
  const earnedWithinLevel = Math.max(0, safePoints - level.minPoints);
  return {
    level,
    next,
    levels: PRODUCT_LEVELS,
    points: safePoints,
    pointsToNext: next ? next.minPoints - safePoints : 0,
    earnedWithinLevel,
    requiredWithinLevel: range,
    progressPercent: next
      ? Math.max(0, Math.min(100, Math.round(earnedWithinLevel / range * 100)))
      : 100,
    isMaxLevel: next === null,
  };
}

export type ProductPointsParticipant = {
  studentId: string;
  displayName: string;
  points: number;
};

/** Competition ranking: equal balances share a position (1, 1, 3). */
export function rankProductPoints(participants: ProductPointsParticipant[]) {
  let previousPoints: number | null = null;
  let previousPosition = 0;
  return participants
    .map((participant) => ({
      ...participant,
      points: Math.max(0, Math.floor(participant.points)),
    }))
    .sort((left, right) => (
      right.points - left.points
      || left.displayName.localeCompare(right.displayName, "ru")
      || left.studentId.localeCompare(right.studentId)
    ))
    .map((participant, index) => {
      const position = previousPoints === participant.points
        ? previousPosition
        : index + 1;
      previousPoints = participant.points;
      previousPosition = position;
      return { ...participant, position };
    });
}

export function pointsForCompletedPlan(topicCount: number) {
  const normalizedTopics = Math.max(0, Math.floor(topicCount));
  if (normalizedTopics === 0) return 0;
  return normalizedTopics * TOPIC_COMPLETION_POINTS + NON_EMPTY_PLAN_COMPLETION_POINTS;
}

export function simulateLearningPace(topicCount: number, months = 12) {
  const normalizedMonths = Math.max(0, Math.floor(months));
  const pointsPerMonth = pointsForCompletedPlan(topicCount);
  const points = pointsPerMonth * normalizedMonths;
  const level10Threshold = PRODUCT_LEVELS.at(-1)?.minPoints ?? 0;
  return {
    topicCount: Math.max(0, Math.floor(topicCount)),
    months: normalizedMonths,
    pointsPerMonth,
    points,
    resultingLevel: getProductLevel(points).level.level,
    monthsToLevel10: pointsPerMonth > 0 ? Math.ceil(level10Threshold / pointsPerMonth) : null,
  };
}
