import type { UserNotificationType } from "@prisma/client";
import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import {
  fetchStudentOfflineSummary,
  fetchTeacherOfflineClasses,
} from "../../infrastructure/crm/crm-client.js";
import {
  dueLessonReminderRules,
  parseAqtobeLessonStart,
  type ReminderRule,
} from "./lesson-reminder.logic.js";
import { deliverUserNotification } from "./notification.service.js";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const DEDUPE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const AQTOBE_TIME_ZONE = "Asia/Aqtobe";

function compactString(value: unknown, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function personName(person: {
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
} | null | undefined) {
  if (!person) return "";
  return [person.firstName, person.lastName, person.middleName]
    .map((part) => compactString(part))
    .filter(Boolean)
    .join(" ");
}

function formatLessonTime(startsAt: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: AQTOBE_TIME_ZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(startsAt);
}

function isScheduledOfflineLesson(item: Record<string, unknown>) {
  return compactString(item.status).toLowerCase() === "scheduled";
}

function appendReminderQuery(url: string, rule: ReminderRule, startsAt: Date) {
  const separator = url.includes("?") ? "&" : "?";
  const occurrence = Math.floor(startsAt.getTime() / 60_000);
  return `${url}${separator}reminder=${rule.key}&at=${occurrence}`;
}

async function deliverLessonReminder(params: {
  userId: string;
  type: UserNotificationType;
  rule: ReminderRule;
  title: string;
  body: string;
  url: string;
  source: "offline" | "online";
  lessonId: string;
  startsAt: Date;
}) {
  const url = appendReminderQuery(params.url, params.rule, params.startsAt);
  return deliverUserNotification({
    userId: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    url,
    tag: `lesson-reminder-${params.source}-${params.lessonId}`,
    dedupeWindowMs: DEDUPE_WINDOW_MS,
  });
}

async function inBatches<T>(
  items: T[],
  batchSize: number,
  task: (item: T) => Promise<void>,
) {
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    await Promise.allSettled(batch.map(task));
  }
}

async function sendTeacherOfflineReminders(now: Date) {
  const teachers = await prisma.user.findMany({
    where: {
      ...notDeleted,
      isActive: true,
      crmTeacherId: { not: null },
      role: { slug: "teacher" },
    },
    select: { id: true, crmTeacherId: true },
  });
  // CRM stores a class as a calendar date plus a separate local time. Use
  // whole surrounding days in the API query, then narrow by exact start below.
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  await inBatches(teachers, 5, async (teacher) => {
    if (!teacher.crmTeacherId) return;
    const agenda = await fetchTeacherOfflineClasses(teacher.crmTeacherId, {
      from: from.toISOString(),
      to: to.toISOString(),
    });

    for (const item of agenda.classes) {
      if (!isScheduledOfflineLesson(item)) continue;
      const startsAt = parseAqtobeLessonStart(item.date, item.startTime);
      const crmClassId = compactString(item.crmClassId);
      if (!startsAt || !crmClassId) continue;

      const lessonTitle = compactString(item.title, "Урок");
      const room = item.room && typeof item.room === "object"
        ? compactString((item.room as Record<string, unknown>).name)
        : "";
      const group = item.group && typeof item.group === "object"
        ? compactString((item.group as Record<string, unknown>).name)
        : "";
      const context = [group, room].filter(Boolean).join(" · ");

      for (const rule of dueLessonReminderRules(startsAt, "teacher", now)) {
        await deliverLessonReminder({
          userId: teacher.id,
          type: "lesson_teacher_reminder",
          rule,
          title: `Урок начнётся через ${rule.label}`,
          body: `${lessonTitle} · ${formatLessonTime(startsAt)}${context ? ` · ${context}` : ""}. ${
            rule.key === "teacher-5m"
              ? "Откройте карточку и нажмите «Начать урок»."
              : "Проверьте план и последние результаты ученика."
          }`,
          url: `/admin/offline-lessons/${encodeURIComponent(crmClassId)}`,
          source: "offline",
          lessonId: crmClassId,
          startsAt,
        });
      }
    }
  });
}

