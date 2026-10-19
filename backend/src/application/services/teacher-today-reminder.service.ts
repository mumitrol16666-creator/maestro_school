import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import { AQTOBE_OFFSET_MS, aqtobeDateKey } from "../../domain/teacher-today.js";
import { deliverUserNotification } from "./notification.service.js";
import { getTeacherToday } from "./teacher-today.service.js";

/**
 * Overdue reminders for teachers, on top of the 10-minute report reminder:
 *
 * - a morning summary once a day (from 08:00 Aqtobe) when something waits:
 *   reports owed, proposals, unread messages, homework to check today;
 * - one reminder per student proposal that waited three days unanswered.
 *
 * Each is deduplicated by key, so a restart or a second instance never
 * repeats it.
 */

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const MORNING_HOUR = 8;
const EVENING_HOUR = 21;

function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function teacherMorningSummary(today: Awaited<ReturnType<typeof getTeacherToday>>) {
  const parts: string[] = [];
  const overdue = today.reports.filter((report) => report.overdue).length;
  if (today.lessons.length) {
    parts.push(`${today.lessons.length} ${plural(today.lessons.length, "урок", "урока", "уроков")} сегодня`);
  }
  if (overdue) parts.push(`просрочено отчётов: ${overdue}`);
  else if (today.reports.length) parts.push(`отчётов к отправке: ${today.reports.length}`);
  const homework = today.lessons.reduce((total, lesson) => total + lesson.homeworkToCheck, 0);
  if (homework) parts.push(`ДЗ проверить на уроках: ${homework}`);
  if (today.proposals.total) parts.push(`предложений учеников: ${today.proposals.total}`);
  if (today.messages.unread) parts.push(`непрочитанных сообщений: ${today.messages.unread}`);
  const needsAttention = Boolean(today.reports.length || today.proposals.total || today.messages.unread);
  return needsAttention && parts.length ? `${parts.join(", ")}.` : null;
}

export async function sendTeacherTodayReminders(now = new Date()) {
  const localHour = new Date(now.getTime() + AQTOBE_OFFSET_MS).getUTCHours();
  if (localHour < MORNING_HOUR || localHour >= EVENING_HOUR) return;
  const dateKey = aqtobeDateKey(now);
  const teachers = await prisma.user.findMany({
    where: { ...notDeleted, isActive: true, crmTeacherId: { not: null }, role: { slug: "teacher" } },
    select: { id: true },
  });

  for (const teacher of teachers) {
    const summaryKey = `teacher-today:${teacher.id}:${dateKey}`;
    const alreadySent = await prisma.userNotification.findUnique({ where: { dedupeKey: summaryKey }, select: { id: true } });
    const today = await getTeacherToday(teacher.id, { now }).catch(() => null);
    if (!today) continue;

    if (!alreadySent) {
      const body = teacherMorningSummary(today);
      if (body) {
        await deliverUserNotification({
          userId: teacher.id,
          type: "lesson_teacher_reminder",
          title: "Ваш день в Maestro",
          body,
          url: "/admin",
          tag: `teacher-today-${dateKey}`,
          dedupeKey: summaryKey,
        }).catch(() => undefined);
      }
    }

    for (const proposal of today.proposals.items.filter((item) => item.stale)) {
      await deliverUserNotification({
        userId: teacher.id,
        type: "sector_proposal_created",
        title: "Ученик ждёт ответа на предложение",
        body: `${proposal.studentName}: «${proposal.text.slice(0, 120)}». Ответьте в карточке ученика.`,
        url: `/admin/my-students/student/${encodeURIComponent(proposal.crmStudentId)}`,
        tag: `sector-proposal-stale-${proposal.id}`,
        dedupeKey: `sector-proposal-stale:${proposal.id}:${teacher.id}`,
      }).catch(() => undefined);
    }
  }
}

export function startTeacherTodayReminderJob() {
  const run = () => {
    void sendTeacherTodayReminders().catch((error) => {
      console.error("[teacher-today-reminders]", error);
    });
  };
  const initialTimer = setTimeout(run, 60_000);
  initialTimer.unref();
  const interval = setInterval(run, CHECK_INTERVAL_MS);
  interval.unref();
}
