import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import { readStudentOfflineSummary } from "../../infrastructure/crm/crm-client.js";
import { LESSON_TOMORROW_PHRASES, PRACTICE_REMINDER_PHRASES, pickPhrase } from "../../domain/practice-phrases.js";
import { aqtobeDayOf } from "../../domain/student-today.js";
import { AQTOBE_OFFSET_MS } from "../../domain/teacher-today.js";
import { deliverUserNotification } from "./notification.service.js";

/**
 * Plan 5.6: every ten minutes — a «пора взять гитару» line to students whose reminder time has
 * come today, when there is no lesson today and no «позанимался» yet; and in the evening
 * «завтра урок в HH:MM». One of each a day, never the same line as yesterday.
 */
const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const LESSON_TOMORROW_HOUR = 19;

export function aqtobeMinutes(now: Date) {
  const local = new Date(now.getTime() + AQTOBE_OFFSET_MS);
  return { day: aqtobeDayOf(now), minutes: local.getUTCHours() * 60 + local.getUTCMinutes(), weekday: local.getUTCDay() };
}

export function timeToMinutes(time: string) {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

/** The reminder is due when its time has passed today, on a chosen day, and nothing was sent today. */
export function practiceReminderDue(input: {
  reminder: { enabled: boolean; time: string; days: number[]; lastSentAt: Date | null };
  now: Date;
  lessonToday: boolean;
  checkedInToday: boolean;
}) {
  const { day, minutes, weekday } = aqtobeMinutes(input.now);
  if (!input.reminder.enabled || input.lessonToday || input.checkedInToday) return false;
  if (!input.reminder.days.includes(weekday)) return false;
  if (minutes < timeToMinutes(input.reminder.time)) return false;
  if (input.reminder.lastSentAt && aqtobeDayOf(input.reminder.lastSentAt) === day) return false;
  return true;
}

function shiftDay(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00+05:00`);
  date.setUTCDate(date.getUTCDate() + delta);
  return aqtobeDayOf(date);
}

async function schoolPhrases() {
  const rows = await prisma.lessonTextTemplate.findMany({
    where: { kind: "practice_reminder", ownerId: null, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { text: true },
  });
  return rows.length ? rows.map((row) => row.text) : [...PRACTICE_REMINDER_PHRASES];
}

export async function sendPracticeReminders(now = new Date()) {
  const { day } = aqtobeMinutes(now);
  const reminders = await prisma.practiceReminder.findMany({
    where: { enabled: true, user: { ...notDeleted, isActive: true, role: { slug: "student" } } },
    include: { user: { select: { id: true, crmStudentId: true } } },
  });
  if (!reminders.length) return { practice: 0, tomorrow: 0 };
  const phrases = await schoolPhrases();
  let practice = 0;
  let tomorrow = 0;
  for (const reminder of reminders) {
    const lessons = reminder.user.crmStudentId
      ? await readStudentOfflineSummary(reminder.user.crmStudentId).then((read) => (
          Array.isArray(read.value.upcomingLessons) ? read.value.upcomingLessons as Array<{ date?: string; startTime?: string; status?: string }> : []
        )).catch(() => [] as Array<{ date?: string; startTime?: string; status?: string }>)
      : [];
    const scheduled = lessons.filter((lesson) => lesson.date && (!lesson.status || lesson.status === "scheduled"));
    const lessonToday = scheduled.some((lesson) => aqtobeDayOf(lesson.date!) === day);
    const checkin = await prisma.practiceCheckin.findUnique({ where: { userId_day: { userId: reminder.userId, day } } });
    if (practiceReminderDue({ reminder, now, lessonToday, checkedInToday: Boolean(checkin) })) {
      const previous = await prisma.userNotification.findFirst({
        where: { userId: reminder.userId, type: "practice_reminder" },
        orderBy: { createdAt: "desc" },
        select: { body: true },
      });
      const line = pickPhrase(phrases, day, reminder.userId, previous?.body ?? null);
      const result = await deliverUserNotification({
        userId: reminder.userId,
        type: "practice_reminder",
        title: "Пора взять гитару",
        body: line,
        url: "/dashboard",
        tag: "practice-reminder",
        dedupeKey: `practice-reminder:${reminder.userId}:${day}`,
      });
      await prisma.practiceReminder.update({ where: { userId: reminder.userId }, data: { lastSentAt: now } });
      if (!result.duplicate) practice += 1;
    }
    // «Завтра урок»: in the evening, once, with the lesson time.
    const { minutes } = aqtobeMinutes(now);
    const next = scheduled.find((lesson) => aqtobeDayOf(lesson.date!) === shiftDay(day, 1));
    if (next && minutes >= LESSON_TOMORROW_HOUR * 60) {
      const text = pickPhrase(LESSON_TOMORROW_PHRASES, day, reminder.userId).replace("{time}", next.startTime ?? "");
      const result = await deliverUserNotification({
        userId: reminder.userId,
        type: "lesson_tomorrow",
        title: "Завтра урок",
        body: text,
        url: "/school-lessons?tab=schedule",
        tag: "lesson-tomorrow",
        dedupeKey: `lesson-tomorrow:${reminder.userId}:${shiftDay(day, 1)}`,
      });
      if (!result.duplicate) tomorrow += 1;
    }
  }
  return { practice, tomorrow };
}

export function startPracticeReminderJob() {
  const run = () => {
    sendPracticeReminders().catch((error) => {
      console.error("practice reminder job failed", error);
    });
  };
  const initial = setTimeout(run, 90 * 1000);
  initial.unref();
  const interval = setInterval(run, CHECK_INTERVAL_MS);
  interval.unref();
  return () => {
    clearTimeout(initial);
    clearInterval(interval);
  };
}
