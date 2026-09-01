import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  LearningHomeworkAttemptStatus,
  LearningHomeworkRecipientState,
  LearningHomeworkReviewDecision,
  LearningHomeworkSubmissionMode,
  Prisma,
  type UserNotificationType,
} from "@prisma/client";
import {
  productFeatureConfig,
  rewardEconomyV2AppliesToEvent,
} from "../../config/product-features.js";
import { isOfflineCoordinatorRole } from "../../domain/cms-access.js";
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
} from "../../domain/errors.js";
import {
  learningHomeworkReviewTransition,
  nextLearningHomeworkAttempt,
  validateLearningHomeworkSubmission,
} from "../../domain/learning-homework-flow.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import {
  fetchStudentTeachers,
  fetchTeacherGroups,
  fetchTeacherStudents,
} from "../../infrastructure/crm/crm-client.js";
import { requireCrmDirection } from "./crm-direction-projection.service.js";
import { deliverUserNotification } from "./notification.service.js";
import { requireCrmTeacherId } from "./teacher-students.service.js";
import { awardHomeworkAcceptedXp } from "./weekly-league.service.js";

export type LearningHomeworkMaterialInput = {
  type: "link" | "audio" | "video" | "file";
  url: string;
  title?: string;
  mimeType?: string;
  sizeBytes?: number;
  privateFile?: boolean;
};

export type CreateLearningHomeworkAssignmentInput = {
  topicId: string;
  instructions: string;
  materials?: LearningHomeworkMaterialInput[];
  dueAt?: Date | null;
  sourceLessonId?: string | null;
  idempotencyKey: string;
};

export type SubmitLearningHomeworkAttemptInput = {
  assignmentId: string;
  studentUserId: string;
  mode: "materials" | "ready_for_lesson";
  text?: string | null;
  materials?: LearningHomeworkMaterialInput[];
  previousAttemptId?: string | null;
  idempotencyKey: string;
};

export type ReviewLearningHomeworkInput = {
  recipientId: string;
  reviewerUserId: string;
  decision: "revision" | "accepted" | "accepted_with_comment";
  comment?: string | null;
  idempotencyKey: string;
};

const assignmentInclude = {
  topic: { include: { direction: true } },
  createdBy: {
    select: { id: true, firstName: true, lastName: true, middleName: true },
  },
  recipients: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      crmStudentId: true,
      studentUserId: true,
      state: true,
      currentCycle: true,
      acceptedAt: true,
    },
  },
} satisfies Prisma.LearningHomeworkAssignmentInclude;

const studentRecipientInclude = {
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      middleName: true,
    },
  },
  assignment: {
    include: {
      topic: { include: { direction: true } },
      createdBy: {
        select: { firstName: true, lastName: true, middleName: true },
      },
    },
  },
  attempts: {
    orderBy: [
      { cycleNumber: "desc" as const },
      { versionInCycle: "desc" as const },
    ],
    include: {
      reviews: {
        orderBy: { reviewedAt: "desc" as const },
        include: {
          reviewer: {
            select: { firstName: true, lastName: true, middleName: true },
          },
        },
      },
    },
  },
} satisfies Prisma.LearningHomeworkRecipientInclude;

type AssignmentWithRecipients = Prisma.LearningHomeworkAssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;

type StudentRecipient = Prisma.LearningHomeworkRecipientGetPayload<{
  include: typeof studentRecipientInclude;
}>;

export type ScopedTopic = Prisma.LearningTopicGetPayload<{
  include: { direction: true };
}>;

function fullName(person: {
  firstName: string;
  lastName: string;
  middleName?: string | null;
} | null) {
  if (!person) return "";
  return [person.lastName, person.firstName, person.middleName].filter(Boolean).join(" ");
}

function materialDto(value: Prisma.JsonValue): LearningHomeworkMaterialInput[] {
  return Array.isArray(value) ? value as LearningHomeworkMaterialInput[] : [];
}

