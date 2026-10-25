import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError } from "../../domain/errors.js";
import { PRACTICE_CHECKIN_REPLIES, pickPhrase } from "../../domain/practice-phrases.js";
import { aqtobeDayOf } from "../../domain/student-today.js";

/**
 * Plan 5.6: the student's practice reminder (days, time) and «позанимался» check-ins. No XP, no
 * Points — only the student's own streak of practice days.
 */
export const DEFAULT_REMINDER_TIME = "18:00";
export const DEFAULT_REMINDER_DAYS = [0, 1, 2, 3, 4, 5, 6];

export type PracticeReminderSettings = { enabled: boolean; time: string; days: number[] };

function normalizeTime(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) throw new BadRequestError("Время напоминания: ЧЧ:ММ", "PRACTICE_REMINDER_TIME_INVALID");
  return `${match[1]}:${match[2]}`;
}

function normalizeDays(days: number[]) {
  const unique = [...new Set(days.map((day) => Math.trunc(day)))].filter((day) => day >= 0 && day <= 6).sort((a, b) => a - b);
  if (!unique.length) throw new BadRequestError("Выберите хотя бы один день", "PRACTICE_REMINDER_DAYS_EMPTY");
  return unique;
}

export async function getPracticeReminder(userId: string): Promise<PracticeReminderSettings> {
  const row = await prisma.practiceReminder.findUnique({ where: { userId } });
  return row
    ? { enabled: row.enabled, time: row.time, days: row.days }
    : { enabled: false, time: DEFAULT_REMINDER_TIME, days: DEFAULT_REMINDER_DAYS };
}

export async function savePracticeReminder(userId: string, input: Partial<PracticeReminderSettings>) {
  const current = await getPracticeReminder(userId);
  const next = {
    enabled: input.enabled ?? current.enabled,
    time: normalizeTime(input.time ?? current.time),
    days: normalizeDays(input.days ?? current.days),
  };
  await prisma.practiceReminder.upsert({ where: { userId }, create: { userId, ...next }, update: next });
  return next;
}

/** Days practised in a row up to today (or yesterday, if today is not marked yet). */
export function practiceStreakDays(days: string[], today: string) {
  const set = new Set(days);
  const shift = (day: string, delta: number) => {
    const date = new Date(`${day}T12:00:00+05:00`);
    date.setUTCDate(date.getUTCDate() + delta);
    return aqtobeDayOf(date);
  };
  let cursor = set.has(today) ? today : shift(today, -1);
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = shift(cursor, -1);
  }
  return streak;
}

export async function getPracticeStatus(userId: string, now = new Date()) {
  const today = aqtobeDayOf(now);
  const rows = await prisma.practiceCheckin.findMany({
    where: { userId },
    orderBy: { day: "desc" },
    take: 120,
    select: { day: true },
  });
  const days = rows.map((row) => row.day);
  return {
    today,
    checkedInToday: days.includes(today),
    streakDays: practiceStreakDays(days, today),
    reminder: await getPracticeReminder(userId),
  };
}

/** «Позанимался»: one mark a day; the answer keeps the reminder's tone. */
export async function checkInPractice(userId: string, source = "home", now = new Date()) {
  const day = aqtobeDayOf(now);
  await prisma.practiceCheckin.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, source },
    update: {},
  });
  const status = await getPracticeStatus(userId, now);
  return { ...status, reply: pickPhrase(PRACTICE_CHECKIN_REPLIES, day, userId) };
}
