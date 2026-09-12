import { LearningPlanTopicState, LearningTopicProgressSource } from "@prisma/client";
import { productFeatureConfig, rewardEconomyV2AppliesToEvent } from "../../config/product-features.js";
import { isOfflineCoordinatorRole } from "../../domain/cms-access.js";
import { AppError, BadRequestError, ForbiddenError } from "../../domain/errors.js";
import { NON_EMPTY_PLAN_COMPLETION_POINTS } from "../../domain/product-economy-v2.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import {
  fetchClassCard,
  fetchClassStudents,
  fetchTeacherGroups,
  fetchTeacherStudents,
} from "../../infrastructure/crm/crm-client.js";
import { aqtobeMonthKey } from "../../lib/aqtobe-month.js";
import { listLearningHomeworkReviewQueue } from "./learning-homework-review-queue.service.js";
import {
  createLearningHomeworkAssignmentForRecipients,
  reviewLearningHomework,
} from "./learning-homework-v2.service.js";
import { updateLearningTopicProgressBatchFromLessonV2 } from "./learning-plan-v2.service.js";
import { requireCrmTeacherId } from "./teacher-students.service.js";
import { previewOfflineLessonAttendanceXp } from "./weekly-league.service.js";
import {
  fetchOfflineLessonWithProjection,
  fetchOfflineRosterWithProjection,
} from "./offline-lesson-projection.service.js";

type LessonCard = {
  crmClassId?: string;
  date?: string;
  startTime?: string;
  status?: string | null;
  classType?: string | null;
  crmIndividualStudentId?: string | null;
  group?: { crmGroupId?: string; name?: string } | null;
  teacher?: { crmTeacherId?: string } | null;
  groupDirection?: string | null;
  trialBooking?: unknown;
  trialParticipant?: unknown;
};

type LessonRoster = {
  students: Array<{
    crmStudentId: string;
    appUserId?: string | null;
    name?: string;
    groupStatus?: string;
  }>;
};

type LessonScope = {
  lesson: LessonCard;
  roster: LessonRoster;
  owner: { kind: "student" | "group"; id: string };
  allowedDirectionTitles: string[] | null;
  reportOnly: boolean;
  canApply: boolean;
  eventAt: Date;
};

export type LearningLessonHomeworkDecision = {
  recipientId: string;
  cycleNumber: number;
  decision: "revision" | "accepted" | "accepted_with_comment";
  comment?: string | null;
};

export type LearningLessonTopicUpdate = {
  topicId: string;
  expectedPercent: number | null;
  toPercent: number;
  comment?: string | null;
};

export type LearningLessonV2ResultsInput = {
  homeworkAssignment?: {
    topicId: string;
    instructions: string;
  } | null;
  homeworkDecisions: LearningLessonHomeworkDecision[];
  topicUpdates: LearningLessonTopicUpdate[];
};

export function learningLessonV2ReferencedTopicIds(
  input: LearningLessonV2ResultsInput | null | undefined,
) {
  const topicIds = new Set(input?.topicUpdates.map((update) => update.topicId) ?? []);
  if (input?.homeworkAssignment?.topicId) {
    topicIds.add(input.homeworkAssignment.topicId);
  }
  return topicIds;
}

export function validateLearningLessonV2TopicReferences(
  input: LearningLessonV2ResultsInput,
  currentTopicIds: readonly string[],
  additionalAllowedTopicIds?: ReadonlySet<string>,
) {
  const allowedTopics = new Set(currentTopicIds);
  for (const topicId of additionalAllowedTopicIds ?? []) {
    allowedTopics.add(topicId);
  }
  for (const update of input.topicUpdates) {
    if (!allowedTopics.has(update.topicId)) {
      throw new ForbiddenError("Тема не принадлежит этому уроку");
    }
  }
  if (input.homeworkAssignment && !allowedTopics.has(input.homeworkAssignment.topicId)) {
    throw new ForbiddenError("Тема домашнего задания не принадлежит этому уроку");
  }
}