function normalizeMaterials(materials: LearningHomeworkMaterialInput[] = []) {
  return materials.map((material) => ({
    type: material.type,
    url: material.url.trim(),
    title: material.title?.trim() ?? "",
    ...(material.mimeType ? { mimeType: material.mimeType.trim().toLowerCase() } : {}),
    ...(material.sizeBytes !== undefined ? { sizeBytes: material.sizeBytes } : {}),
    ...(material.privateFile ? { privateFile: true } : {}),
  }));
}

function notificationExcerpt(value: string, maxLength = 140) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength
    ? `${compact.slice(0, maxLength - 1).trimEnd()}…`
    : compact;
}

async function notifyLearningHomeworkAssigned(assignment: AssignmentWithRecipients) {
  const studentUserIds = [...new Set(
    assignment.recipients
      .map((recipient) => recipient.studentUserId)
      .filter((userId): userId is string => Boolean(userId)),
  )];
  await Promise.allSettled(studentUserIds.map((userId) => deliverUserNotification({
    userId,
    type: "homework_assigned" as UserNotificationType,
    title: "Новое домашнее задание",
    body: `${assignment.topic.title}: ${notificationExcerpt(assignment.instructions)}`,
    url: `/school-lessons?tab=homework&lesson=${assignment.id}`,
    tag: `learning-homework-assigned-${assignment.id}`,
    dedupeKey: `learning-hw:assigned:${assignment.id}:${userId}`,
  })));
}

function sameDate(left: Date | null, right: Date | null | undefined) {
  return left?.toISOString() === right?.toISOString();
}

function sameJson(left: unknown, right: unknown) {
  return isDeepStrictEqual(left, right);
}

function sameAssignmentRequest(
  existing: AssignmentWithRecipients,
  input: {
    teacherUserId: string;
    topicId: string;
    instructions: string;
    sourceLessonId: string | null;
    dueAt?: Date | null;
    materials: LearningHomeworkMaterialInput[];
  },
) {
  return existing.createdById === input.teacherUserId
    && existing.topicId === input.topicId
    && existing.instructions === input.instructions
    && existing.sourceLessonId === input.sourceLessonId
    && sameDate(existing.dueAt, input.dueAt)
    && sameJson(existing.materials, input.materials);
}

export function learningHomeworkV2Enabled() {
  return productFeatureConfig.flags.learningTopicsV2
    && productFeatureConfig.flags.homeworkFlowV2;
}

async function requireStudentCrmProfile(studentUserId: string) {
  const student = await prisma.user.findUnique({
    where: { id: studentUserId },
    select: { crmStudentId: true },
  });
  if (!student?.crmStudentId) {
    throw new BadRequestError(
      "Профиль школы не подключён. Обратитесь к администратору Maestro.",
      "CRM_NOT_LINKED",
    );
  }
  return student.crmStudentId;
}

async function requireScopedTopic(topicId: string) {
  const topic = await prisma.learningTopic.findUnique({
    where: { id: topicId },
    include: { direction: true },
  });
  if (!topic || topic.archivedAt) {
    throw new AppError(404, "Учебная тема не найдена", "LEARNING_TOPIC_NOT_FOUND");
  }
  if (!topic.crmStudentId && !topic.crmGroupId) {
    throw new ConflictError(
      "У темы не указан ученик или группа",
      "LEARNING_TOPIC_OWNER_MISSING",
    );
  }
  if (!topic.direction.crmDirectionId) {
    throw new ConflictError(
      "Направление темы не связано с CRM",
      "CRM_DIRECTION_NOT_LINKED",
    );
  }
  return topic;
}

