import type {
  HomeworkAttachmentType,
  OnlineLessonMaterialType,
  OnlineLessonRequestStatus,
} from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../domain/errors.js";
import { addMaestroCoins } from "./coins.service.js";
import { deliverUserNotification } from "./notification.service.js";
import { awardManualPoints } from "./points.service.js";
import { postOnlineLessonBooking, postOnlineLessonStatus } from "../../infrastructure/crm/crm-client.js";

const requestSelect = {
  id: true,
  studentId: true,
  directionId: true,
  directionTitle: true,
  level: true,
  preferredTime: true,
  comment: true,
  status: true,
  teacherId: true,
  scheduledAt: true,
  zoomUrl: true,
  coveredTopics: true,
  whatWorked: true,
  whatToImprove: true,
  completionComment: true,
  lessonPoints: true,
  lessonCoins: true,
  lessonCoinsReason: true,
  completedAt: true,
  completedById: true,
  createdAt: true,
  updatedAt: true,
  student: {
    select: { id: true, firstName: true, lastName: true, middleName: true, email: true, phone: true, login: true },
  },
  teacher: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      middleName: true,
      email: true,
      phone: true,
      login: true,
    },
  },
  assignment: {
    include: {
      materials: { orderBy: { sortOrder: "asc" as const } },
      submissions: {
        orderBy: { createdAt: "desc" as const },
        take: 5,
        select: {
          id: true,
          comment: true,
          attachmentUrl: true,
          attachmentType: true,
          status: true,
          reviewComment: true,
          reviewPoints: true,
          reviewCoins: true,
          reviewedAt: true,
          createdAt: true,
        },
      },
    },
  },
} as const;

async function bestEffortNotification(params: Parameters<typeof deliverUserNotification>[0]) {
  await deliverUserNotification(params).catch((error) => {
    console.error("[notifications] Failed to deliver online lesson event:", error instanceof Error ? error.message : error);
  });
}

function assertCoinsReason(coins: number, reason?: string | null) {
  if (coins > 0 && !reason?.trim()) {
    throw new BadRequestError("Укажите причину начисления Maestro Coins");
  }
}

async function syncCrmStatus(requestId: string, status: "assigned" | "scheduled" | "completed" | "cancelled" | "no_show") {
  try {
    await postOnlineLessonStatus(requestId, status);
  } catch (error) {
    console.error("[online-lessons] Failed to sync CRM status:", error instanceof Error ? error.message : error);
  }
}

export async function createOnlineLessonRequest(params: {
  studentId: string;
  requestType?: "trial" | "online_lesson";
  directionId?: string | null;
  directionTitle: string;
  level: string;
  preferredTime: string;
  comment?: string;
}) {
  let directionTitle = params.directionTitle.trim();
  let directionId = params.directionId ?? null;

  if (directionId) {
    const direction = await prisma.direction.findFirst({
      where: { id: directionId, isPublished: true, deletedAt: null },
      select: { id: true, title: true },
    });
    if (!direction) throw new BadRequestError("Направление не найдено");
    directionTitle = direction.title;
    directionId = direction.id;
  }

  if (!directionTitle) throw new BadRequestError("Укажите направление");
  if (!params.level.trim()) throw new BadRequestError("Укажите уровень подготовки");
  if (!params.preferredTime.trim()) throw new BadRequestError("Укажите удобное время");

  const request = await prisma.onlineLessonRequest.create({
    data: {
      studentId: params.studentId,
      directionId,
      directionTitle,
      level: params.level.trim(),
      preferredTime: params.preferredTime.trim(),
      comment: params.comment?.trim() || null,
      status: "new",
    },
    select: requestSelect,
  });

  try {
    await postOnlineLessonBooking({
      externalSourceId: request.id,
      requestType: params.requestType,
      name: request.student.firstName,
      lastName: request.student.lastName,
      middleName: request.student.middleName,
      phone: request.student.phone,
      direction: request.directionTitle,
      level: request.level,
      preferredTime: request.preferredTime,
      comment: request.comment ?? undefined,
    });
  } catch (error) {
    await prisma.onlineLessonRequest.delete({ where: { id: request.id } }).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    console.error("[online-lessons] Failed to create CRM booking:", message);
    throw new BadRequestError(
      "Заявка временно не отправлена администратору. Попробуйте ещё раз.",
      "CRM_BOOKING_FAILED",
    );
  }

  return request;
}