/**
 * Reports created before topic-linked homework stored the same teacher text only
 * in `homeworkDraft`. When there is exactly one selected topic, the relationship
 * is unambiguous and can be recovered during approval without changing the
 * immutable report snapshot.
 */
export function withInferredTopicHomeworkAssignment(
  reportPayload: unknown,
  input: LearningLessonV2ResultsInput,
): LearningLessonV2ResultsInput {
  if (Object.prototype.hasOwnProperty.call(input, "homeworkAssignment")) {
    const assignment = (input as unknown as Record<string, unknown>).homeworkAssignment;
    if (!assignment || typeof assignment !== "object" || Array.isArray(assignment)) return input;
    const legacyTopicIds = (assignment as Record<string, unknown>).topicIds;
    if (!Array.isArray(legacyTopicIds)) return input;
    const topicIds = [...new Set(legacyTopicIds.filter(
      (topicId): topicId is string => typeof topicId === "string" && Boolean(topicId.trim()),
    ).map((topicId) => topicId.trim()))];
    if (!topicIds.length) {
      return { ...input, homeworkAssignment: null };
    }
    const instructionsValue = (assignment as Record<string, unknown>).instructions;
    const instructions = typeof instructionsValue === "string" ? instructionsValue.trim() : "";
    if (topicIds.length === 1 && instructions) {
      return {
        ...input,
        homeworkAssignment: { topicId: topicIds[0], instructions },
      };
    }
    return input;
  }
  if (!reportPayload || typeof reportPayload !== "object" || Array.isArray(reportPayload)) {
    return input;
  }
  const homeworkDraft = (reportPayload as Record<string, unknown>).homeworkDraft;
  const instructions = typeof homeworkDraft === "string" ? homeworkDraft.trim() : "";
  if (!instructions || input.topicUpdates.length !== 1) return input;
  return {
    ...input,
    homeworkAssignment: {
      topicId: input.topicUpdates[0].topicId,
      instructions,
    },
  };
}

type LearningLessonV2Context = NonNullable<Awaited<ReturnType<typeof getLearningLessonV2Context>>>;

export function missingLearningHomeworkDecisions(
  students: Array<{
    crmStudentId: string;
    pendingHomework: Array<{ recipientId: string; cycleNumber: number }>;
  }>,
  presentStudentIds: ReadonlySet<string>,
  decisions: LearningLessonHomeworkDecision[],
) {
  const decided = new Set(decisions.map((item) => `${item.recipientId}:${item.cycleNumber}`));
  return students.flatMap((student) => (
    presentStudentIds.has(student.crmStudentId)
      ? student.pendingHomework.filter(
          (item) => !decided.has(`${item.recipientId}:${item.cycleNumber}`),
        )
      : []
  ));
}

export function planCompletionRewardTopicId(plan: {
  completionRewardSourceKey: string | null;
  topics: Array<{
    topicId: string;
    state: LearningPlanTopicState;
    topic: { progressPercent: number | null; archivedAt: Date | null };
  }>;
}) {
  if (plan.completionRewardSourceKey !== null) return null;
  const activeTopics = plan.topics.filter((item) => (
    item.state === LearningPlanTopicState.active
  ));
  const incompleteTopics = activeTopics.filter((item) => item.topic.progressPercent !== 100);
  return incompleteTopics.length === 1 && !incompleteTopics[0].topic.archivedAt
    ? incompleteTopics[0].topicId
    : null;
}

export function learningPlanCompletionRewardPoints(completionRewardSourceKey: string | null) {
  return completionRewardSourceKey === null ? NON_EMPTY_PLAN_COMPLETION_POINTS : 0;
}

export function offlineLessonEventAt(lesson: LessonCard) {
  const source = lesson.date ? new Date(lesson.date) : new Date();
  if (Number.isNaN(source.getTime())) return new Date();
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Aqtobe",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(source);
  const time = /^\d{2}:\d{2}$/.test(lesson.startTime ?? "")
    ? lesson.startTime
    : "12:00";
  return new Date(`${dateKey}T${time}:00+05:00`);
}

function isTrialLesson(lesson: LessonCard) {
  return lesson.classType === "trial"
    || lesson.classType === "repeat_trial"
    || Boolean(lesson.trialBooking || lesson.trialParticipant);
}

