import type { UserNotificationType } from "@prisma/client";
import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";
import { NotFoundError } from "../../domain/errors.js";
import { formatFio } from "../../domain/name.js";
import {
  parentBalanceAlert,
  parentOfflineEventType,
  shouldNotifyParentForOfflineEvent,
} from "../../domain/parent-notification-policy.js";
import { findUserByCrmStudentId, findUserByCrmTeacherId } from "../repositories/user-link.repository.js";
import { sendPushToUser } from "./push-notification.service.js";
import { getStudentSchoolOfflineSummary } from "./school-offline.service.js";

export async function createUserNotification(params: {
  userId: string;
  type: UserNotificationType;
  title: string;
  body: string;
  url?: string | null;
  dedupeKey?: string | null;
}) {
  return prisma.userNotification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      url: params.url ?? null,
      dedupeKey: params.dedupeKey ?? null,
    },
  });
}

/**
 * Store an in-app notification and best-effort deliver the same event as a
 * browser push. The in-app record is the source of truth, so a missing push
 * subscription never prevents the business operation from completing.
 */
export async function deliverUserNotification(params: {
  userId: string;
  type: UserNotificationType;
  title: string;
  body: string;
  url?: string | null;
  tag?: string;
  dedupeKey?: string;
  dedupeWindowMs?: number;
}) {
  if (params.dedupeKey) {
    const duplicate = await prisma.userNotification.findUnique({
      where: { dedupeKey: params.dedupeKey },
    });
    if (duplicate) {
      return { notification: duplicate, duplicate: true as const };
    }
  }

  if (params.dedupeWindowMs && params.url) {
    const duplicate = await prisma.userNotification.findFirst({
      where: {
        userId: params.userId,
        type: params.type,
        url: params.url,
        createdAt: { gte: new Date(Date.now() - params.dedupeWindowMs) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (duplicate) {
      return { notification: duplicate, duplicate: true as const };
    }
  }

  let notification;
  try {
    notification = await createUserNotification(params);
  } catch (error) {
    if (params.dedupeKey) {
      const duplicate = await prisma.userNotification.findUnique({
        where: { dedupeKey: params.dedupeKey },
      });
      if (duplicate) {
        return { notification: duplicate, duplicate: true as const };
      }
    }
    throw error;
  }
  await sendPushToUser(params.userId, {
    title: params.title,
    body: params.body,
    url: params.url ?? undefined,
    tag: params.tag,
  }).catch(() => undefined);

  return { notification, duplicate: false as const };
}

export async function deliverNotificationsToUsers(
  userIds: string[],
  params: Omit<Parameters<typeof deliverUserNotification>[0], "userId">,
) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  return Promise.all(uniqueIds.map((userId) => deliverUserNotification({ userId, ...params })));
}

export async function listUsersWithPermission(permissionCode: string) {
  return prisma.user.findMany({
    where: {
      ...notDeleted,
      isActive: true,
      role: { rolePermissions: { some: { permission: { code: permissionCode } } } },
    },
    select: { id: true },
  });
}

export async function countUnreadNotifications(userId: string, type?: UserNotificationType) {
  return prisma.userNotification.count({
    where: { userId, readAt: null, ...(type ? { type } : {}) },
  });
}

export async function listUserNotifications(userId: string, limit = 20) {
  return prisma.userNotification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      url: true,
      readAt: true,
      createdAt: true,
    },
  });
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const item = await prisma.userNotification.findFirst({
    where: { id: notificationId, userId },
  });
  if (!item) throw new NotFoundError("Notification");
  if (item.readAt) return item;

  return prisma.userNotification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string, type?: UserNotificationType) {
  await prisma.userNotification.updateMany({
    where: { userId, readAt: null, ...(type ? { type } : {}) },
    data: { readAt: new Date() },
  });
}

export type OfflineLessonNotificationEvent =
  | "approved"
  | "returned"
  | "cancelled"
  | "rescheduled";

type ParentLessonSummary = {
  crmClassId?: string;
  title?: string;
  date?: string;
  attended?: boolean | null;
  homework?: string | null;
  homeworkResult?: {
    status?: "completed" | "partial" | "not_completed";
    completionPercent?: number | null;
    reviewedAt?: string | Date | null;
  } | null;
};

type ParentOfflineSummary = {
  lessonHistory?: ParentLessonSummary[];
  balanceSnapshot?: {
    classesRemainingTotal?: number | null;
    debtAmountKzt?: number | null;
  };
};