export async function listStudentOnlineLessonRequests(studentId: string) {
  return prisma.onlineLessonRequest.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    select: requestSelect,
  });
}

export async function getStudentOnlineLessonRequest(studentId: string, requestId: string) {
  const item = await prisma.onlineLessonRequest.findFirst({
    where: { id: requestId, studentId },
    select: requestSelect,
  });
  if (!item) throw new NotFoundError("Online lesson request");
  return item;
}

export async function listAdminOnlineLessonRequests(input: {
  status?: OnlineLessonRequestStatus;
  search?: string;
  page: number;
  limit: number;
  teacherId?: string;
  unassigned?: boolean;
  mine?: boolean;
}) {
  const where = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.unassigned
      ? { teacherId: null }
      : input.teacherId
        ? { teacherId: input.teacherId }
        : {}),
    ...(input.search
      ? {
          OR: [
            { directionTitle: { contains: input.search, mode: "insensitive" as const } },
            { comment: { contains: input.search, mode: "insensitive" as const } },
            { student: { firstName: { contains: input.search, mode: "insensitive" as const } } },
            { student: { lastName: { contains: input.search, mode: "insensitive" as const } } },
            { student: { middleName: { contains: input.search, mode: "insensitive" as const } } },
            { student: { email: { contains: input.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const skip = (input.page - 1) * input.limit;
  const [items, total] = await prisma.$transaction([
    prisma.onlineLessonRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: input.limit,
      select: requestSelect,
    }),
    prisma.onlineLessonRequest.count({ where }),
  ]);

  return { items, total };
}

export async function getAdminOnlineLessonRequest(requestId: string) {
  const item = await prisma.onlineLessonRequest.findUnique({
    where: { id: requestId },
    select: requestSelect,
  });
  if (!item) throw new NotFoundError("Online lesson request");
  return item;
}

export async function getStaffOnlineLessonRequest(
  requestId: string,
  actor: { id: string; roleSlug: string },
) {
  const item = await getAdminOnlineLessonRequest(requestId);
  if (actor.roleSlug === "teacher" && item.teacherId !== actor.id) {
    throw new ForbiddenError("Этот онлайн-урок назначен другому преподавателю");
  }
  return item;
}

export async function listOnlineLessonTeachers() {
  return prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      role: { slug: "teacher" },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      middleName: true,
      email: true,
      crmTeacherId: true,
    },
  });
}

export async function countPendingOnlineLessonRequests(params?: { teacherId?: string; includeNewRequests?: boolean }) {
  const teacherId = params?.teacherId;
  const includeNewRequests = params?.includeNewRequests ?? true;
  const [newRequests, myInWork, assignedOrScheduled, submissions] = await Promise.all([
    includeNewRequests
      ? prisma.onlineLessonRequest.count({ where: { status: "new" } })
      : Promise.resolve(0),
    teacherId
      ? prisma.onlineLessonRequest.count({
          where: { teacherId, status: { in: ["assigned", "scheduled"] } },
        })
      : prisma.onlineLessonRequest.count({ where: { status: { in: ["assigned", "scheduled"] } } }),
    prisma.onlineLessonRequest.count({ where: { status: { in: ["assigned", "scheduled"] } } }),
    countPendingOnlineAssignmentSubmissions(),
  ]);

  return { newRequests, myInWork, assignedOrScheduled, submissions };
}

async function requireManageableRequest(requestId: string) {
  const item = await getAdminOnlineLessonRequest(requestId);
  if (item.status === "completed" || item.status === "cancelled") {
    throw new BadRequestError("Заявка уже закрыта");
  }
  return item;
}

