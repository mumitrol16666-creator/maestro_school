import type { LeagueXpSourceType } from "@prisma/client";

const AQTOBE_OFFSET_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const WEEKLY_LEAGUE_GOAL_XP = 80;
export const WEEKLY_LEAGUE_RULES = [
  { sourceType: "offline_lesson", label: "Посещение урока в школе", xp: 20 },
  { sourceType: "online_lesson", label: "Завершённый онлайн-урок", xp: 20 },
  { sourceType: "course_homework", label: "Принятое ДЗ в курсе (до)", xp: 15 },
  { sourceType: "online_assignment", label: "ДЗ после онлайн-урока (до)", xp: 15 },
  { sourceType: "prepared_test", label: "Пройденный тест (до)", xp: 20 },
  { sourceType: "monthly_plan", label: "Освоенная тема плана", xp: 3 },
] as const;

export const WEEKLY_LEAGUE_PRIZES = [
  { position: 1, awardType: "first_place", coins: 15, label: "1 место" },
  { position: 2, awardType: "second_place", coins: 10, label: "2 место" },
  { position: 3, awardType: "third_place", coins: 7, label: "3 место" },
] as const;

export const weeklyLeagueSourceLabels: Record<LeagueXpSourceType, string> = {
  offline_lesson: "Уроки в школе",
  online_lesson: "Онлайн-уроки",
  course_homework: "Домашние задания курса",
  online_assignment: "ДЗ после онлайн-уроков",
  prepared_test: "Тесты",
  monthly_plan: "Темы месячного плана",
  teacher_bonus: "Бонус преподавателя",
};

export type AqtobeWeekRange = {
  start: Date;
  end: Date;
  key: string;
};

function localDateKey(date: Date) {
  const local = new Date(date.getTime() + AQTOBE_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = String(local.getUTCMonth() + 1).padStart(2, "0");
  const day = String(local.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getAqtobeWeekRange(now = new Date(), weekOffset = 0): AqtobeWeekRange {
  const normalizedOffset = Math.max(0, Math.trunc(weekOffset));
  const local = new Date(now.getTime() + AQTOBE_OFFSET_MS);
  const weekdayFromMonday = (local.getUTCDay() + 6) % 7;
  const currentStartLocal = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() - weekdayFromMonday,
  );
  const start = new Date(currentStartLocal - AQTOBE_OFFSET_MS - normalizedOffset * WEEK_MS);
  const end = new Date(start.getTime() + WEEK_MS);
  return { start, end, key: localDateKey(start) };
}

export function privateLeagueName(firstName: string, lastName: string) {
  const first = firstName.trim() || "Ученик";
  const initial = lastName.trim().slice(0, 1).toLocaleUpperCase("ru-RU");
  return initial ? `${first} ${initial}.` : first;
}

export function weeklyLeagueWeekLabel(range: AqtobeWeekRange) {
  const format = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Aqtobe",
    day: "numeric",
    month: "long",
  });
  const lastMoment = new Date(range.end.getTime() - 1);
  return `${format.format(range.start)} — ${format.format(lastMoment)}`;
}

export function calculateLeagueRankDelta(currentPosition: number, previousPosition?: number | null) {
  return previousPosition == null ? null : previousPosition - currentPosition;
}

export function courseHomeworkLeagueXp(submissionAttempts: number) {
  return submissionAttempts > 1 ? 10 : 15;
}

export function onlineAssignmentLeagueXp(params: { late: boolean; withRemarks: boolean }) {
  if (params.late) return 5;
  return params.withRemarks ? 10 : 15;
}

export function preparedTestLeagueXp(attemptNumber: number) {
  return attemptNumber === 1 ? 20 : 10;
}

type RankedEvent = {
  studentId: string;
  amount: number;
  sourceType: LeagueXpSourceType;
  createdAt: Date;
  description: string;
  student: {
    firstName: string;
    lastName: string;
  };
};

export type RankedStudent = {
  position: number;
  studentId: string;
  displayName: string;
  xp: number;
  eventCount: number;
  lastEventAt: Date;
};

export function rankLeagueEvents(events: RankedEvent[]): RankedStudent[] {
  const byStudent = new Map<string, Omit<RankedStudent, "position">>();
  for (const event of events) {
    const existing = byStudent.get(event.studentId);
    if (existing) {
      existing.xp += event.amount;
      existing.eventCount += 1;
      if (event.createdAt > existing.lastEventAt) existing.lastEventAt = event.createdAt;
      continue;
    }
    byStudent.set(event.studentId, {
      studentId: event.studentId,
      displayName: privateLeagueName(event.student.firstName, event.student.lastName),
      xp: event.amount,
      eventCount: 1,
      lastEventAt: event.createdAt,
    });
  }

  return [...byStudent.values()]
    .sort((left, right) => (
      right.xp - left.xp
      || right.eventCount - left.eventCount
      || left.lastEventAt.getTime() - right.lastEventAt.getTime()
      || left.displayName.localeCompare(right.displayName, "ru")
    ))
    .map((entry, index) => ({ ...entry, position: index + 1 }));
}
