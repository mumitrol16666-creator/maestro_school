import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import { fetchTeacherOfflineClasses } from "../../infrastructure/crm/crm-client.js";
import { deliverUserNotification } from "./notification.service.js";

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const FIRST_REMINDER_DELAY_MS = 30 * 60 * 1000;

function aqtobeLessonEnd(dateValue: unknown, endTimeValue: unknown) {
  const date = String(dateValue ?? "").slice(0, 10);
  const endTime = String(endTimeValue ?? "").slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(endTime)) return null;
  const parsed = new Date(`${date}T${endTime}:00+05:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isReportOpen(item: Record<string, unknown>) {
  return !["pending_admin_review", "completed", "cancelled"].includes(String(item.status ?? ""));
}

async function inBatches<T>(items: T[], batchSize: number, task: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += batchSize) {
    await Promise.allSettled(items.slice(index, index + batchSize).map(task));
  }
}

export async function sendOfflineReportReminders() {
  const teachers = await prisma.user.findMany({
    where: {
      ...notDeleted,
      isActive: true,
      crmTeacherId: { not: null },
      role: { slug: "teacher" },
    },
    select: { id: true, crmTeacherId: true },
  });
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 2);
  const to = new Date(now);
  to.setDate(to.getDate() + 1);

  await inBatches(teachers, 5, async (teacher) => {
    if (!teacher.crmTeacherId) return;
    const agenda = await fetchTeacherOfflineClasses(teacher.crmTeacherId, {
      from: from.toISOString(),
      to: to.toISOString(),
    }).catch(() => null);
    if (!agenda) return;

    for (const item of agenda.classes) {
      if (!isReportOpen(item)) continue;
      const lessonEnd = aqtobeLessonEnd(item.date, item.endTime);
      if (!lessonEnd || now.getTime() < lessonEnd.getTime() + FIRST_REMINDER_DELAY_MS) continue;
      const crmClassId = String(item.crmClassId ?? "");
      if (!crmClassId) continue;
      const title = String(item.title ?? "Урок");
      const overdueMinutes = Math.floor((now.getTime() - lessonEnd.getTime()) / 60000);
      const overdueText = overdueMinutes < 120
        ? `${overdueMinutes} мин`
        : overdueMinutes < 24 * 60
          ? `${Math.floor(overdueMinutes / 60)} ч`
          : `${Math.floor(overdueMinutes / (24 * 60))} дн`;

      await deliverUserNotification({
        userId: teacher.id,
        type: "offline_lesson_report_due",
        title: "Закройте отчёт по уроку",
        body: `${title}. После окончания прошло ${overdueText}. Заполните учебный итог и отправьте его администратору.`,
        url: `/admin/offline-lessons/${encodeURIComponent(crmClassId)}`,
        tag: `offline-report-due-${crmClassId}`,
        dedupeWindowMs: 6 * 60 * 60 * 1000,
      }).catch(() => undefined);
    }
  });
}

export function startOfflineReportReminderJob() {
  const run = () => {
    void sendOfflineReportReminders().catch((error) => {
      console.error("[offline-report-reminders]", error);
    });
  };
  const initialTimer = setTimeout(run, 20_000);
  initialTimer.unref();
  const interval = setInterval(run, CHECK_INTERVAL_MS);
  interval.unref();
}