export function learningLessonV2Enabled() {
  return productFeatureConfig.flags.learningTopicsV2
    && productFeatureConfig.flags.homeworkFlowV2
    && productFeatureConfig.flags.unifiedLessonV2;
}

export function canApplyLearningLessonResults(role: string, status?: string | null) {
  if (["started", "not_filled"].includes(status ?? "")) return true;
  return isOfflineCoordinatorRole(role) && status === "pending_admin_review";
}

async function resolveLessonScope(actorUserId: string, crmClassId: string): Promise<LessonScope> {
  const [actor, lessonProjected] = await Promise.all([
    prisma.user.findUnique({
      where: { id: actorUserId },
      include: { role: { select: { slug: true } } },
    }),
    productFeatureConfig.flags.lessonSyncV2
      ? fetchOfflineLessonWithProjection(crmClassId)
      : fetchClassCard(crmClassId).then((lesson) => ({ lesson, source: "crm" as const })),
  ]);
  if (!actor) throw new ForbiddenError();
  const lesson = lessonProjected.lesson as LessonCard;
  const rosterProjected = productFeatureConfig.flags.lessonSyncV2
    ? await fetchOfflineRosterWithProjection(crmClassId, lesson as Record<string, unknown>)
    : { roster: await fetchClassStudents(crmClassId) };
  const roster = rosterProjected.roster as LessonRoster;
  const groupId = lesson.group?.crmGroupId;
  const individualStudentId = lesson.crmIndividualStudentId
    ?? (roster.students.length === 1 ? roster.students[0].crmStudentId : null);
  const owner = groupId
    ? { kind: "group" as const, id: groupId }
    : individualStudentId
      ? { kind: "student" as const, id: individualStudentId }
      : null;
  if (!owner) {
    throw new BadRequestError(
      "Не удалось определить ученика или группу урока",
      "LESSON_LEARNING_OWNER_MISSING",
    );
  }
  if (isOfflineCoordinatorRole(actor.role.slug)) {
    return {
      lesson,
      roster,
      owner,
      allowedDirectionTitles: lesson.groupDirection ? [lesson.groupDirection] : null,
      reportOnly: false,
      canApply: canApplyLearningLessonResults(actor.role.slug, lesson.status),
      eventAt: offlineLessonEventAt(lesson),
    };
  }
  if (actor.role.slug !== "teacher") {
    throw new ForbiddenError("Проведение урока недоступно");
  }
  const crmTeacherId = await requireCrmTeacherId(actorUserId);
  if (lesson.teacher?.crmTeacherId !== crmTeacherId) {
    throw new ForbiddenError("Этот урок назначен другому преподавателю");
  }
  if (owner.kind === "group") {
    const groups = await fetchTeacherGroups(crmTeacherId).catch((error) => {
      if (error instanceof AppError && error.statusCode >= 500) {
        return null;
      }
      throw error;
    });
    const group = groups?.groups.find((item) => item.crmGroupId === owner.id);
    const allowedDirectionTitles = group?.direction
      ? [group.direction]
      : (lesson.groupDirection ? [lesson.groupDirection] : null);
    return {
      lesson,
      roster,
      owner,
      allowedDirectionTitles,
      reportOnly: false,
      canApply: canApplyLearningLessonResults(actor.role.slug, lesson.status),
      eventAt: offlineLessonEventAt(lesson),
    };
  }
  const students = await fetchTeacherStudents(crmTeacherId).catch((error) => {
    if (error instanceof AppError && error.statusCode >= 500) {
      return null;
    }
    throw error;
  });
  const student = students?.students.find((item) => item.crmStudentId === owner.id);
  const allowedDirectionTitles = student?.directions && student.directions.length > 0
    ? student.directions
    : (lesson.groupDirection ? [lesson.groupDirection] : null);
  return {
    lesson,
    roster,
    owner,
    allowedDirectionTitles,
    reportOnly: false,
    canApply: canApplyLearningLessonResults(actor.role.slug, lesson.status),
    eventAt: offlineLessonEventAt(lesson),
  };
}