const homeworkStatusText = {
  completed: "выполнено",
  partial: "выполнено частично",
  not_completed: "не выполнено",
} as const;

function shortened(value: string, maxLength = 140) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength
    ? `${compact.slice(0, maxLength - 1).trimEnd()}…`
    : compact;
}

function familyNotificationUrl(
  studentId: string,
  notice: string,
  identity?: string | number | null,
) {
  const query = new URLSearchParams({ student: studentId, notice });
  if (identity !== undefined && identity !== null && String(identity)) {
    query.set("event", String(identity));
  }
  return `/family?${query.toString()}`;
}

async function notifyParentsAboutApprovedLesson(params: {
  student: NonNullable<Awaited<ReturnType<typeof findUserByCrmStudentId>>>;
  parentUserIds: string[];
  crmClassId: string;
  lessonTitle: string;
  context: string;
}) {
  let summary: ParentOfflineSummary | null = null;
  const localCheck = params.student.crmStudentId
    ? await prisma.offlineLessonStudentCheck.findUnique({
        where: {
          crmClassId_crmStudentId: {
            crmClassId: params.crmClassId,
            crmStudentId: params.student.crmStudentId,
          },
        },
        select: {
          attendanceStatus: true,
          homeworkStatus: true,
          homeworkCompletionPercent: true,
        },
      }).catch(() => null)
    : null;
  try {
    summary = await getStudentSchoolOfflineSummary(params.student.id) as ParentOfflineSummary;
  } catch {
    // The CRM event may arrive before the enriched summary is available. The
    // core lesson notification still goes out with safe fallback copy.
  }

  const childName = formatFio(params.student) || "ученика";
  const lessons = Array.isArray(summary?.lessonHistory) ? summary.lessonHistory : [];
  const currentLesson = lessons.find((lesson) => lesson.crmClassId === params.crmClassId);
  const attended = currentLesson?.attended ?? (
    localCheck
      ? ["present", "late"].includes(localCheck.attendanceStatus)
      : undefined
  );
  const reviewedHomework = lessons
    .filter((lesson) => lesson.homeworkResult?.reviewedAt)
    .sort((left, right) => (
      new Date(right.homeworkResult!.reviewedAt!).getTime()
      - new Date(left.homeworkResult!.reviewedAt!).getTime()
    ))[0];
  const homeworkResult = reviewedHomework?.homeworkResult;
  const localHomeworkStatus = localCheck && ["completed", "partial", "not_completed"].includes(
    localCheck.homeworkStatus,
  )
    ? localCheck.homeworkStatus as keyof typeof homeworkStatusText
    : undefined;
  const homeworkStatus = homeworkResult?.status ?? localHomeworkStatus;
  const homeworkCompletionPercent = homeworkResult?.completionPercent
    ?? localCheck?.homeworkCompletionPercent;
  const homeworkReviewCopy = homeworkStatus
    ? ` Прошлое ДЗ: ${homeworkStatusText[homeworkStatus]}${
        homeworkCompletionPercent == null ? "" : ` · ${homeworkCompletionPercent}%`
      }.`
    : "";
  const reportType = attended === false
    ? parentOfflineEventType("approved", false)
    : homeworkStatus
      ? "parent_homework_reviewed" as const
      : parentOfflineEventType("approved", attended);
  const reportTitle = attended === false
    ? `Пропуск занятия: ${childName}`
    : homeworkStatus
      ? `Итог урока и ДЗ: ${childName}`
      : `Готов итог урока: ${childName}`;
  const homework = currentLesson?.homework?.trim();
  const reportBody = attended === false
    ? `${params.lessonTitle}${params.context}. Ученик отмечен как отсутствовавший. Подробности доступны в семейном кабинете.`
    : `${params.lessonTitle}${params.context}. Итог занятия готов.${homeworkReviewCopy}${homework ? ` Новое ДЗ: ${shortened(homework)}.` : ""}`;

  if (reportType) {
    await Promise.allSettled(params.parentUserIds.map((parentUserId) => deliverUserNotification({
      userId: parentUserId,
      type: reportType,
      title: reportTitle,
      body: reportBody,
      url: familyNotificationUrl(
        params.student.id,
        attended === false ? "absence" : homeworkStatus ? "homework" : "report",
        params.crmClassId,
      ),
      tag: `parent-lesson-${params.crmClassId}-${params.student.id}`,
      dedupeWindowMs: 14 * 24 * 60 * 60 * 1000,
    })));
  }

  const balanceAlert = summary?.balanceSnapshot
    ? parentBalanceAlert(summary.balanceSnapshot)
    : null;
  if (balanceAlert) {
    await Promise.allSettled(params.parentUserIds.map((parentUserId) => deliverUserNotification({
      userId: parentUserId,
      type: "parent_balance_alert",
      title: `${balanceAlert.title}: ${childName}`,
      body: `${balanceAlert.body} Информация об абонементе доступна в семейном кабинете.`,
      url: familyNotificationUrl(
        params.student.id,
        "balance",
        `${balanceAlert.kind}-${balanceAlert.value}`,
      ),
      tag: `parent-balance-${balanceAlert.kind}-${params.student.id}`,
      dedupeWindowMs: 14 * 24 * 60 * 60 * 1000,
    })));
  }
}