async function teacherTopicRecipients(teacherUserId: string, topic: ScopedTopic) {
  const crmTeacherId = await requireCrmTeacherId(teacherUserId);
  const crmDirectionId = topic.direction.crmDirectionId!;

  if (topic.crmStudentId) {
    const roster = await fetchTeacherStudents(crmTeacherId);
    const student = roster.students.find((item) => item.crmStudentId === topic.crmStudentId);
    if (!student) {
      throw new ForbiddenError("Ученик не назначен этому преподавателю");
    }
    await requireCrmDirection(crmDirectionId, student.directions);
    return [student.crmStudentId];
  }

  const roster = await fetchTeacherGroups(crmTeacherId);
  const group = roster.groups.find((item) => item.crmGroupId === topic.crmGroupId);
  if (!group) {
    throw new ForbiddenError("Группа не назначена этому преподавателю");
  }
  await requireCrmDirection(crmDirectionId, [group.direction]);
  const recipients = [...new Set(group.students.map((student) => student.crmStudentId))];
  if (!recipients.length) {
    throw new ConflictError(
      "В группе нет активных учеников для назначения ДЗ",
      "HOMEWORK_GROUP_HAS_NO_ACTIVE_STUDENTS",
    );
  }
  return recipients;
}

async function requireTeacherTopicAccess(teacherUserId: string, topic: ScopedTopic) {
  await teacherTopicRecipients(teacherUserId, topic);
}

async function currentHomeworkReviewerIds(topic: ScopedTopic, crmStudentId: string) {
  const [crmTeachers, coordinators] = await Promise.all([
    fetchStudentTeachers(crmStudentId),
    prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        role: {
          rolePermissions: { some: { permission: { code: "homework.review" } } },
        },
      },
      include: { role: { select: { slug: true } } },
    }),
  ]);
  const teacherCandidates = crmTeachers.teachers.filter((teacher) => (
    teacher.directions.includes(topic.direction.title)
      && (topic.crmGroupId ? teacher.sources.includes("group") : true)
  ));
  const appIds = teacherCandidates.map((teacher) => teacher.appUserId).filter(Boolean) as string[];
  const crmIds = teacherCandidates.map((teacher) => teacher.crmTeacherId);
  const linkedTeachers = teacherCandidates.length
    ? await prisma.user.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          role: { slug: "teacher" },
          OR: [
            ...(appIds.length ? [{ id: { in: appIds } }] : []),
            ...(crmIds.length ? [{ crmTeacherId: { in: crmIds } }] : []),
          ],
        },
        select: { id: true },
      })
    : [];
  const accessChecks = await Promise.allSettled(
    linkedTeachers.map(async (teacher) => {
      await requireTeacherTopicAccess(teacher.id, topic);
      return teacher.id;
    }),
  );
  const teachersWithAccess = accessChecks.flatMap((result) => (
    result.status === "fulfilled" ? [result.value] : []
  ));
  const coordinatorIds = coordinators
    .filter((user) => isOfflineCoordinatorRole(user.role.slug))
    .map((user) => user.id);
  return [...new Set([...teachersWithAccess, ...coordinatorIds])];
}

async function notifyLearningHomeworkSubmitted(recipient: StudentRecipient) {
  const latestAttempt = recipient.attempts[0];
  if (!latestAttempt) return;
  const userIds = await currentHomeworkReviewerIds(
    recipient.assignment.topic,
    recipient.crmStudentId,
  );
  const studentName = fullName(recipient.student) || "Ученик";
  const body = latestAttempt.submissionMode === LearningHomeworkSubmissionMode.ready_for_lesson
    ? `${studentName}: проверить подготовку на уроке`
    : `${studentName}: отправлен ответ по теме «${recipient.assignment.topic.title}»`;
  await Promise.allSettled(userIds.map((userId) => deliverUserNotification({
    userId,
    type: "homework_submitted",
    title: "Домашнее задание на проверке",
    body,
    url: `/admin/homework-review/${recipient.id}`,
    tag: `learning-homework-${recipient.id}`,
    dedupeKey: `learning-hw:submitted:${recipient.id}:${latestAttempt.cycleNumber}:${userId}`,
  })));
}