async function lessonPlans(scope: LessonScope) {
  if (scope.reportOnly) return [];
  const month = aqtobeMonthKey(scope.eventAt);
  const plans = await prisma.learningPlan.findMany({
    where: {
      publishedVersionNumber: { not: null },
      month: { lte: month },
      ...(scope.owner.kind === "student"
        ? { crmStudentId: scope.owner.id, crmGroupId: null }
        : { crmStudentId: null, crmGroupId: scope.owner.id }),
      ...(scope.allowedDirectionTitles
        ? { direction: { title: { in: scope.allowedDirectionTitles } } }
        : {}),
    },
    include: {
      direction: true,
      versions: {
        include: {
          topics: {
            orderBy: { sortOrder: "asc" },
            include: { topic: true },
          },
        },
      },
    },
    orderBy: [{ month: "desc" }, { updatedAt: "desc" }],
    take: 24,
  });
  const selectedByDirection = new Map<string, typeof plans[number]>();
  for (const plan of plans) {
    if (!selectedByDirection.has(plan.directionId)) {
      selectedByDirection.set(plan.directionId, plan);
    }
  }
  return [...selectedByDirection.values()].flatMap((plan) => {
    const version = plan.versions.find((item) => item.version === plan.publishedVersionNumber);
    if (!version) return [];
    const completionRewardTopicId = planCompletionRewardTopicId({
      completionRewardSourceKey: plan.completionRewardSourceKey,
      topics: version.topics,
    });
    return [{
      planId: plan.id,
      month: plan.month,
      planCompletionRewardPoints: learningPlanCompletionRewardPoints(
        plan.completionRewardSourceKey,
      ),
      direction: {
        id: plan.direction.id,
        crmDirectionId: plan.direction.crmDirectionId,
        title: plan.direction.title,
      },
      topics: version.topics
        .filter((item) => (
          item.state === LearningPlanTopicState.active
          && !item.topic.archivedAt
        ))
        .map((item) => ({
          id: item.topic.id,
          title: item.titleSnapshot,
          masteryCriteria: item.masteryCriteriaSnapshot,
          progressPercent: item.topic.progressPercent ?? 0,
          masteredAt: item.topic.masteredAt,
          planCompletionRewardPoints: item.topic.id === completionRewardTopicId
            ? NON_EMPTY_PLAN_COMPLETION_POINTS
            : 0,
        })),
    }];
  });
}

export async function getLearningLessonV2Context(actorUserId: string, crmClassId: string) {
  if (!learningLessonV2Enabled()) return null;
  const scope = await resolveLessonScope(actorUserId, crmClassId);
  if (isTrialLesson(scope.lesson)) {
    return {
      enabled: true,
      available: false,
      reason: "trial_lesson" as const,
      owner: scope.owner,
      rewardsEnabled: false,
      canApply: false,
      plans: [],
      students: [],
      rewardPreview: [],
    };
  }
  const plans = await lessonPlans(scope);
  const topicIds = new Set(plans.flatMap((plan) => plan.topics.map((topic) => topic.id)));
  const queue = scope.reportOnly
    ? { items: [] }
    : await listLearningHomeworkReviewQueue({
        reviewerUserId: actorUserId,
        status: "submitted",
        page: 1,
        limit: 100,
      });
  const pending = queue.items.filter((item) => (
    item.ownerId === scope.owner.id
    && topicIds.has(item.topicId ?? "")
  ));
  const rewardsEnabled = productFeatureConfig.flags.rewardEconomyV2
    && rewardEconomyV2AppliesToEvent(scope.eventAt);
  const rewardPreview = await previewOfflineLessonAttendanceXp({
    crmClassId,
    crmStudentIds: scope.roster.students.map((student) => student.crmStudentId),
    eventAt: scope.eventAt,
    rewardsEnabled,
  });
  return {
    enabled: true,
    available: !scope.reportOnly,
    reason: scope.reportOnly ? "one_time_replacement" as const : null,
    owner: scope.owner,
    eventAt: scope.eventAt,
    rewardsEnabled,
    canApply: scope.canApply,
    plans,
    students: scope.roster.students.map((student) => ({
      crmStudentId: student.crmStudentId,
      appUserId: student.appUserId ?? null,
      name: student.name ?? student.crmStudentId,
      pendingHomework: pending
        .filter((item) => item.crmStudentId === student.crmStudentId)
        .map((item) => ({
          recipientId: item.recipientId!,
          assignmentId: item.assignmentId!,
          cycleNumber: item.cycleNumber!,
          versionInCycle: item.versionInCycle!,
          topicId: item.topicId!,
          topicTitle: item.moduleTitle,
          directionTitle: item.courseTitle,
          instructions: item.homeworkDescription,
          submissionMode: item.submissionMode!,
          studentComment: item.studentComment,
          submittedAt: item.submittedAt,
        })),
    })),
    rewardPreview,
  };
}