export async function notifyOfflineLessonEvent(params: {
  crmClassId: string;
  crmTeacherId?: string;
  crmStudentIds?: string[];
  event: OfflineLessonNotificationEvent;
  lessonTitle?: string | null;
  date?: string | null;
  startTime?: string | null;
  deliveryFormat?: "offline" | "online";
  meetingUrl?: string | null;
  message?: string | null;
}) {
  const teacher = params.crmTeacherId
    ? await findUserByCrmTeacherId(params.crmTeacherId)
    : null;
  const url = `/admin/offline-lessons/${encodeURIComponent(params.crmClassId)}`;
  const studentUrl = `/school-lessons?tab=history&lesson=${encodeURIComponent(params.crmClassId)}`;
  const lessonTitle = params.lessonTitle?.trim() || "Урок";
  const when = [params.date, params.startTime].filter(Boolean).join(" · ");
  const context = when ? ` (${when})` : "";
  const scheduleUpdateMessage = params.message?.trim() || null;
  const teacherCopy = {
    approved: {
      type: "offline_lesson_approved" as const,
      title: "Отчёт по уроку принят",
      body: `${lessonTitle}${context}. Отчёт принят, урок учтён в вашей работе.`,
      tag: "offline-lesson-approved",
    },
    returned: {
      type: "offline_lesson_returned" as const,
      title: "Отчёт по уроку возвращён",
      body: `${lessonTitle}${context}. Администратор вернул отчёт на доработку.${params.message?.trim() ? ` ${params.message.trim()}` : ""}`,
      tag: "offline-lesson-returned",
    },
    cancelled: {
      type: "offline_lesson_cancelled" as const,
      title: "Урок отменён",
      body: `${lessonTitle}${context}. Занятие отменено, проверьте расписание.`,
      tag: "offline-lesson-cancelled",
    },
    rescheduled: {
      type: "offline_lesson_rescheduled" as const,
      title: scheduleUpdateMessage ? "Данные урока обновлены" : "Урок перенесён",
      body: `${lessonTitle}${context}. ${scheduleUpdateMessage || "Проверьте обновлённое расписание."}`,
      tag: "offline-lesson-rescheduled",
    },
  }[params.event];
  const teacherResult = teacher
    ? await deliverUserNotification({
        userId: teacher.id,
        type: teacherCopy.type,
        title: teacherCopy.title,
        body: teacherCopy.body,
        url,
        tag: `${teacherCopy.tag}-${params.crmClassId}`,
        dedupeWindowMs: 10 * 60 * 1000,
      })
    : null;

  const studentIds = [...new Set(params.crmStudentIds ?? [])];
  const students = (await Promise.all(studentIds.map((crmStudentId) => findUserByCrmStudentId(crmStudentId))))
    .filter((student): student is NonNullable<typeof student> => Boolean(student));
  const studentCopy = params.event === "approved"
    ? {
        type: "offline_lesson_report_ready" as const,
        title: "Готов итог урока",
        body: `${lessonTitle}${context}. Посмотрите итог, материалы и домашнее задание.`,
      }
    : {
        type: teacherCopy.type,
        title: teacherCopy.title,
        body: teacherCopy.body,
      };
  await Promise.all(students.map((student) => deliverUserNotification({
    userId: student.id,
    type: studentCopy.type,
    title: studentCopy.title,
    body: studentCopy.body,
    url: studentUrl,
    tag: `${teacherCopy.tag}-${params.crmClassId}-${student.id}`,
    dedupeWindowMs: 10 * 60 * 1000,
  }).catch(() => undefined)));

  let parentsDelivered = 0;
  if (students.length && shouldNotifyParentForOfflineEvent(params.event)) {
    const parentLinks = await prisma.parentStudentLink.findMany({
      where: {
        studentUserId: { in: students.map((student) => student.id) },
        isActive: true,
        parent: {
          ...notDeleted,
          isActive: true,
          role: { slug: "parent" },
        },
      },
      select: { studentUserId: true, parentUserId: true },
    });
    const parentsByStudent = new Map<string, string[]>();
    for (const link of parentLinks) {
      const parentUserIds = parentsByStudent.get(link.studentUserId) ?? [];
      parentUserIds.push(link.parentUserId);
      parentsByStudent.set(link.studentUserId, parentUserIds);
    }
    parentsDelivered = parentLinks.length;

    await Promise.allSettled(students.map(async (student) => {
      const parentUserIds = [...new Set(parentsByStudent.get(student.id) ?? [])];
      if (!parentUserIds.length) return;

      if (params.event === "approved") {
        await notifyParentsAboutApprovedLesson({
          student,
          parentUserIds,
          crmClassId: params.crmClassId,
          lessonTitle,
          context,
        });
        return;
      }

      const type = parentOfflineEventType(params.event);
      if (!type) return;
      const childName = formatFio(student) || "ученика";
      const copy = params.event === "cancelled"
        ? {
            title: `Урок отменён: ${childName}`,
            body: `${lessonTitle}${context}. Занятие отменено. Проверьте актуальное расписание в семейном кабинете.`,
            notice: "cancelled",
          }
        : scheduleUpdateMessage
          ? {
              title: `Данные урока обновлены: ${childName}`,
              body: `${lessonTitle}${context}. ${scheduleUpdateMessage} Проверьте актуальное расписание в семейном кабинете.`,
              notice: "schedule",
            }
        : {
            title: `Урок перенесён: ${childName}`,
            body: `${lessonTitle}${context}. Дата или время изменились. Проверьте актуальное расписание в семейном кабинете.`,
            notice: "schedule",
          };
      await Promise.allSettled(parentUserIds.map((parentUserId) => deliverUserNotification({
        userId: parentUserId,
        type,
        title: copy.title,
        body: copy.body,
        url: familyNotificationUrl(student.id, copy.notice, params.crmClassId),
        tag: `parent-${copy.notice}-${params.crmClassId}-${student.id}`,
        dedupeWindowMs: 10 * 60 * 1000,
      })));
    }));
  }

  return {
    delivered: Boolean(teacherResult || students.length || parentsDelivered),
    teacherLinked: Boolean(teacher),
    studentsDelivered: students.length,
    parentsDelivered,
    duplicate: teacherResult?.duplicate ?? false,
    notificationId: teacherResult?.notification.id ?? null,
  };
}