export async function assignOnlineLessonRequest(
  requestId: string,
  teacherId: string,
  options?: { allowReassign?: boolean },
) {
  const item = await requireManageableRequest(requestId);
  if (item.status !== "new" && item.status !== "assigned") {
    throw new BadRequestError("Заявку нельзя взять в текущем статусе");
  }
  if (item.teacherId && item.teacherId !== teacherId && !options?.allowReassign) {
    throw new ForbiddenError("Заявка уже назначена другому преподавателю");
  }

  const teacher = await prisma.user.findFirst({
    where: {
      id: teacherId,
      isActive: true,
      deletedAt: null,
      role: { slug: "teacher" },
    },
    select: { id: true },
  });
  if (!teacher) {
    throw new BadRequestError("Выбранный преподаватель не найден или отключён");
  }

  const updated = await prisma.onlineLessonRequest.update({
    where: { id: requestId },
    data: { teacherId, status: "assigned" },
    select: requestSelect,
  });
  await syncCrmStatus(requestId, "assigned");

  await bestEffortNotification({
    userId: teacherId,
    type: "online_lesson_assigned",
    title: "Вам назначен онлайн-урок",
    body: `${item.directionTitle}. Откройте раздел онлайн-уроков, чтобы посмотреть детали и время занятия.`,
    url: `/admin/online-lessons/${requestId}`,
    tag: `online-lesson-assigned-${requestId}`,
    dedupeWindowMs: 2 * 60 * 1000,
  });

  if (item.teacherId && item.teacherId !== teacherId) {
    await bestEffortNotification({
      userId: item.teacherId,
      type: "online_lesson_assigned",
      title: "Онлайн-урок переназначен",
      body: `${item.directionTitle} больше не закреплён за вами.`,
      url: "/admin/online-lessons",
      tag: `online-lesson-reassigned-${requestId}`,
      dedupeWindowMs: 2 * 60 * 1000,
    });
  }

  return updated;
}

export async function scheduleOnlineLessonRequest(requestId: string, params: {
  scheduledAt: Date;
  zoomUrl: string;
}) {
  const item = await requireManageableRequest(requestId);
  if (!["assigned", "scheduled", "new"].includes(item.status)) {
    throw new BadRequestError("Нельзя назначить урок в текущем статусе");
  }
  if (!item.teacherId) {
    throw new BadRequestError("Сначала назначьте преподавателя");
  }
  const zoomUrl = params.zoomUrl.trim();
  if (!zoomUrl) throw new BadRequestError("Добавьте Zoom-ссылку");

  const updated = await prisma.onlineLessonRequest.update({
    where: { id: requestId },
    data: {
      scheduledAt: params.scheduledAt,
      zoomUrl,
      status: "scheduled",
      teacherId: item.teacherId ?? undefined,
    },
    select: requestSelect,
  });

  const when = new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(params.scheduledAt);

  const rescheduled = item.status === "scheduled" && Boolean(item.scheduledAt);
  const notificationType = rescheduled ? "online_lesson_rescheduled" : "online_lesson_scheduled";
  const notificationTitle = rescheduled ? "Онлайн-урок перенесён" : "Онлайн-урок назначен";
  const notificationBody = `${item.directionTitle}: ${when}. Ссылка на Zoom уже в личном кабинете.`;

  await Promise.all([
    bestEffortNotification({
      userId: item.studentId,
      type: notificationType,
      title: notificationTitle,
      body: notificationBody,
      url: `/online-lessons/${requestId}`,
      tag: `online-lesson-${requestId}`,
      dedupeWindowMs: 2 * 60 * 1000,
    }),
    item.teacherId
      ? bestEffortNotification({
          userId: item.teacherId,
          type: notificationType,
          title: rescheduled ? "Онлайн-урок перенесён" : "Онлайн-урок назначен",
          body: `${item.directionTitle}: ${when}. Проверьте ссылку на Zoom и детали занятия.`,
          url: `/admin/online-lessons/${requestId}`,
          tag: `online-lesson-${requestId}`,
          dedupeWindowMs: 2 * 60 * 1000,
        })
      : Promise.resolve(),
  ]);

  await syncCrmStatus(requestId, "scheduled");
  return updated;
}

