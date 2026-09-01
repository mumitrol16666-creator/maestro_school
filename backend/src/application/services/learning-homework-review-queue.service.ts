import {
  LearningHomeworkRecipientState,
  type Prisma,
} from "@prisma/client";
import { isOfflineCoordinatorRole } from "../../domain/cms-access.js";
import { ForbiddenError } from "../../domain/errors.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import {
  fetchTeacherGroups,
  fetchTeacherStudents,
} from "../../infrastructure/crm/crm-client.js";
import { requireLearningHomeworkReviewAccess } from "./learning-homework-v2.service.js";
import { requireCrmTeacherId } from "./teacher-students.service.js";

export type LearningHomeworkQueueStatus =
  | "submitted"
  | "reviewed"
  | "completed"
  | "rejected";

export type LearningHomeworkQueueInput = {
  reviewerUserId: string;
  status?: LearningHomeworkQueueStatus;
  studentId?: string;
  search?: string;
  page: number;
  limit: number;
};

const attemptInclude = {
  reviews: {
    orderBy: { reviewedAt: "desc" as const },
    include: {
      reviewer: {
        select: { firstName: true, lastName: true, middleName: true },
      },
    },
  },
} satisfies Prisma.LearningHomeworkAttemptInclude;

const queueInclude = {
  student: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      middleName: true,
    },
  },
  assignment: {
    include: {
      createdBy: {
        select: { firstName: true, lastName: true, middleName: true },
      },
      topic: { include: { direction: true } },
    },
  },
  attempts: {
    orderBy: [
      { cycleNumber: "desc" as const },
      { versionInCycle: "desc" as const },
    ],
    take: 1,
    include: attemptInclude,
  },
} satisfies Prisma.LearningHomeworkRecipientInclude;

const detailInclude = {
  ...queueInclude,
  attempts: {
    orderBy: [
      { cycleNumber: "desc" as const },
      { versionInCycle: "desc" as const },
    ],
    include: attemptInclude,
  },
} satisfies Prisma.LearningHomeworkRecipientInclude;

type QueueRecipient = Prisma.LearningHomeworkRecipientGetPayload<{
  include: typeof queueInclude;
}>;

type DetailRecipient = Prisma.LearningHomeworkRecipientGetPayload<{
  include: typeof detailInclude;
}>;

function fullName(person: {
  firstName: string;
  lastName: string;
  middleName?: string | null;
} | null) {
  if (!person) return "";
  return [person.lastName, person.firstName, person.middleName].filter(Boolean).join(" ");
}

function materials(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value : [];
}

async function reviewerScope(reviewerUserId: string): Promise<{
  roleSlug: string;
  where: Prisma.LearningHomeworkRecipientWhereInput;
}> {
  const reviewer = await prisma.user.findUnique({
    where: { id: reviewerUserId },
    include: { role: { select: { slug: true } } },
  });
  if (!reviewer) throw new ForbiddenError();
  if (isOfflineCoordinatorRole(reviewer.role.slug)) {
    return { roleSlug: reviewer.role.slug, where: {} };
  }
  if (reviewer.role.slug !== "teacher") {
    throw new ForbiddenError("Проверка домашних заданий недоступна");
  }

  const crmTeacherId = await requireCrmTeacherId(reviewerUserId);
  const [studentRoster, groupRoster] = await Promise.all([
    fetchTeacherStudents(crmTeacherId),
    fetchTeacherGroups(crmTeacherId),
  ]);
  const topicScopes: Prisma.LearningTopicWhereInput[] = [
    ...studentRoster.students.flatMap((student) => student.directions.map((directionTitle) => ({
      crmStudentId: student.crmStudentId,
      direction: { title: directionTitle },
    }))),
    ...groupRoster.groups.map((group) => ({
      crmGroupId: group.crmGroupId,
      direction: { title: group.direction },
    })),
  ];

  return {
    roleSlug: reviewer.role.slug,
    where: topicScopes.length
      ? { assignment: { topic: { OR: topicScopes } } }
      : { id: { equals: "00000000-0000-0000-0000-000000000000" } },
  };
}

function stateWhere(status?: LearningHomeworkQueueStatus): Prisma.LearningHomeworkRecipientWhereInput {
  if (status === "submitted") return { state: LearningHomeworkRecipientState.waiting_review };
  if (status === "reviewed") {
    return { id: { equals: "00000000-0000-0000-0000-000000000000" } };
  }
  if (status === "completed") {
    return {
      state: {
        in: [
          LearningHomeworkRecipientState.accepted,
          LearningHomeworkRecipientState.accepted_with_comment,
        ],
      },
    };
  }
  if (status === "rejected") return { state: LearningHomeworkRecipientState.revision };
  return {};
}

