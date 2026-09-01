import { LearningPlanTopicState } from "@prisma/client";
import { productFeatureConfig, rewardEconomyV2AppliesToEvent } from "../../config/product-features.js";
import { isOfflineCoordinatorRole } from "../../domain/cms-access.js";
import { AppError, BadRequestError, ForbiddenError } from "../../domain/errors.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import {
  fetchClassCard,
  fetchClassStudents,
  fetchTeacherGroups,
  fetchTeacherStudents,
} from "../../infrastructure/crm/crm-client.js";
import { aqtobeMonthKey } from "../../lib/aqtobe-month.js";
import { listLearningHomeworkReviewQueue } from "./learning-homework-review-queue.service.js";
import { reviewLearningHomework } from "./learning-homework-v2.service.js";
import { updateLearningTopicProgressFromLessonV2 } from "./learning-plan-v2.service.js";
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
      if (productFeatureConfig.flags.lessonSyncV2 && error instanceof AppError && error.statusCode >= 500) {
        return null;
      }
      throw error;
    });
    if (!groups) {
      return {
        lesson,
        roster,
        owner,
        allowedDirectionTitles: [],
        reportOnly: true,
        canApply: canApplyLearningLessonResults(actor.role.slug, lesson.status),
        eventAt: offlineLessonEventAt(lesson),
      };
    }
    const group = groups.groups.find((item) => item.crmGroupId === owner.id);
    return {
      lesson,
      roster,
      owner,
      allowedDirectionTitles: group ? [group.direction] : [],
      reportOnly: !group,
      canApply: canApplyLearningLessonResults(actor.role.slug, lesson.status),
      eventAt: offlineLessonEventAt(lesson),
    };
  }
  const students = await fetchTeacherStudents(crmTeacherId).catch((error) => {
    if (productFeatureConfig.flags.lessonSyncV2 && error instanceof AppError && error.statusCode >= 500) {
      return null;
    }
    throw error;
  });
  if (!students) {
    return {
      lesson,
      roster,
      owner,
      allowedDirectionTitles: [],
      reportOnly: true,
      canApply: canApplyLearningLessonResults(actor.role.slug, lesson.status),
      eventAt: offlineLessonEventAt(lesson),
    };
  }
  const student = students.students.find((item) => item.crmStudentId === owner.id);
  return {
    lesson,
    roster,
    owner,
    allowedDirectionTitles: student?.directions ?? [],
    reportOnly: !student,
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
    return [{
      planId: plan.id,
      month: plan.month,
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

export async function applyLearningLessonV2Results(
  actorUserId: string,
  crmClassId: string,
  input: {
    homeworkDecisions: LearningLessonHomeworkDecision[];
    topicUpdates: LearningLessonTopicUpdate[];
  },
) {
  if (!learningLessonV2Enabled()) {
    throw new BadRequestError("Новый сценарий урока выключен", "UNIFIED_LESSON_V2_DISABLED");
  }
  const context = await getLearningLessonV2Context(actorUserId, crmClassId);
  if (!context?.available) {
    throw new ForbiddenError(
      context?.reason === "one_time_replacement"
        ? "Разовая замена заполняет только отчёт урока без доступа к учебной истории"
        : "Учебные действия для этого урока недоступны",
    );
  }
  if (!context.canApply) {
    throw new BadRequestError(
      "Учебный результат можно изменить только во время открытого урока или его проверки",
      "LESSON_LEARNING_NOT_EDITABLE",
    );
  }
  const allowedTopics = new Set(context.plans.flatMap((plan) => plan.topics.map((topic) => topic.id)));
  const pendingByRecipient = new Map(
    context.students.flatMap((student) => student.pendingHomework)
      .map((item) => [item.recipientId, item]),
  );
  for (const update of input.topicUpdates) {
    if (!allowedTopics.has(update.topicId)) {
      throw new ForbiddenError("Тема не принадлежит этому уроку");
    }
  }
  for (const decision of input.homeworkDecisions) {
    const pending = pendingByRecipient.get(decision.recipientId);
    if (!pending || pending.cycleNumber !== decision.cycleNumber) {
      throw new BadRequestError(
        "Домашнее задание уже изменилось. Обновите урок.",
        "LESSON_HOMEWORK_STALE",
      );
    }
  }
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
  const topicResults = [];
  for (const update of input.topicUpdates) {
    topicResults.push(await updateLearningTopicProgressFromLessonV2(
      actorUserId,
      update.topicId,
      {
        crmClassId,
        expectedPercent: update.expectedPercent,
        toPercent: update.toPercent,
        comment: update.comment ?? undefined,
        occurredAt: context.eventAt,
      },
    ));
  }
  return {
    crmClassId,
    homeworkResults,
    topicResults,
  };
}