export async function cancelOnlineLessonRequest(requestId: string) {
  const item = await requireManageableRequest(requestId);
  const updated = await prisma.onlineLessonRequest.update({
    where: { id: requestId },
    data: { status: "cancelled" },
    select: requestSelect,
  });
  await syncCrmStatus(requestId, "cancelled");
  await Promise.all([
    bestEffortNotification({
      userId: item.studentId,
      type: "online_lesson_cancelled",
      title: "Онлайн-урок отменён",
      body: `${item.directionTitle}. Администратор отменил это занятие.`,
      url: `/online-lessons/${requestId}`,
      tag: `online-lesson-cancelled-${requestId}`,
      dedupeWindowMs: 10 * 60 * 1000,
    }),
    item.teacherId
      ? bestEffortNotification({
          userId: item.teacherId,
          type: "online_lesson_cancelled",
          title: "Онлайн-урок отменён",
          body: `${item.directionTitle}. Занятие больше не требует проведения.`,
          url: `/admin/online-lessons/${requestId}`,
          tag: `online-lesson-cancelled-${requestId}`,
          dedupeWindowMs: 10 * 60 * 1000,
        })
      : Promise.resolve(),
  ]);
  return updated;
}

export async function markOnlineLessonNoShow(requestId: string) {
  const item = await requireManageableRequest(requestId);
  if (item.status !== "scheduled") {
    throw new BadRequestError("Отметить неявку можно только для назначенного урока");
  }
  const updated = await prisma.onlineLessonRequest.update({
    where: { id: requestId },
    data: { status: "no_show" },
    select: requestSelect,
  });
  await syncCrmStatus(requestId, "no_show");
  await Promise.all([
    bestEffortNotification({
      userId: item.studentId,
      type: "online_lesson_no_show",
      title: "Онлайн-урок отмечен как неявка",
      body: `${item.directionTitle}. Если это ошибка, свяжитесь с администратором.`,
      url: `/online-lessons/${requestId}`,
      tag: `online-lesson-no-show-${requestId}`,
      dedupeWindowMs: 10 * 60 * 1000,
    }),
    item.teacherId
      ? bestEffortNotification({
          userId: item.teacherId,
          type: "online_lesson_no_show",
          title: "Онлайн-урок отмечен как неявка",
          body: `${item.directionTitle}. Статус занятия обновлён.`,
          url: `/admin/online-lessons/${requestId}`,
          tag: `online-lesson-no-show-${requestId}`,
          dedupeWindowMs: 10 * 60 * 1000,
        })
      : Promise.resolve(),
  ]);
  return updated;
}

export async function syncOnlineLessonFromCrm(requestId: string, params: {
  action: "schedule" | "cancel";
  crmTeacherId?: string;
  scheduledAt?: Date;
  meetingUrl?: string;
}) {
  if (params.action === "cancel") {
    const item = await getAdminOnlineLessonRequest(requestId);
    if (item.status === "cancelled") return item;
    return cancelOnlineLessonRequest(requestId);
  }

  if (!params.crmTeacherId || !params.scheduledAt || !params.meetingUrl?.trim()) {
    throw new BadRequestError("Для назначения нужны преподаватель, дата и ссылка");
  }

  const teacher = await prisma.user.findFirst({
    where: {
      crmTeacherId: params.crmTeacherId,
      isActive: true,
      deletedAt: null,
      role: { slug: "teacher" },
    },
    select: { id: true },
  });
  if (!teacher) {
    throw new BadRequestError("Преподаватель CRM не подключён к приложению");
  }

  const item = await requireManageableRequest(requestId);
  if (item.status === "new" || (item.status === "assigned" && item.teacherId !== teacher.id)) {
    await prisma.onlineLessonRequest.update({
      where: { id: requestId },
      data: { teacherId: teacher.id, status: "assigned" },
    });
  }

  return scheduleOnlineLessonRequest(requestId, {
    scheduledAt: params.scheduledAt,
    zoomUrl: params.meetingUrl,
  });
}

type AssignmentMaterialInput = {
  type: OnlineLessonMaterialType;
  title: string;
  url?: string | null;
  content?: string | null;
  sortOrder?: number;
};

