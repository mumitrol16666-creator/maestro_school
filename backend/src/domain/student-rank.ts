export type StudentRank = {
  code: string;
  title: string;
  minPoints: number;
};

export const STUDENT_RANKS: StudentRank[] = [
  { code: "first_strings", title: "Первые струны", minPoints: 0 },
  { code: "rhythm", title: "Ритм", minPoints: 100 },
  { code: "chord", title: "Аккорд", minPoints: 300 },
  { code: "musician", title: "Музыкант", minPoints: 600 },
  { code: "performer", title: "Исполнитель", minPoints: 1000 },
  { code: "maestro", title: "Маэстро", minPoints: 1500 },
];

export function getStudentRank(points: number) {
  const safePoints = Math.max(0, Math.floor(points));
  let index = 0;
  for (let i = 0; i < STUDENT_RANKS.length; i += 1) {
    if (safePoints >= STUDENT_RANKS[i].minPoints) index = i;
  }

  const current = STUDENT_RANKS[index];
  const next = STUDENT_RANKS[index + 1] ?? null;
  if (!next) {
    return {
      current,
      next,
      points: safePoints,
      pointsToNext: 0,
      progressPercent: 100,
      isMaxRank: true,
    };
  }

  const range = next.minPoints - current.minPoints;
  const progress = safePoints - current.minPoints;
  return {
    current,
    next,
    points: safePoints,
    pointsToNext: Math.max(0, next.minPoints - safePoints),
    progressPercent: Math.max(0, Math.min(100, Math.round((progress / range) * 100))),
    isMaxRank: false,
  };
}