function validateLearningLessonV2Input(
  context: LearningLessonV2Context,
  input: LearningLessonV2ResultsInput,
  options: {
    requireEditable: boolean;
    requirePendingHomework: boolean;
    additionalAllowedTopicIds?: ReadonlySet<string>;
  },
) {
  if (!context.available) {
    if (
      !input.homeworkDecisions.length
      && !input.topicUpdates.length
      && !input.homeworkAssignment
    ) return;
    throw new ForbiddenError(
      context.reason === "one_time_replacement"
        ? "Разовая замена заполняет только отчёт урока без доступа к учебной истории"
        : "Учебные действия для этого урока недоступны",
    );
  }
  if (options.requireEditable && !context.canApply) {
    throw new BadRequestError(
      "Учебный результат можно изменить только во время открытого урока или его проверки",
      "LESSON_LEARNING_NOT_EDITABLE",
    );
  }
  validateLearningLessonV2ResultDuplicates(input);
  validateLearningLessonV2TopicReferences(
    input,
    context.plans.flatMap((plan) => plan.topics.map((topic) => topic.id)),
    options.additionalAllowedTopicIds,
  );
  const pendingByRecipient = new Map(
    context.students.flatMap((student) => student.pendingHomework)
      .map((item) => [item.recipientId, item]),
  );
  if (options.requirePendingHomework) {
    for (const decision of input.homeworkDecisions) {
      const pending = pendingByRecipient.get(decision.recipientId);
      if (!pending || pending.cycleNumber !== decision.cycleNumber) {
        throw new BadRequestError(
          "Домашнее задание уже изменилось. Обновите урок.",
          "LESSON_HOMEWORK_STALE",
        );
      }
    }
  }
}

export function validateLearningLessonV2ResultDuplicates(input: LearningLessonV2ResultsInput) {
  const topicIds = input.topicUpdates.map((item) => item.topicId);
  if (new Set(topicIds).size !== topicIds.length) {
    throw new BadRequestError("Одна тема указана несколько раз", "LESSON_TOPIC_DUPLICATE");
  }
  const homeworkKeys = input.homeworkDecisions.map(
    (item) => `${item.recipientId}:${item.cycleNumber}`,
  );
  if (new Set(homeworkKeys).size !== homeworkKeys.length) {
    throw new BadRequestError(
      "Одно домашнее задание указано несколько раз",
      "LESSON_HOMEWORK_DECISION_DUPLICATE",
    );
  }
}

export function validateLearningHomeworkAssignmentRecipients(
  input: LearningLessonV2ResultsInput,
  presentStudentIds: ReadonlySet<string>,
) {
  if (!input.homeworkAssignment || presentStudentIds.size > 0) return;
  throw new BadRequestError(
    "Домашнее задание некому назначить: отметьте хотя бы одного присутствующего ученика",
    "HOMEWORK_RECIPIENTS_REQUIRED",
  );
}

export function learningHomeworkAssignmentRecipientsForApproval(
  input: LearningLessonV2ResultsInput,
  approval?: { recipientCrmStudentIds: readonly string[] },
) {
  if (!input.homeworkAssignment || !approval) return null;
  const recipients = [
    ...new Set(approval.recipientCrmStudentIds.map((id) => id.trim()).filter(Boolean)),
  ];
  return recipients.length ? recipients : null;
}