function assignmentDto(assignment: AssignmentWithRecipients, idempotent = false) {
  return {
    id: assignment.id,
    model: "learning_homework_v2" as const,
    topic: {
      id: assignment.topic.id,
      title: assignment.topic.title,
      masteryCriteria: assignment.topic.masteryCriteria,
      direction: {
        id: assignment.topic.direction.id,
        crmDirectionId: assignment.topic.direction.crmDirectionId,
        title: assignment.topic.direction.title,
      },
      owner: assignment.topic.crmGroupId
        ? { kind: "group" as const, crmGroupId: assignment.topic.crmGroupId }
        : { kind: "student" as const, crmStudentId: assignment.topic.crmStudentId! },
    },
    instructions: assignment.instructions,
    materials: materialDto(assignment.materials),
    sourceLessonId: assignment.sourceLessonId,
    dueAt: assignment.dueAt,
    assignedAt: assignment.assignedAt,
    createdBy: {
      id: assignment.createdBy?.id ?? null,
      name: fullName(assignment.createdBy),
    },
    recipientCount: assignment.recipients.length,
    recipients: assignment.recipients,
    idempotent,
  };
}

function attemptDto(attempt: StudentRecipient["attempts"][number]) {
  const review = attempt.reviews[0] ?? null;
  return {
    id: attempt.id,
    attemptNumber: attempt.attemptNumber,
    cycleNumber: attempt.cycleNumber,
    versionInCycle: attempt.versionInCycle,
    submissionMode: attempt.submissionMode,
    text: attempt.text,
    materials: materialDto(attempt.materials),
    status: attempt.status,
    previousAttemptId: attempt.previousAttemptId,
    submittedAt: attempt.submittedAt,
    review: review
      ? {
          id: review.id,
          decision: review.decision,
          comment: review.comment,
          reviewedAt: review.reviewedAt,
          reviewerName: fullName(review.reviewer),
        }
      : null,
  };
}

function studentAssignmentDto(recipient: StudentRecipient) {
  const latestAttempt = recipient.attempts[0] ?? null;
  return {
    id: recipient.assignment.id,
    model: "learning_homework_v2" as const,
    recipientId: recipient.id,
    state: recipient.state,
    currentCycle: recipient.currentCycle,
    acceptedAt: recipient.acceptedAt,
    topic: {
      id: recipient.assignment.topic.id,
      title: recipient.assignment.topic.title,
      masteryCriteria: recipient.assignment.topic.masteryCriteria,
      direction: {
        id: recipient.assignment.topic.direction.id,
        title: recipient.assignment.topic.direction.title,
        crmDirectionId: recipient.assignment.topic.direction.crmDirectionId,
      },
      scope: recipient.assignment.topic.crmGroupId ? "group" as const : "student" as const,
    },
    instructions: recipient.assignment.instructions,
    materials: materialDto(recipient.assignment.materials),
    sourceLessonId: recipient.assignment.sourceLessonId,
    dueAt: recipient.assignment.dueAt,
    assignedAt: recipient.assignment.assignedAt,
    teacherName: fullName(recipient.assignment.createdBy),
    latestAttempt: latestAttempt ? attemptDto(latestAttempt) : null,
    attempts: recipient.attempts.map(attemptDto),
  };
}

async function loadAssignment(assignmentId: string) {
  return prisma.learningHomeworkAssignment.findUnique({
    where: { id: assignmentId },
    include: assignmentInclude,
  });
}

export async function learningHomeworkAssignmentExists(assignmentId: string) {
  if (!learningHomeworkV2Enabled()) return false;
  const assignment = await prisma.learningHomeworkAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true },
  });
  return Boolean(assignment);
}

