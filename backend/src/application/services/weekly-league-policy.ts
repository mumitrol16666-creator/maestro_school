import type { LeagueXpSourceType } from "@prisma/client";

const AQTOBE_OFFSET_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const WEEKLY_LEAGUE_GOAL_XP = 80;
export const WEEKLY_LESSON_ATTENDANCE_XP = 20;
export const WEEKLY_LESSON_ATTENDANCE_COINS = 50;
export const WEEKLY_LESSON_ATTENDANCE_LIMIT = 2;
export const WEEKLY_HOMEWORK_FIRST_ATTEMPT_XP = 15;
export const WEEKLY_HOMEWORK_REVISION_XP = 10;
export const WEEKLY_HOMEWORK_DIRECTION_LIMIT = 3;
export const WEEKLY_PREPARED_TEST_FIRST_ATTEMPT_XP = 20;
export const WEEKLY_PREPARED_TEST_RETRY_XP = 10;
export const WEEKLY_PREPARED_TEST_LIMIT = 2;
export const WEEKLY_TEACHER_BONUS_LIMIT = 10;
export const WEEKLY_LEAGUE_GOAL_COINS = 25;
export const WEEKLY_LEAGUE_RULES_VERSION = "economy-v2-dev05d";
export const WEEKLY_STREAK_MILESTONES = [
  { weeks: 4, coins: 50, title: "Серия 4 недели" },
  { weeks: 8, coins: 100, title: "Серия 8 недель" },
  { weeks: 12, coins: 150, title: "Серия 12 недель" },
  { weeks: 24, coins: 250, title: "Серия 24 недели" },
  { weeks: 52, coins: 500, title: "Серия 52 недели" },
] as const;
export const WEEKLY_LEAGUE_RULES = [
  { sourceType: "offline_lesson", label: "Подтверждённый урок", xp: 20, weeklyLimit: 2 },
  { sourceType: "learning_homework", label: "Принятое ДЗ", xp: 15, retryXp: 10, weeklyLimit: 3 },
  { sourceType: "prepared_test", label: "Пройденный тест", xp: 20, retryXp: 10, weeklyLimit: 2 },
  { sourceType: "teacher_bonus", label: "Бонус преподавателя", xp: 10, weeklyLimit: 10 },
] as const;

export const WEEKLY_LEAGUE_PRIZES = [
  { position: 1, awardType: "first_place", coins: 150, label: "1 место" },
  { position: 2, awardType: "second_place", coins: 100, label: "2 место" },
  { position: 3, awardType: "third_place", coins: 50, label: "3 место" },
] as const;

export const LEGACY_WEEKLY_LEAGUE_PRIZES = [
  { position: 1, awardType: "first_place", coins: 15, label: "1 место" },
  { position: 2, awardType: "second_place", coins: 10, label: "2 место" },
  { position: 3, awardType: "third_place", coins: 7, label: "3 место" },
] as const;

export const weeklyLeagueSourceLabels: Record<LeagueXpSourceType, string> = {
  offline_lesson: "Уроки с преподавателем",
  online_lesson: "Онлайн-уроки",
  learning_homework: "Домашние задания",
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
  return submissionAttempts > 1
    ? WEEKLY_HOMEWORK_REVISION_XP
    : WEEKLY_HOMEWORK_FIRST_ATTEMPT_XP;
}

export function onlineAssignmentLeagueXp(submissionAttempts: number) {
  return courseHomeworkLeagueXp(submissionAttempts);
}

export function preparedTestLeagueXp(attemptNumber: number) {
  return attemptNumber === 1
    ? WEEKLY_PREPARED_TEST_FIRST_ATTEMPT_XP
    : WEEKLY_PREPARED_TEST_RETRY_XP;
}

export function lessonAttendanceXpForWeek(awardedLessonCount: number) {
  return awardedLessonCount < WEEKLY_LESSON_ATTENDANCE_LIMIT
    ? WEEKLY_LESSON_ATTENDANCE_XP
    : 0;
}

export function nextWeeklyStreak(params: {
  currentWeeks: number;
  bestWeeks: number;
  hasActivity: boolean;
  frozen: boolean;
}) {
  if (params.hasActivity) {
    const currentWeeks = params.currentWeeks + 1;
    return {
      eventType: "extended" as const,
      currentWeeks,
      bestWeeks: Math.max(params.bestWeeks, currentWeeks),
    };
  }
  if (params.frozen) {
    return {
      eventType: "frozen" as const,
      currentWeeks: params.currentWeeks,
      bestWeeks: params.bestWeeks,
    };
  }
  return {
    eventType: "broken" as const,
    currentWeeks: 0,
    bestWeeks: params.bestWeeks,
  };
}

export function weeklyStreakMilestone(weeks: number) {
  return WEEKLY_STREAK_MILESTONES.find((milestone) => milestone.weeks === weeks) ?? null;
}

export type WeeklyLeaguePhase = "live" | "finalizing" | "finalized";

export function weeklyLeagueFinalizesAt(range: AqtobeWeekRange) {
  return new Date(range.end.getTime() + 12 * 60 * 60 * 1000);
}

export function weeklyLeaguePhase(params: {
  range: AqtobeWeekRange;
  now: Date;
  hasSnapshot: boolean;
}): WeeklyLeaguePhase {
  if (params.hasSnapshot) return "finalized";
  if (params.now < params.range.end) return "live";
  return "finalizing";
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