export async function completeOnlineLessonRequest(requestId: string, params: {
  completedBy: string;
  coveredTopics: string;
  whatWorked: string;
  whatToImprove: string;
  completionComment?: string;
  lessonPoints: number;
  lessonCoins: number;
  lessonCoinsReason?: string;
  createAssignment: boolean;
  assignment?: {
    title: string;
    description: string;
    dueAt?: Date | null;
    submissionFormat: HomeworkAttachmentType;
    pointsReward: number;
    materials?: AssignmentMaterialInput[];
  };
}) {
  const item = await requireManageableRequest(requestId);
  if (!["scheduled", "assigned"].includes(item.status)) {
    throw new BadRequestError("Завершить можно только назначенный или взятый урок");
  }

  assertCoinsReason(params.lessonCoins, params.lessonCoinsReason);

  if (params.createAssignment) {
    if (!params.assignment?.title.trim() || !params.assignment.description.trim()) {
      throw new BadRequestError("Заполните название и описание домашнего задания");
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.onlineLessonRequest.update({
      where: { id: requestId },
      data: {
        status: "completed",
        coveredTopics: params.coveredTopics.trim(),
        whatWorked: params.whatWorked.trim(),
        whatToImprove: params.whatToImprove.trim(),
        completionComment: params.completionComment?.trim() || null,
        lessonPoints: params.lessonPoints,
        lessonCoins: params.lessonCoins,
        lessonCoinsReason: params.lessonCoinsReason?.trim() || null,
        completedAt: new Date(),
        completedById: params.completedBy,
      },
      select: requestSelect,
    });

    if (params.createAssignment && params.assignment) {
      await tx.onlineLessonAssignment.create({
        data: {
          requestId,
          title: params.assignment.title.trim(),
          description: params.assignment.description.trim(),
          dueAt: params.assignment.dueAt ?? null,
          submissionFormat: params.assignment.submissionFormat,
          pointsReward: params.assignment.pointsReward,
          materials: params.assignment.materials?.length
            ? {
                create: params.assignment.materials.map((material, index) => ({
                  type: material.type,
                  title: material.title.trim(),
                  url: material.url?.trim() || null,
                  content: material.content?.trim() || null,
                  sortOrder: material.sortOrder ?? index,
                })),
              }
            : undefined,
        },
      });
    }

    return updated;
  });

  if (params.lessonPoints > 0) {
    await awardManualPoints({
      studentId: item.studentId,
      amount: params.lessonPoints,
      reason: `Онлайн-урок: ${item.directionTitle}`,
      awardedBy: params.completedBy,
      idempotencyKey: `online-lesson-points:${requestId}`,
    });
  }

  if (params.lessonCoins > 0) {
    await addMaestroCoins({
      studentId: item.studentId,
      amount: params.lessonCoins,
      reason: params.lessonCoinsReason!.trim(),
      sourceType: "online_lesson",
      sourceId: requestId,
      createdBy: params.completedBy,
    });
  }

  await syncCrmStatus(requestId, "completed");
  await bestEffortNotification({
    userId: item.studentId,
    type: "online_lesson_completed",
    title: "Онлайн-урок завершён",
    body: params.createAssignment
      ? `${item.directionTitle}. Итог урока и домашнее задание уже доступны в личном кабинете.`
      : `${item.directionTitle}. Итог урока уже доступен в личном кабинете.`,
    url: `/online-lessons/${requestId}`,
    tag: `online-lesson-completed-${requestId}`,
    dedupeWindowMs: 10 * 60 * 1000,
  });
  return getAdminOnlineLessonRequest(requestId);
}

export async function submitOnlineLessonAssignment(params: {
  requestId: string;
  studentId: string;
  comment?: string;
  attachmentUrl?: string;
  attachmentType?: HomeworkAttachmentType;
}) {
  const request = await getStudentOnlineLessonRequest(params.studentId, params.requestId);
  if (request.status !== "completed") {
    throw new BadRequestError("Домашнее задание доступно после завершения урока");
  }
  if (!request.assignment) {
    throw new NotFoundError("Assignment");
  }

  const latest = request.assignment.submissions[0];
  if (latest && latest.status === "submitted") {
    throw new BadRequestError("Задание уже отправлено на проверку");
  }
  if (latest && latest.status === "approved") {
    throw new BadRequestError("Задание уже принято");
  }

  const format = request.assignment.submissionFormat;
  if (format === "text" && !params.comment?.trim()) {
    throw new BadRequestError("Добавьте текстовый ответ");
  }
  if (format !== "text" && !params.attachmentUrl?.trim()) {
    throw new BadRequestError("Добавьте ссылку на материал");
  }

  const submission = await prisma.onlineLessonAssignmentSubmission.create({
    data: {
      assignmentId: request.assignment.id,
      studentId: params.studentId,
      comment: params.comment?.trim() || null,
      attachmentUrl: params.attachmentUrl?.trim() || null,
      attachmentType: params.attachmentType ?? format,
      status: "submitted",
    },
  });

  if (request.teacher?.id) {
    await bestEffortNotification({
      userId: request.teacher.id,
      type: "online_assignment_submitted",
      title: "Ученик отправил домашнее задание",
      body: `${request.student.firstName} ${request.student.lastName} отправил работу «${request.assignment.title}».`,
      url: `/admin/online-lessons/${params.requestId}`,
      tag: `online-assignment-${request.assignment.id}`,
      dedupeWindowMs: 2 * 60 * 1000,
    });
  }

  return submission;
}