export async function notifyOfflineLessonApproved(params: Omit<Parameters<typeof notifyOfflineLessonEvent>[0], "event">) {
  return notifyOfflineLessonEvent({ ...params, event: "approved" });
}

export async function notifyStaffTaskAssigned(params: {
  crmTaskId: string;
  crmAssigneeId: string;
  title: string;
  description?: string | null;
  priority?: "low" | "normal" | "high" | "urgent";
  dueAt?: Date | null;
  createdByName?: string | null;
}) {
  const teacher = await findUserByCrmTeacherId(params.crmAssigneeId);
  if (!teacher) {
    return { delivered: false, teacherLinked: false, notificationId: null };
  }

  const dueText = params.dueAt
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Aqtobe",
      }).format(params.dueAt)
    : null;
  const priorityText = params.priority === "urgent"
    ? "Срочная задача."
    : params.priority === "high"
      ? "Высокий приоритет."
      : null;
  const body = [
    priorityText,
    dueText ? `Срок: ${dueText}.` : "Без установленного срока.",
    params.createdByName ? `Поставил: ${params.createdByName}.` : null,
    params.description?.trim() || null,
  ].filter(Boolean).join(" ");

  const result = await deliverUserNotification({
    userId: teacher.id,
    type: "staff_task_assigned",
    title: `Новая задача: ${params.title}`,
    body,
    url: `/admin?task=${encodeURIComponent(params.crmTaskId)}`,
    tag: `staff-task-${params.crmTaskId}`,
    dedupeWindowMs: 10 * 60 * 1000,
  });

  return {
    delivered: true,
    teacherLinked: true,
    notificationId: result.notification.id,
    duplicate: result.duplicate,
  };
}