export async function createLearningHomeworkAssignment(
  teacherUserId: string,
  input: CreateLearningHomeworkAssignmentInput,
) {
  const instructions = input.instructions.trim();
  if (!instructions) {
    throw new BadRequestError("Добавьте текст домашнего задания", "HOMEWORK_INSTRUCTIONS_REQUIRED");
  }
  const materials = normalizeMaterials(input.materials);
  const sourceLessonId = input.sourceLessonId?.trim() || null;
  const topic = await requireScopedTopic(input.topicId);
  const crmStudentIds = await teacherTopicRecipients(teacherUserId, topic);

  const existing = await prisma.learningHomeworkAssignment.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: assignmentInclude,
  });
  if (existing) {
    if (!sameAssignmentRequest(existing, {
      teacherUserId,
      topicId: topic.id,
      instructions,
      sourceLessonId,
      dueAt: input.dueAt,
      materials,
    })) {
      throw new ConflictError(
        "Ключ запроса уже использован для другого домашнего задания",
        "HOMEWORK_IDEMPOTENCY_CONFLICT",
      );
    }
    await notifyLearningHomeworkAssigned(existing);
    return assignmentDto(existing, true);
  }

  const linkedUsers = await prisma.user.findMany({
    where: { crmStudentId: { in: crmStudentIds } },
    select: { id: true, crmStudentId: true },
  });
  const appUserByCrmStudent = new Map(
    linkedUsers
      .filter((user): user is typeof user & { crmStudentId: string } => Boolean(user.crmStudentId))
      .map((user) => [user.crmStudentId, user.id]),
  );

  try {
    const created = await prisma.learningHomeworkAssignment.create({
      data: {
        id: randomUUID(),
        topicId: topic.id,
        sourceLessonId,
        instructions,
        materials,
        dueAt: input.dueAt ?? null,
        createdById: teacherUserId,
        idempotencyKey: input.idempotencyKey,
        recipients: {
          create: crmStudentIds.map((crmStudentId) => ({
            id: randomUUID(),
            crmStudentId,
            studentUserId: appUserByCrmStudent.get(crmStudentId) ?? null,
          })),
        },
      },
      include: assignmentInclude,
    });
    await notifyLearningHomeworkAssigned(created);
    return assignmentDto(created);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.learningHomeworkAssignment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: assignmentInclude,
      });
      if (duplicate && sameAssignmentRequest(duplicate, {
        teacherUserId,
        topicId: topic.id,
        instructions,
        sourceLessonId,
        dueAt: input.dueAt,
        materials,
      })) {
        await notifyLearningHomeworkAssigned(duplicate);
        return assignmentDto(duplicate, true);
      }
      if (duplicate) {
        throw new ConflictError(
          "Ключ запроса уже использован для другого домашнего задания",
          "HOMEWORK_IDEMPOTENCY_CONFLICT",
        );
      }
    }
    throw error;
  }
}

export async function listTeacherLearningHomeworkAssignments(
  teacherUserId: string,
  topicId: string,
) {
  const topic = await requireScopedTopic(topicId);
  await requireTeacherTopicAccess(teacherUserId, topic);
  const assignments = await prisma.learningHomeworkAssignment.findMany({
    where: {
      topicId: topic.id,
      archivedAt: null,
    },
    include: assignmentInclude,
    orderBy: { assignedAt: "desc" },
  });
  return assignments.map((assignment) => assignmentDto(assignment));
}

export async function listStudentLearningHomeworkAssignments(studentUserId: string) {
  const crmStudentId = await requireStudentCrmProfile(studentUserId);
  await prisma.learningHomeworkRecipient.updateMany({
    where: { crmStudentId, studentUserId: null },
    data: { studentUserId },
  });
  const recipients = await prisma.learningHomeworkRecipient.findMany({
    where: {
      crmStudentId,
      assignment: { archivedAt: null },
    },
    include: studentRecipientInclude,
    orderBy: { assignment: { assignedAt: "desc" } },
  });
  return recipients.map(studentAssignmentDto);
}

