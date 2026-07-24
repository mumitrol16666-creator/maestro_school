const REMINDER_WINDOW_MS = 7 * 60 * 1000;

export type ReminderAudience = "teacher" | "student";

export type ReminderRule = {
  key: "teacher-30m" | "teacher-5m" | "student-24h" | "student-2h";
  audience: ReminderAudience;
  leadMs: number;
  label: string;
};

const REMINDER_RULES: readonly ReminderRule[] = [
  { key: "teacher-30m", audience: "teacher", leadMs: 30 * 60 * 1000, label: "30 минут" },
  { key: "teacher-5m", audience: "teacher", leadMs: 5 * 60 * 1000, label: "5 минут" },
  { key: "student-24h", audience: "student", leadMs: 24 * 60 * 60 * 1000, label: "24 часа" },
  { key: "student-2h", audience: "student", leadMs: 2 * 60 * 60 * 1000, label: "2 часа" },
] as const;

export function parseAqtobeLessonStart(dateValue: unknown, startTimeValue: unknown) {
  const date = String(dateValue ?? "").trim().slice(0, 10);
  const startTime = String(startTimeValue ?? "").trim().slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime)) return null;
  const parsed = new Date(`${date}T${startTime}:00+05:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function dueLessonReminderRules(
  startsAt: Date,
  audience: ReminderAudience,
  now = new Date(),
) {
  const untilStartMs = startsAt.getTime() - now.getTime();
  if (untilStartMs <= 0) return [];
  return REMINDER_RULES.filter((rule) => (
    rule.audience === audience
    && untilStartMs <= rule.leadMs
    && untilStartMs > rule.leadMs - REMINDER_WINDOW_MS
  ));
}