export async function validateLearningLessonV2ResultsForSubmission(
  actorUserId: string,
  crmClassId: string,
  input: LearningLessonV2ResultsInput,
  presentStudentIds: ReadonlySet<string>,
  options: { additionalAllowedTopicIds?: ReadonlySet<string> } = {},
) {
  if (!learningLessonV2Enabled()) return null;
  const context = await getLearningLessonV2Context(actorUserId, crmClassId);
  if (!context) return null;
  validateLearningLessonV2Input(context, input, {
    requireEditable: true,
    requirePendingHomework: true,
    additionalAllowedTopicIds: options.additionalAllowedTopicIds,
  });
  validateLearningHomeworkAssignmentRecipients(input, presentStudentIds);
  if (!context.available) return context;
  const missing = missingLearningHomeworkDecisions(
    context.students,
    presentStudentIds,
    input.homeworkDecisions,
  );
  if (missing.length) {
    throw new BadRequestError(
      "Проверьте прошлое домашнее задание у всех присутствующих учеников.",
      "LESSON_HOMEWORK_REVIEW_REQUIRED",
    );
  }
  return context;
}

export async function applyLearningLessonV2Results(
  actorUserId: string,
  crmClassId: string,
  input: LearningLessonV2ResultsInput,
) {
  if (!learningLessonV2Enabled()) {
    throw new BadRequestError("Новый сценарий урока выключен", "UNIFIED_LESSON_V2_DISABLED");
  }
  const context = await getLearningLessonV2Context(actorUserId, crmClassId);
  if (!context) throw new BadRequestError("Новый сценарий урока выключен", "UNIFIED_LESSON_V2_DISABLED");
  validateLearningLessonV2Input(context, input, {
    requireEditable: true,
    requirePendingHomework: true,
  });
  return applyValidatedLearningLessonV2Results(actorUserId, crmClassId, input, context);
}

async function applyValidatedLearningLessonV2Results(
  actorUserId: string,
  crmClassId: string,
  input: LearningLessonV2ResultsInput,
  context: LearningLessonV2Context,
  approval?: {
    reportVersion: number;
    createdByUserId: string;
    recipientCrmStudentIds: string[];
  },
) {
  const assignmentRecipients = learningHomeworkAssignmentRecipientsForApproval(input, approval);
  const homeworkResults = [];
  for (const decision of input.homeworkDecisions) {
    homeworkResults.push(await reviewLearningHomework({
      recipientId: decision.recipientId,
      reviewerUserId: actorUserId,
      decision: decision.decision,
      comment: decision.comment,
      idempotencyKey: `offline-lesson:${crmClassId}:homework:${decision.recipientId}:${decision.cycleNumber}`,
    }));
  }
  const topicResults = await updateLearningTopicProgressBatchFromLessonV2(
    actorUserId,
    crmClassId,
    input.topicUpdates.map((update) => ({
      topicId: update.topicId,
      expectedPercent: update.expectedPercent,
      toPercent: update.toPercent,
      comment: update.comment ?? undefined,
    })),
    {
      occurredAt: context.eventAt,
      rewardRecipientCrmStudentIds: approval?.recipientCrmStudentIds,
    },
  );
  const homeworkAssignment = input.homeworkAssignment && approval && assignmentRecipients
    ? await createLearningHomeworkAssignmentForRecipients({
        createdByUserId: approval.createdByUserId,
        topicId: input.homeworkAssignment.topicId,
        crmStudentIds: assignmentRecipients,
        instructions: input.homeworkAssignment.instructions,
        sourceLessonId: crmClassId,
        idempotencyKey: `offline-lesson:${crmClassId}:v${approval.reportVersion}:assignment`,
      })
    : null;
  return {
    crmClassId,
    homeworkResults,
    topicResults,
    homeworkAssignment,
  };
}