async function requireStudentRecipient(assignmentId: string, studentUserId: string) {
  const crmStudentId = await requireStudentCrmProfile(studentUserId);
  const recipient = await prisma.learningHomeworkRecipient.findUnique({
    where: { assignmentId_crmStudentId: { assignmentId, crmStudentId } },
    include: studentRecipientInclude,
  });
  if (!recipient || recipient.assignment.archivedAt) {
    throw new AppError(404, "Домашнее задание не найдено", "HOMEWORK_NOT_FOUND");
  }
  return recipient;
}

export async function assertStudentLearningHomeworkAccess(
  assignmentId: string,
  studentUserId: string,
) {
  await requireStudentRecipient(assignmentId, studentUserId);
}

export async function requireLearningHomeworkFileAccess(
  assignmentId: string,
  userId: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { select: { slug: true } } },
  });
  if (!user) throw new ForbiddenError();
  if (user.role.slug === "student") {
    await requireStudentRecipient(assignmentId, userId);
    return;
  }
  const assignment = await loadAssignment(assignmentId);
  if (!assignment || assignment.archivedAt) {
    throw new AppError(404, "Домашнее задание не найдено", "HOMEWORK_NOT_FOUND");
  }
  await requireLearningHomeworkReviewAccess(userId, assignment.topic);
}

export async function listStudentLearningHomeworkAttempts(
  assignmentId: string,
  studentUserId: string,
) {
  const recipient = await requireStudentRecipient(assignmentId, studentUserId);
  return recipient.attempts.map(attemptDto);
}