function queueItem(recipient: QueueRecipient) {
  const latestAttempt = recipient.attempts[0]!;
  return {
    model: "learning_homework_v2" as const,
    submissionId: recipient.id,
    recipientId: recipient.id,
    assignmentId: recipient.assignment.id,
    studentId: recipient.student?.id ?? recipient.crmStudentId,
    crmStudentId: recipient.crmStudentId,
    studentName: fullName(recipient.student) || recipient.crmStudentId,
    studentEmail: recipient.student?.email ?? "",
    courseId: recipient.assignment.topic.direction.id,
    courseTitle: recipient.assignment.topic.direction.title,
    moduleId: recipient.assignment.topic.id,
    moduleTitle: recipient.assignment.topic.title,
    lessonId: recipient.assignment.sourceLessonId ?? recipient.assignment.id,
    lessonTitle: recipient.assignment.topic.title,
    homeworkId: recipient.assignment.id,
    homeworkDescription: recipient.assignment.instructions,
    studentComment: latestAttempt.text,
    attachmentUrl: null,
    attachmentType: null,
    homeworkType: "assignment" as const,
    testScore: null,
    testPassed: null,
    status: recipient.state,
    lessonProgressStatus: `${recipient.assignment.topic.progressPercent}%`,
    submittedAt: latestAttempt.submittedAt,
    reviewedAt: recipient.acceptedAt,
    reviewedBy: fullName(latestAttempt.reviews[0]?.reviewer ?? null) || null,
    reviewComment: latestAttempt.reviews[0]?.comment ?? null,
    submissionMode: latestAttempt.submissionMode,
    cycleNumber: latestAttempt.cycleNumber,
    versionInCycle: latestAttempt.versionInCycle,
    topicId: recipient.assignment.topic.id,
    topicProgressPercent: recipient.assignment.topic.progressPercent,
    scope: recipient.assignment.topic.crmGroupId ? "group" as const : "student" as const,
    ownerId: recipient.assignment.topic.crmGroupId
      ?? recipient.assignment.topic.crmStudentId
      ?? null,
    dueAt: recipient.assignment.dueAt,
    teacherName: fullName(recipient.assignment.createdBy),
  };
}

function attemptItem(attempt: DetailRecipient["attempts"][number]) {
  return {
    id: attempt.id,
    attemptNumber: attempt.attemptNumber,
    cycleNumber: attempt.cycleNumber,
    versionInCycle: attempt.versionInCycle,
    submissionMode: attempt.submissionMode,
    text: attempt.text,
    materials: materials(attempt.materials),
    status: attempt.status,
    previousAttemptId: attempt.previousAttemptId,
    submittedAt: attempt.submittedAt,
    review: attempt.reviews[0]
      ? {
          id: attempt.reviews[0].id,
          decision: attempt.reviews[0].decision,
          comment: attempt.reviews[0].comment,
          reviewedAt: attempt.reviews[0].reviewedAt,
          reviewerName: fullName(attempt.reviews[0].reviewer),
        }
      : null,
  };
}

export async function listLearningHomeworkReviewQueue(input: LearningHomeworkQueueInput) {
  const scope = await reviewerScope(input.reviewerUserId);
  const search = input.search?.trim();
  const conditions: Prisma.LearningHomeworkRecipientWhereInput[] = [
    scope.where,
    stateWhere(input.status),
    { assignment: { archivedAt: null } },
    { attempts: { some: {} } },
  ];
  if (input.studentId) {
    conditions.push({
      OR: [
        { studentUserId: input.studentId },
        { crmStudentId: input.studentId },
      ],
    });
  }
  if (search) {
    const insensitive = { contains: search, mode: "insensitive" as const };
    conditions.push({
      OR: [
        { student: { firstName: insensitive } },
        { student: { lastName: insensitive } },
        { student: { middleName: insensitive } },
        { student: { email: insensitive } },
        { crmStudentId: insensitive },
        { assignment: { instructions: insensitive } },
        { assignment: { topic: { title: insensitive } } },
        { assignment: { topic: { direction: { title: insensitive } } } },
      ],
    });
  }
  const where: Prisma.LearningHomeworkRecipientWhereInput = { AND: conditions };
  const skip = (input.page - 1) * input.limit;
  const [rows, total] = await prisma.$transaction([
    prisma.learningHomeworkRecipient.findMany({
      where,
      include: queueInclude,
      orderBy: { updatedAt: "desc" },
      skip,
      take: input.limit,
    }),
    prisma.learningHomeworkRecipient.count({ where }),
  ]);
  return {
    items: rows.map(queueItem),
    total,
    scope: scope.roleSlug === "teacher" ? "teacher" as const : "school" as const,
  };
}

export async function getLearningHomeworkReviewDetail(
  recipientId: string,
  reviewerUserId: string,
) {
  const recipient = await prisma.learningHomeworkRecipient.findUnique({
    where: { id: recipientId },
    include: detailInclude,
  });
  if (!recipient || recipient.assignment.archivedAt || !recipient.attempts.length) return null;
  await requireLearningHomeworkReviewAccess(reviewerUserId, recipient.assignment.topic);
  const latest = recipient.attempts[0];
  return {
    ...queueItem({ ...recipient, attempts: [latest] }),
    assignmentMaterials: materials(recipient.assignment.materials),
    masteryCriteria: recipient.assignment.topic.masteryCriteria,
    canReview: latest.status === "waiting_review",
    attempts: recipient.attempts.map(attemptItem),
  };
}

export async function learningHomeworkReviewRecipientExists(recipientId: string) {
  const recipient = await prisma.learningHomeworkRecipient.findUnique({
    where: { id: recipientId },
    select: { id: true },
  });
  return Boolean(recipient);
}
