/**
 * Pure rules of the teacher's «Сегодня» screen: which lessons are today's,
 * which reports are still open and when they become overdue, which proposals
 * have waited too long, whose birthday is near. Everything in Aqtobe time.
 */

export const AQTOBE_OFFSET_MS = 5 * 60 * 60 * 1000;
/** A report is overdue a day after the lesson ended. */
export const REPORT_OVERDUE_MS = 24 * 60 * 60 * 1000;
/** A student proposal waits for an answer at most three days. */
export const PROPOSAL_STALE_MS = 3 * 24 * 60 * 60 * 1000;
export const BIRTHDAY_WINDOW_DAYS = 7;

/** Statuses after which the teacher has nothing left to send. */
const CLOSED_LESSON_STATUSES = new Set(["pending_admin_review", "pending_sync", "completed", "cancelled"]);

export function aqtobeDateKey(date: Date) {
  return new Date(date.getTime() + AQTOBE_OFFSET_MS).toISOString().slice(0, 10);
}

export function aqtobeDateTime(dateValue: unknown, timeValue: unknown) {
  const date = String(dateValue ?? "").slice(0, 10);
  const time = String(timeValue ?? "").slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const parsed = new Date(`${date}T${time}:00+05:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type TodayLessonPhase = "upcoming" | "now" | "ended";

export function lessonPhase(lesson: { date: unknown; startTime: unknown; endTime: unknown }, now: Date): TodayLessonPhase {
  const start = aqtobeDateTime(lesson.date, lesson.startTime);
  const end = aqtobeDateTime(lesson.date, lesson.endTime);
  if (end && now >= end) return "ended";
  if (start && now >= start) return "now";
  return "upcoming";
}

/**
 * A lesson whose report the teacher still owes: it has ended and was neither
 * sent nor cancelled. «Урок не состоялся» and «все отсутствовали» are sent
 * reports as well, so they are closed here too.
 */
export function openReport(
  lesson: { date?: unknown; endTime?: unknown; status?: unknown },
  now: Date,
) {
  if (CLOSED_LESSON_STATUSES.has(String(lesson.status ?? ""))) return null;
  const end = aqtobeDateTime(lesson.date, lesson.endTime);
  if (!end || now < end) return null;
  const waitedMs = now.getTime() - end.getTime();
  return { endedAt: end, waitedMs, overdue: waitedMs >= REPORT_OVERDUE_MS };
}

export function proposalStale(createdAt: Date, now: Date) {
  return now.getTime() - createdAt.getTime() >= PROPOSAL_STALE_MS;
}

/**
 * Days until the next birthday, 0 = today, or null when it is further than
 * the window or the date is unknown. 29 February counts on 28 February in
 * a common year.
 */
export function daysUntilBirthday(dateOfBirth: string | null | undefined, now: Date, windowDays = BIRTHDAY_WINDOW_DAYS) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth ?? "");
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const todayKey = aqtobeDateKey(now);
  const today = Date.UTC(Number(todayKey.slice(0, 4)), Number(todayKey.slice(5, 7)) - 1, Number(todayKey.slice(8, 10)));
  const year = Number(todayKey.slice(0, 4));
  for (const candidateYear of [year, year + 1]) {
    const leap = (candidateYear % 4 === 0 && candidateYear % 100 !== 0) || candidateYear % 400 === 0;
    const effectiveDay = month === 2 && day === 29 && !leap ? 28 : day;
    const candidate = Date.UTC(candidateYear, month - 1, effectiveDay);
    const days = Math.round((candidate - today) / 86_400_000);
    if (days >= 0) return days <= windowDays ? days : null;
  }
  return null;
}

/** Age the student turns on that birthday, when the year is known. */
export function birthdayAge(dateOfBirth: string, now: Date, daysUntil: number) {
  const year = Number(dateOfBirth.slice(0, 4));
  if (!year) return null;
  const target = new Date(now.getTime() + AQTOBE_OFFSET_MS + daysUntil * 86_400_000);
  return target.getUTCFullYear() - year;
}