export async function submitLearningHomeworkAttempt(input: SubmitLearningHomeworkAttemptInput) {
  const materials = normalizeMaterials(input.materials);
  const text = input.text?.trim() || null;
  validateLearningHomeworkSubmission({
    mode: input.mode,
    text,
    materialCount: materials.length,
  });

  const recipient = await requireStudentRecipient(input.assignmentId, input.studentUserId);
  const duplicate = await prisma.learningHomeworkAttempt.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { reviews: true },
  });
  if (duplicate) {
    const expectedMode = input.mode === "materials"
      ? LearningHomeworkSubmissionMode.materials
      : LearningHomeworkSubmissionMode.ready_for_lesson;
    const sameRequest = duplicate.recipientId === recipient.id
      && duplicate.submittedById === input.studentUserId
      && duplicate.submissionMode === expectedMode
      && duplicate.text === text
      && duplicate.previousAttemptId === (input.previousAttemptId ?? null)
      && sameJson(duplicate.materials, materials);
    if (!sameRequest) {
      throw new ConflictError(
        "Ключ запроса уже использован для другого ответа",
        "HOMEWORK_IDEMPOTENCY_CONFLICT",
      );
    }
    const refreshed = await requireStudentRecipient(input.assignmentId, input.studentUserId);
    return { assignment: studentAssignmentDto(refreshed), idempotent: true };
  }

  const latest = recipient.attempts[0] ?? null;
  const coordinates = nextLearningHomeworkAttempt({
    state: recipient.state,
    currentCycle: recipient.currentCycle,
    latestAttempt: latest
      ? {
          id: latest.id,
          attemptNumber: latest.attemptNumber,
          cycleNumber: latest.cycleNumber,
          versionInCycle: latest.versionInCycle,
        }
      : null,
    previousAttemptId: input.previousAttemptId,
  });

  try {
    await prisma.$transaction(async (tx) => {
      if (coordinates.supersedeAttemptId) {
        await tx.learningHomeworkAttempt.update({
          where: { id: coordinates.supersedeAttemptId },
          data: { status: LearningHomeworkAttemptStatus.superseded },
        });
      }
      await tx.learningHomeworkAttempt.create({
        data: {
          id: randomUUID(),
          recipientId: recipient.id,
          attemptNumber: coordinates.attemptNumber,
          cycleNumber: coordinates.cycleNumber,
          versionInCycle: coordinates.versionInCycle,
          submissionMode: input.mode === "materials"
            ? LearningHomeworkSubmissionMode.materials
            : LearningHomeworkSubmissionMode.ready_for_lesson,
          text,
          materials,
          submittedById: input.studentUserId,
          previousAttemptId: input.previousAttemptId ?? null,
          idempotencyKey: input.idempotencyKey,
        },
      });
      await tx.learningHomeworkRecipient.update({
        where: { id: recipient.id },
        data: {
          state: LearningHomeworkRecipientState.waiting_review,
          studentUserId: input.studentUserId,
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError(
        "Ответ уже изменился. Обновите задание и повторите отправку.",
        "HOMEWORK_ATTEMPT_STALE",
      );
    }
    throw error;
  }

  const refreshed = await requireStudentRecipient(input.assignmentId, input.studentUserId);
  await notifyLearningHomeworkSubmitted(refreshed).catch(() => undefined);
  return { assignment: studentAssignmentDto(refreshed), idempotent: false };
}

export async function requireLearningHomeworkReviewAccess(
  reviewerUserId: string,
  topic: ScopedTopic,
) {
  const reviewer = await prisma.user.findUnique({
    where: { id: reviewerUserId },
    include: { role: { select: { slug: true } } },
  });
  if (!reviewer) throw new ForbiddenError();
  if (reviewer.role.slug === "teacher") {
    await requireTeacherTopicAccess(reviewerUserId, topic);
    return;
  }
  if (!isOfflineCoordinatorRole(reviewer.role.slug)) {
    throw new ForbiddenError("Проверка этого ДЗ недоступна");
  }
}

async function applyAcceptedLearningHomeworkXp(params: {
  recipientId: string;
  studentUserId: string | null;
  directionId: string;
  title: string;
  cycleNumber: number;
  reviewedAt: Date;
  reviewerId: string | null;
}) {
  if (!params.studentUserId || !rewardEconomyV2AppliesToEvent(params.reviewedAt)) return;
  const sourceKey = `learning-homework:${params.recipientId}`;
  await awardHomeworkAcceptedXp({
    studentId: params.studentUserId,
    directionId: params.directionId,
    sourceType: "learning_homework",
    sourceKey,
    attemptNumber: params.cycleNumber,
    description: params.cycleNumber > 1
      ? `ДЗ «${params.title}» принято после доработки`
      : `ДЗ «${params.title}» принято с первой попытки`,
    awardedById: params.reviewerId,
    eventAt: params.reviewedAt,
  });
  await prisma.learningHomeworkRecipient.updateMany({
    where: { id: params.recipientId, rewardSourceKey: null },
    data: { rewardSourceKey: sourceKey },
  });
}

export async function reviewLearningHomework(input: ReviewLearningHomeworkInput) {
  const recipient = await prisma.learningHomeworkRecipient.findUnique({
    where: { id: input.recipientId },
    include: {
      assignment: { include: { topic: { include: { direction: true } } } },
      attempts: {
        orderBy: [
          { cycleNumber: "desc" },
          { versionInCycle: "desc" },
        ],
        take: 1,
      },
    },
  });
  if (!recipient || recipient.assignment.archivedAt) {
    throw new AppError(404, "Домашнее задание не найдено", "HOMEWORK_NOT_FOUND");
  }
  await requireLearningHomeworkReviewAccess(input.reviewerUserId, recipient.assignment.topic);

  const decision = input.decision === "revision"
    ? LearningHomeworkReviewDecision.revision
    : input.decision === "accepted_with_comment"
      ? LearningHomeworkReviewDecision.accepted_with_comment
      : LearningHomeworkReviewDecision.accepted;
  const normalizedComment = input.comment?.trim() || null;

  const duplicate = await prisma.learningHomeworkReview.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (duplicate) {
    const sameRequest = duplicate.recipientId === recipient.id
      && duplicate.reviewerId === input.reviewerUserId
      && duplicate.decision === decision
      && duplicate.comment === normalizedComment;
    if (!sameRequest) {
      throw new ConflictError(
        "Ключ запроса уже использован для другой проверки",
        "HOMEWORK_IDEMPOTENCY_CONFLICT",
      );
    }
    if (duplicate.decision !== LearningHomeworkReviewDecision.revision) {
      await applyAcceptedLearningHomeworkXp({
        recipientId: recipient.id,
        studentUserId: recipient.studentUserId,
        directionId: recipient.assignment.topic.directionId,
        title: recipient.assignment.topic.title,
        cycleNumber: duplicate.cycleNumber,
        reviewedAt: duplicate.reviewedAt,
        reviewerId: duplicate.reviewerId,
      });
    }
    return { review: duplicate, idempotent: true };
  }

  const attempt = recipient.attempts[0];
  if (!attempt || attempt.status !== LearningHomeworkAttemptStatus.waiting_review) {
    throw new ConflictError(
      "У задания нет ответа, ожидающего проверки",
      "HOMEWORK_NOT_WAITING_REVIEW",
    );
  }
  const transition = learningHomeworkReviewTransition({
    state: recipient.state,
    currentCycle: recipient.currentCycle,
    decision: input.decision,
    comment: input.comment,
  });
  try {
    const review = await prisma.$transaction(async (tx) => {
      const created = await tx.learningHomeworkReview.create({
        data: {
          id: randomUUID(),
          recipientId: recipient.id,
          attemptId: attempt.id,
          cycleNumber: attempt.cycleNumber,
          decision,
          comment: transition.comment,
          reviewerId: input.reviewerUserId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      await tx.learningHomeworkAttempt.update({
        where: { id: attempt.id },
        data: { status: transition.attemptStatus },
      });
      await tx.learningHomeworkRecipient.update({
        where: { id: recipient.id },
        data: {
          state: transition.recipientState,
          currentCycle: transition.currentCycle,
          acceptedAt: transition.accepted ? new Date() : null,
          finalReviewerId: transition.accepted ? input.reviewerUserId : null,
        },
      });
      return created;
    });
    if (recipient.studentUserId) {
      const body = decision === LearningHomeworkReviewDecision.revision
        ? "Преподаватель вернул домашнее задание на доработку"
        : decision === LearningHomeworkReviewDecision.accepted_with_comment
          ? "Домашнее задание принято с замечанием преподавателя"
          : "Домашнее задание принято";
      await deliverUserNotification({
        userId: recipient.studentUserId,
        type: "homework_reviewed",
        title: "Домашнее задание проверено",
        body,
        url: `/school-lessons?tab=homework&lesson=${recipient.assignment.id}`,
        tag: `learning-homework-review-${review.id}`,
        dedupeKey: `learning-hw:reviewed:${recipient.id}:${review.id}:${recipient.studentUserId}`,
      }).catch(() => undefined);
    }
    if (decision !== LearningHomeworkReviewDecision.revision) {
      await applyAcceptedLearningHomeworkXp({
        recipientId: recipient.id,
        studentUserId: recipient.studentUserId,
        directionId: recipient.assignment.topic.directionId,
        title: recipient.assignment.topic.title,
        cycleNumber: review.cycleNumber,
        reviewedAt: review.reviewedAt,
        reviewerId: review.reviewerId,
      });
    }
    return { review, idempotent: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError(
        "Эта версия ответа уже проверена",
        "HOMEWORK_REVIEW_ALREADY_RECORDED",
      );
    }
    throw error;
  }
}

export async function getLearningHomeworkAssignment(assignmentId: string) {
  const assignment = await loadAssignment(assignmentId);
  if (!assignment || assignment.archivedAt) {
    throw new AppError(404, "Домашнее задание не найдено", "HOMEWORK_NOT_FOUND");
  }
  return assignmentDto(assignment);
}