export async function reviewOnlineLessonAssignment(submissionId: string, params: {
  reviewerId: string;
  reviewerRole?: string;
  action: "approve" | "approve_with_remarks" | "return";
  reviewComment?: string;
  reviewPoints: number;
  reviewCoins: number;
  reviewCoinsReason?: string;
}) {
  const submission = await prisma.onlineLessonAssignmentSubmission.findUnique({
    where: { id: submissionId },
    include: {
      assignment: {
        include: {
          request: {
            select: {
              id: true,
              studentId: true,
              teacherId: true,
              directionTitle: true,
            },
          },
        },
      },
    },
  });
  if (!submission) throw new NotFoundError("Assignment submission");
  if (
    params.reviewerRole === "teacher"
    && submission.assignment.request.teacherId !== params.reviewerId
  ) {
    throw new ForbiddenError("Это задание относится к уроку другого преподавателя");
  }
  if (submission.status !== "submitted") {
    throw new BadRequestError("Работа уже проверена");
  }

  if (params.action === "return" && !params.reviewComment?.trim()) {
    throw new BadRequestError("Комментарий обязателен при возврате на доработку");
  }

  assertCoinsReason(params.reviewCoins, params.reviewCoinsReason);

  const statusMap = {
    approve: "approved",
    approve_with_remarks: "approved_with_remarks",
    return: "returned",
  } as const;

  const updated = await prisma.onlineLessonAssignmentSubmission.update({
    where: { id: submissionId },
    data: {
      status: statusMap[params.action],
      reviewComment: params.reviewComment?.trim() || null,
      reviewPoints: params.action === "return" ? null : params.reviewPoints,
      reviewCoins: params.action === "return" ? 0 : params.reviewCoins,
      reviewCoinsReason: params.reviewCoinsReason?.trim() || null,
      reviewedById: params.reviewerId,
      reviewedAt: new Date(),
    },
  });

  if (params.action !== "return" && params.reviewPoints > 0) {
    await awardManualPoints({
      studentId: submission.studentId,
      amount: params.reviewPoints,
      reason: `ДЗ после онлайн-урока: ${submission.assignment.request.directionTitle}`,
      awardedBy: params.reviewerId,
      idempotencyKey: `online-assignment-points:${submissionId}`,
    });
  }

  if (params.action !== "return" && params.reviewCoins > 0) {
    await addMaestroCoins({
      studentId: submission.studentId,
      amount: params.reviewCoins,
      reason: params.reviewCoinsReason!.trim(),
      sourceType: "assignment",
      sourceId: submissionId,
      createdBy: params.reviewerId,
    });
  }

  const reviewTitle = params.action === "return"
    ? "Нужна доработка задания"
    : params.action === "approve_with_remarks"
      ? "Задание принято с замечаниями"
      : "Задание принято";
  const reviewBody = params.action === "return"
    ? `По заданию «${submission.assignment.title}» нужна доработка.${params.reviewComment?.trim() ? ` Комментарий: ${params.reviewComment.trim()}` : ""}`
    : `По заданию «${submission.assignment.title}» преподаватель завершил проверку.${params.reviewComment?.trim() ? ` Комментарий: ${params.reviewComment.trim()}` : ""}`;
  await bestEffortNotification({
    userId: submission.studentId,
    type: "online_assignment_reviewed",
    title: reviewTitle,
    body: reviewBody,
    url: `/online-lessons/${submission.assignment.request.id}`,
    tag: `online-assignment-review-${submissionId}`,
    dedupeWindowMs: 2 * 60 * 1000,
  });

  return updated;
}

export async function countPendingOnlineAssignmentSubmissions() {
  return prisma.onlineLessonAssignmentSubmission.count({ where: { status: "submitted" } });
}