async function sendStudentOfflineReminders(now: Date) {
  const students = await prisma.user.findMany({
    where: {
      ...notDeleted,
      isActive: true,
      crmStudentId: { not: null },
      role: { slug: "student" },
    },
    select: { id: true, crmStudentId: true },
  });

  await inBatches(students, 5, async (student) => {
    if (!student.crmStudentId) return;
    const summary = await fetchStudentOfflineSummary(student.crmStudentId);
    const upcomingLessons = Array.isArray(summary.upcomingLessons)
      ? summary.upcomingLessons as Array<Record<string, unknown>>
      : [];

    for (const item of upcomingLessons) {
      if (!isScheduledOfflineLesson(item)) continue;
      const startsAt = parseAqtobeLessonStart(item.date, item.startTime);
      const crmClassId = compactString(item.crmClassId);
      if (!startsAt || !crmClassId) continue;

      const lessonTitle = compactString(item.title, "Урок");
      const teacherName = compactString(item.teacherName);
      const roomName = compactString(item.roomName);
      const context = [teacherName, roomName].filter(Boolean).join(" · ");

      for (const rule of dueLessonReminderRules(startsAt, "student", now)) {
        await deliverLessonReminder({
          userId: student.id,
          type: "lesson_student_reminder",
          rule,
          title: `Напоминание: урок через ${rule.label}`,
          body: `${lessonTitle} · ${formatLessonTime(startsAt)}${context ? ` · ${context}` : ""}. Подготовьте инструмент и материалы к занятию.`,
          url: `/school-lessons?tab=upcoming&lesson=${encodeURIComponent(crmClassId)}`,
          source: "offline",
          lessonId: crmClassId,
          startsAt,
        });
      }
    }
  });
}

async function sendOnlineLessonReminders(now: Date) {
  const onlineLessons = await prisma.onlineLessonRequest.findMany({
    where: {
      status: "scheduled",
      scheduledAt: {
        gt: now,
        lte: new Date(now.getTime() + 25 * 60 * 60 * 1000),
      },
    },
    select: {
      id: true,
      studentId: true,
      teacherId: true,
      directionTitle: true,
      scheduledAt: true,
      student: {
        select: { firstName: true, lastName: true, middleName: true },
      },
      teacher: {
        select: { firstName: true, lastName: true, middleName: true },
      },
    },
  });

  for (const lesson of onlineLessons) {
    if (!lesson.scheduledAt) continue;
    const when = formatLessonTime(lesson.scheduledAt);
    const studentName = personName(lesson.student);
    const teacherName = personName(lesson.teacher);

    for (const rule of dueLessonReminderRules(lesson.scheduledAt, "student", now)) {
      await deliverLessonReminder({
        userId: lesson.studentId,
        type: "lesson_student_reminder",
        rule,
        title: `Онлайн-урок через ${rule.label}`,
        body: `${lesson.directionTitle} · ${when}${teacherName ? ` · ${teacherName}` : ""}. Zoom-ссылка доступна в карточке урока.`,
        url: `/online-lessons/${lesson.id}`,
        source: "online",
        lessonId: lesson.id,
        startsAt: lesson.scheduledAt,
      });
    }

    if (!lesson.teacherId) continue;
    for (const rule of dueLessonReminderRules(lesson.scheduledAt, "teacher", now)) {
      await deliverLessonReminder({
        userId: lesson.teacherId,
        type: "lesson_teacher_reminder",
        rule,
        title: `Онлайн-урок через ${rule.label}`,
        body: `${lesson.directionTitle} · ${when}${studentName ? ` · ${studentName}` : ""}. ${
          rule.key === "teacher-5m"
            ? "Откройте урок и подготовьтесь подключиться."
            : "Проверьте план занятия и Zoom-ссылку."
        }`,
        url: `/admin/online-lessons/${lesson.id}`,
        source: "online",
        lessonId: lesson.id,
        startsAt: lesson.scheduledAt,
      });
    }
  }
}

export async function sendLessonReminders(now = new Date()) {
  const results = await Promise.allSettled([
    sendTeacherOfflineReminders(now),
    sendStudentOfflineReminders(now),
    sendOnlineLessonReminders(now),
  ]);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[lesson-reminders]", result.reason);
    }
  }
}

export function startLessonReminderJob() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await sendLessonReminders();
    } catch (error) {
      console.error("[lesson-reminders]", error);
    } finally {
      running = false;
    }
  };
  const initialTimer = setTimeout(() => void run(), 40_000);
  initialTimer.unref();
  const interval = setInterval(() => void run(), CHECK_INTERVAL_MS);
  interval.unref();
}