export async function applyApprovedLearningLessonV2Results(
  actorUserId: string,
  crmClassId: string,
  input: LearningLessonV2ResultsInput,
  approval?: {
    reportVersion: number;
    createdByUserId: string;
    recipientCrmStudentIds: string[];
  },
) {
  if (!learningLessonV2Enabled()) return null;
  const context = await getLearningLessonV2Context(actorUserId, crmClassId);
  if (!context) return null;
  // This immutable report version was fully validated before submission. Finalization may be
  // retried after the current monthly plan has been republished or homework has been consumed
  // by an earlier partial attempt, so only snapshot-internal invariants are checked here.
  validateLearningLessonV2ResultDuplicates(input);
  return applyValidatedLearningLessonV2Results(actorUserId, crmClassId, input, context, approval);
}

export async function quickAddOfflineLessonTopic(
  actorUserId: string,
  crmClassId: string,
  input: { title: string; masteryCriteria?: string; directionId?: string },
) {
  if (!learningLessonV2Enabled()) {
    throw new BadRequestError("Функционал учебных планов V2 отключен", "LEARNING_LESSON_V2_DISABLED");
  }
  const title = input.title.trim();
  if (!title) {
    throw new BadRequestError("Укажите название темы", "TOPIC_TITLE_REQUIRED");
  }
  const masteryCriteria = (input.masteryCriteria ?? "").trim();
  const scope = await resolveLessonScope(actorUserId, crmClassId);
  const month = aqtobeMonthKey(scope.eventAt);

  let direction = null;
  if (input.directionId) {
    direction = await prisma.direction.findFirst({
      where: {
        id: input.directionId,
        deletedAt: null,
      },
    });
  }
  if (!direction) {
    const existingPlan = await prisma.learningPlan.findFirst({
      where: {
        month: { lte: month },
        ...(scope.owner.kind === "student"
          ? { crmStudentId: scope.owner.id, crmGroupId: null }
          : { crmStudentId: null, crmGroupId: scope.owner.id }),
        ...(scope.allowedDirectionTitles && scope.allowedDirectionTitles.length > 0
          ? { direction: { title: { in: scope.allowedDirectionTitles } } }
          : {}),
      },
      include: { direction: true },
      orderBy: [{ month: "desc" }, { updatedAt: "desc" }],
    });
    if (existingPlan?.direction) {
      direction = existingPlan.direction;
    }
  }
  if (!direction && scope.allowedDirectionTitles && scope.allowedDirectionTitles.length > 0) {
    direction = await prisma.direction.findFirst({
      where: {
        title: { in: scope.allowedDirectionTitles },
        deletedAt: null,
      },
    });
  }
  if (!direction) {
    direction = await prisma.direction.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
  }
  if (!direction) {
    throw new BadRequestError("Направление обучения не найдено", "DIRECTION_NOT_FOUND");
  }

  const result = await prisma.$transaction(async (tx) => {
    let plan = await tx.learningPlan.findFirst({
      where: {
        directionId: direction.id,
        month,
        ...(scope.owner.kind === "student"
          ? { crmStudentId: scope.owner.id, crmGroupId: null }
          : { crmStudentId: null, crmGroupId: scope.owner.id }),
      },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          include: {
            topics: {
              orderBy: { sortOrder: "asc" },
              include: { topic: true },
            },
          },
        },
      },
    });

    if (!plan) {
      const planId = crypto.randomUUID();
      const versionId = crypto.randomUUID();
      const topicId = crypto.randomUUID();
      const sourceKey = "v2-plan-item:" + planId + ":" + topicId;

      const createdTopic = await tx.learningTopic.create({
        data: {
          id: topicId,
          directionId: direction.id,
          ...(scope.owner.kind === "student"
            ? { crmStudentId: scope.owner.id, crmGroupId: null }
            : { crmStudentId: null, crmGroupId: scope.owner.id }),
          title,
          masteryCriteria,
          progressPercent: 0,
          createdById: actorUserId,
          responsibleTeacherId: actorUserId,
          legacySourceKey: sourceKey,
          progressHistory: {
            create: {
              fromPercent: null,
              toPercent: 0,
              source: LearningTopicProgressSource.teacher,
              sourceKey: sourceKey + ":progress:create",
              changedById: actorUserId,
              occurredAt: new Date(),
            },
          },
        },
      });

      plan = await tx.learningPlan.create({
        data: {
          id: planId,
          directionId: direction.id,
          month,
          ...(scope.owner.kind === "student"
            ? { crmStudentId: scope.owner.id, crmGroupId: null }
            : { crmStudentId: null, crmGroupId: scope.owner.id }),
          currentVersionNumber: 1,
          publishedVersionNumber: 1,
          createdById: actorUserId,
          versions: {
            create: {
              id: versionId,
              version: 1,
              goal: "Освоить «" + title + "»",
              publishedAt: new Date(),
              createdById: actorUserId,
              topics: {
                create: {
                  topicId: createdTopic.id,
                  state: LearningPlanTopicState.active,
                  sortOrder: 0,
                  titleSnapshot: title,
                  masteryCriteriaSnapshot: masteryCriteria,
                },
              },
            },
          },
        },
        include: {
          versions: {
            include: {
              topics: {
                include: { topic: true },
              },
            },
          },
        },
      });

      return { topic: createdTopic, planId: plan.id };
    }

    const latestVersion = plan.versions[0];
    const existingTopics = latestVersion ? latestVersion.topics : [];

    const duplicate = existingTopics.find(
      (item) => item.state === LearningPlanTopicState.active && item.titleSnapshot.trim().toLowerCase() === title.toLowerCase(),
    );
    if (duplicate) {
      return { topic: duplicate.topic, planId: plan.id };
    }

    const topicId = crypto.randomUUID();
    const sourceKey = "v2-plan-item:" + plan.id + ":" + topicId;
    const createdTopic = await tx.learningTopic.create({
      data: {
        id: topicId,
        directionId: direction.id,
        ...(scope.owner.kind === "student"
          ? { crmStudentId: scope.owner.id, crmGroupId: null }
          : { crmStudentId: null, crmGroupId: scope.owner.id }),
        title,
        masteryCriteria,
        progressPercent: 0,
        createdById: actorUserId,
        responsibleTeacherId: actorUserId,
        legacySourceKey: sourceKey,
        progressHistory: {
          create: {
            fromPercent: null,
            toPercent: 0,
            source: LearningTopicProgressSource.teacher,
            sourceKey: sourceKey + ":progress:create",
            changedById: actorUserId,
            occurredAt: new Date(),
          },
        },
      },
    });

    const nextVersionNum = (plan.currentVersionNumber || 0) + 1;
    await tx.learningPlanVersion.create({
      data: {
        planId: plan.id,
        version: nextVersionNum,
        goal: latestVersion?.goal || ("Освоить «" + title + "»"),
        expectedResult: latestVersion?.expectedResult || "",
        skills: latestVersion?.skills || "",
        checkpoint: latestVersion?.checkpoint || "",
        note: latestVersion?.note || "",
        materials: latestVersion?.materials ?? [],
        publishedAt: new Date(),
        createdById: actorUserId,
        topics: {
          create: [
            ...existingTopics.map((item) => ({
              topicId: item.topicId,
              state: item.state,
              sortOrder: item.sortOrder,
              titleSnapshot: item.titleSnapshot,
              masteryCriteriaSnapshot: item.masteryCriteriaSnapshot,
              replacementTopicId: item.replacementTopicId,
            })),
            {
              topicId: createdTopic.id,
              state: LearningPlanTopicState.active,
              sortOrder: existingTopics.length,
              titleSnapshot: title,
              masteryCriteriaSnapshot: masteryCriteria,
            },
          ],
        },
      },
    });

    await tx.learningPlan.update({
      where: { id: plan.id },
      data: {
        currentVersionNumber: nextVersionNum,
        publishedVersionNumber: nextVersionNum,
        updatedAt: new Date(),
      },
    });

    return { topic: createdTopic, planId: plan.id };
  });

  const updatedContext = await getLearningLessonV2Context(actorUserId, crmClassId);
  return {
    success: true,
    topic: {
      id: result.topic.id,
      title: result.topic.title,
      masteryCriteria: result.topic.masteryCriteria,
    },
    learningV2: updatedContext,
  };
}
