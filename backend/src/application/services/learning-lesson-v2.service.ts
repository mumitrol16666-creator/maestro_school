import { recordApprovedSectorStudy } from "./sector-study.service.js";
import { applyApprovedSectorReadiness } from "./sector-readiness.service.js";
import { LearningPlanTopicState, LearningTopicProgressSource } from "@prisma/client";
import { productFeatureConfig, rewardEconomyV2AppliesToEvent } from "../../config/product-features.js";
import { fetchTeacherGroupsForAccess, fetchTeacherStudentsForAccess } from "./teacher-substitution.service.js";
import { isOfflineCoordinatorRole } from "../../domain/cms-access.js";
import { topicTitleKey } from "../../domain/sector-topic-title.js";
import { AppError, BadRequestError, ConflictError, ForbiddenError } from "../../domain/errors.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import {
  fetchClassCard,
  fetchClassStudents,
} from "../../infrastructure/crm/crm-client.js";
import {
  createLearningHomeworkAssignmentForRecipients,
  reviewLearningHomework,
} from "./learning-homework-v2.service.js";
import {
  type SkippedLessonTopicUpdate,
  updateLearningTopicProgressBatchFromLessonV2,
} from "./learning-plan-v2.service.js";
import {
  applyWaitingLessonTopicConflicts,
  openTopicConflictsFor,
  recordLessonTopicConflicts,
  releaseLessonsWaitingFor,
} from "./lesson-topic-conflicts.service.js";
import { pendingTopicPercentsBefore } from "./lesson-pending-topics.service.js";
import { listHomeworkCheckHistory } from "./learning-homework-v2.service.js";
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
  /** Legacy decision of a submitted answer; reports saved before the percent flow. */
  decision?: "revision" | "accepted" | "accepted_with_comment";
  /** How much of the homework was done, checked at the lesson: 0 = not completed. */
  completionPercent?: number | null;
  comment?: string | null;
};

export type LearningLessonTopicUpdate = {
  topicId: string;
  expectedPercent: number | null;
  toPercent: number;
  comment?: string | null;
};

export type LearningLessonV2ResultsInput = {
  readySectorIds?: string[];
  studiedPlanIds?: string[];
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

/** Open homework (no final decision yet) of these students on these topics, oldest first. */
async function listOpenHomeworkForLesson(crmStudentIds: readonly string[], topicIds: readonly string[]) {
  if (!crmStudentIds.length || !topicIds.length) return [];
  const recipients = await prisma.learningHomeworkRecipient.findMany({
    where: {
      crmStudentId: { in: [...crmStudentIds] },
      state: { in: ["assigned", "waiting_review", "revision"] },
      assignment: { archivedAt: null, topicId: { in: [...topicIds] } },
    },
    include: {
      assignment: { include: { topic: { include: { direction: true } } } },
      attempts: { orderBy: [{ cycleNumber: "desc" }, { versionInCycle: "desc" }], take: 1 },
    },
    orderBy: { assignment: { assignedAt: "asc" } },
  });
  return recipients.map((recipient) => {
    const attempt = recipient.attempts[0] ?? null;
    return {
      crmStudentId: recipient.crmStudentId,
      recipientId: recipient.id,
      assignmentId: recipient.assignmentId,
      cycleNumber: recipient.currentCycle,
      versionInCycle: attempt?.cycleNumber === recipient.currentCycle ? attempt.versionInCycle : 0,
      topicId: recipient.assignment.topicId,
      topicTitle: recipient.assignment.topic.title,
      directionTitle: recipient.assignment.topic.direction.title,
      instructions: recipient.assignment.instructions,
      state: recipient.state,
      assignedAt: recipient.assignment.assignedAt,
      submissionMode: attempt?.status === "waiting_review" ? attempt.submissionMode : null,
      studentComment: attempt?.status === "waiting_review" ? attempt.text : null,
      submittedAt: attempt?.status === "waiting_review" ? attempt.submittedAt : null,
    };
  });
}

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
  // Plan 1.11: an exam lesson may hold several students without a group; it works with no topics.
  const examStudentId = lesson.classType === "exam" ? roster.students[0]?.crmStudentId ?? null : null;
  const owner = groupId
    ? { kind: "group" as const, id: groupId }
    : individualStudentId ?? examStudentId
      ? { kind: "student" as const, id: (individualStudentId ?? examStudentId)! }
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
    const groups = await fetchTeacherGroupsForAccess(crmTeacherId).catch((error) => {
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
  const students = await fetchTeacherStudentsForAccess(crmTeacherId).catch((error) => {
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
  // Previous personal sectors remain available while their exams are pending.
  const plans = await prisma.learningPlan.findMany({
    where: {
      publishedVersionNumber: { not: null },
      status: { in: ["active", "awaiting_exam"] },
      ...(scope.owner.kind === "student"
        ? { crmStudentId: scope.owner.id, crmGroupId: null }
        : { OR: [
            { crmStudentId: null, crmGroupId: scope.owner.id },
            { crmStudentId: { in: scope.roster.students.map(student => student.crmStudentId) }, crmGroupId: null },
          ] }),
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
    orderBy: [{ sequence: "desc" }, { updatedAt: "desc" }],
  });
  const selectedByDirection = new Map<string, typeof plans[number]>();
  for (const plan of plans) {
    const key = `${plan.crmStudentId ?? plan.crmGroupId}:${plan.id}`;
    selectedByDirection.set(key, plan);
  }
  // Plan 1.14: the lesson suggests materials for homework — the sector's own and, per topic, the
  // ones the step template keeps for a topic of the same title.
  const templateIds = [...new Set([...selectedByDirection.values()].map((plan) => plan.templateStepId).filter((id): id is string => Boolean(id)))];
  const templateTopics = templateIds.length
    ? await prisma.sectorTemplateTopic.findMany({ where: { templateId: { in: templateIds } }, select: { templateId: true, title: true, materials: true } })
    : [];
  const templateMaterials = new Map(templateTopics.map((item) => [
    `${item.templateId}:${topicTitleKey(item.title)}`,
    lessonMaterialLinks(item.materials),
  ]));
  return [...selectedByDirection.values()].flatMap((plan) => {
    const version = plan.versions.find((item) => item.version === plan.publishedVersionNumber);
    if (!version) return [];
    // Plans 1.10 and 1.13: no sector closes on a lesson. The teacher closes it after the exam
    // (a group's 250 goes to members who passed), so no topic promises the sector reward.
    return [{
      planId: plan.id,
      sequence: plan.sequence,
      status: plan.status as "active" | "awaiting_exam",
      scope: plan.crmGroupId ? "group" as const : "student" as const,
      sharedGroupPlan:plan.isSharedGroupPlan,
      ownerStudentId: plan.crmStudentId,
      canEditTopics: plan.status === "active" && (scope.owner.kind === "student" || plan.crmGroupId === scope.owner.id),
      ownerName: plan.crmStudentId ? scope.roster.students.find(student => student.crmStudentId === plan.crmStudentId)?.name ?? "Ученик" : "Общий план группы",
      month: plan.month,
      planCompletionRewardPoints: 0,
      direction: {
        id: plan.direction.id,
        crmDirectionId: plan.direction.crmDirectionId,
        title: plan.direction.title,
      },
      materials: lessonMaterialLinks(version.materials),
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
          planCompletionRewardPoints: 0,
          materials: plan.templateStepId
            ? templateMaterials.get(`${plan.templateStepId}:${topicTitleKey(item.titleSnapshot)}`) ?? []
            : [],
        })),
    }];
  });
}

/**
 * 31.10 (Vladislav): a topic continues from the teacher's earlier lesson that is sent but not yet
 * approved — `progressPercent` is what the topic will have after that approval, `approvedPercent`
 * what it has now. The lesson's «было %» then matches the earlier report's «стало %».
 */
async function withPendingTopicPercents(
  crmClassId: string,
  lesson: LessonCard,
  plans: Awaited<ReturnType<typeof lessonPlans>>,
) {
  const topicIds = plans.flatMap((plan) => plan.topics.map((topic) => topic.id));
  const pending = await pendingTopicPercentsBefore(
    { crmClassId, date: lesson.date, startTime: lesson.startTime },
    topicIds,
  );
  const lessonDay = String(lesson.date ?? "").slice(0, 10);
  const conflicts = await openTopicConflictsFor(
    topicIds,
    lessonDay ? `${lessonDay}T${String(lesson.startTime ?? "00:00").slice(0, 5)}` : null,
    crmClassId,
  );
  return plans.map((plan) => ({
    ...plan,
    topics: plan.topics.map((topic) => {
      const waiting = pending.get(topic.id);
      return {
        ...topic,
        approvedPercent: topic.progressPercent,
        progressPercent: waiting?.percent ?? topic.progressPercent,
        pendingFromLesson: waiting
          ? {
              crmClassId: waiting.crmClassId,
              title: waiting.title,
              date: waiting.date,
              startTime: waiting.startTime,
              approvedWaitingForEarlier: waiting.approvedWaitingForEarlier ?? false,
            }
          : null,
        // 04.11/07.11: an approved lesson whose percent for this topic the admin still decides on —
        // an earlier one, or this very lesson (`own`), whose screen otherwise shows «процент изменился».
        percentConflict: !waiting && conflicts.get(topic.id)
          ? { ...conflicts.get(topic.id)!, own: conflicts.get(topic.id)!.crmClassId === crmClassId }
          : null,
      };
    }),
  }));
}

/** Saved material lists (`[{title, url, …}]`) as plain links; anything without a URL is skipped. */
export function lessonMaterialLinks(value: unknown): Array<{ title: string; url: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!url) return [];
    const title = typeof record.title === "string" && record.title.trim() ? record.title.trim() : url;
    return [{ title: title.slice(0, 255), url }];
  });
}

export async function getLearningLessonV2Context(actorUserId: string, crmClassId: string) {
  if (!learningLessonV2Enabled()) return null;
  const scope = await resolveLessonScope(actorUserId, crmClassId);
  if (isTrialLesson(scope.lesson) || scope.lesson.classType === "exam") {
    return {
      enabled: true,
      available: false,
      // The exam itself is marked in the student card; the exam lesson changes no topics.
      reason: scope.lesson.classType === "exam" ? "sector_exam" as const : "trial_lesson" as const,
      owner: scope.owner,
      rewardsEnabled: false,
      canApply: false,
      plans: [],
      examReadiness: [],
      students: [],
      rewardPreview: [],
    };
  }
  const plans = await withPendingTopicPercents(crmClassId, scope.lesson, await lessonPlans(scope));
  const readinessPlans = scope.reportOnly ? [] : await prisma.learningPlan.findMany({
    where: {
      crmStudentId: { in: scope.roster.students.map(student => student.crmStudentId) }, crmGroupId: null,
      publishedVersionNumber: { not: null },
      OR: [{ status: { in: ["active", "awaiting_exam"] } }, { lifecycleEvents: { some: { kind: "exam_ready", crmClassId } } }],
      ...(scope.allowedDirectionTitles ? { direction: { title: { in: scope.allowedDirectionTitles } } } : {}),
    },
    select: { id: true, crmStudentId: true, sequence: true, examReadyAt: true, templateStep:{select:{number:true}}, direction: { select: { title: true } } },
    orderBy: [{ sequence: "desc" }],
  });
  const examReadiness = readinessPlans.map(plan => ({
    planId: plan.id, crmStudentId: plan.crmStudentId!, sequence: plan.templateStep?.number ?? plan.sequence,
    studentName: scope.roster.students.find(student => student.crmStudentId === plan.crmStudentId)?.name ?? "Ученик",
    direction: plan.direction.title, readyAt: plan.examReadyAt,
  }));
  const topicIds = new Set(plans.flatMap((plan) => plan.topics.map((topic) => topic.id)));
  // Every open homework of the roster on the lesson's topics waits for the
  // teacher's check at the lesson, whether or not the student sent an answer.
  const pending = scope.reportOnly
    ? []
    : await listOpenHomeworkForLesson(
        scope.roster.students.map((student) => student.crmStudentId),
        [...topicIds],
      );
  // 01.11: the last checks of the student's homework, with the percent the teacher gave — shown
  // on «Перед уроком» so the teacher sees how the student has been doing.
  const RECENT_HOMEWORK = 3;
  const homeworkHistory = scope.reportOnly
    ? []
    : await listHomeworkCheckHistory(scope.roster.students.map((student) => student.crmStudentId), {
        directionIds: [...new Set(plans.map((plan) => plan.direction.id))],
        reviewedOnly: true,
      });
  homeworkHistory.sort((left, right) => (
    (right.reviews[right.reviews.length - 1]?.reviewedAt.getTime() ?? 0)
    - (left.reviews[left.reviews.length - 1]?.reviewedAt.getTime() ?? 0)
  ));
  const recentHomeworkByStudent = new Map<string, Array<{
    recipientId: string;
    topicTitle: string;
    directionTitle: string;
    instructions: string;
    assignedAt: Date;
    state: string;
    decision: string | null;
    completionPercent: number | null;
    comment: string | null;
    reviewedAt: Date | null;
  }>>();
  for (const item of homeworkHistory) {
    const list = recentHomeworkByStudent.get(item.crmStudentId) ?? [];
    if (list.length >= RECENT_HOMEWORK) continue;
    const last = item.reviews[item.reviews.length - 1] ?? null;
    list.push({
      recipientId: item.recipientId,
      topicTitle: item.topic.title,
      directionTitle: item.directionTitle,
      instructions: item.instructions,
      assignedAt: item.assignedAt,
      state: item.state,
      decision: last?.decision ?? null,
      completionPercent: last?.completionPercent ?? null,
      comment: last?.comment ?? null,
      reviewedAt: last?.reviewedAt ?? null,
    });
    recentHomeworkByStudent.set(item.crmStudentId, list);
  }
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
    examReadiness,
    students: scope.roster.students.map((student) => ({
      crmStudentId: student.crmStudentId,
      appUserId: student.appUserId ?? null,
      name: student.name ?? student.crmStudentId,
      recentHomework: recentHomeworkByStudent.get(student.crmStudentId) ?? [],
      pendingHomework: pending
        .filter((item) => item.crmStudentId === student.crmStudentId)
        .map((item) => ({
          recipientId: item.recipientId,
          assignmentId: item.assignmentId,
          cycleNumber: item.cycleNumber,
          versionInCycle: item.versionInCycle,
          topicId: item.topicId,
          topicTitle: item.topicTitle,
          directionTitle: item.directionTitle,
          instructions: item.instructions,
          state: item.state,
          assignedAt: item.assignedAt,
          submissionMode: item.submissionMode,
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
      && !input.studiedPlanIds?.length
      && !input.readySectorIds?.length
    ) return;
    throw new ForbiddenError(
      context.reason === "one_time_replacement"
        ? "Разовая замена заполняет только отчёт урока без доступа к учебной истории"
        : "Учебные действия для этого урока недоступны",
    );
  }
  if ((input.studiedPlanIds ?? []).some(id => !context.plans.some(plan => plan.planId === id))) {
    throw new ForbiddenError("Учебный план не относится к этому уроку");
  }
  const readinessIds = input.readySectorIds ?? [];
  if (new Set(readinessIds).size !== readinessIds.length || readinessIds.some(id => !context.examReadiness.some(plan => plan.planId === id))) {
    throw new ForbiddenError("Сектор не относится к ученикам и направлению этого урока");
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
  if (new Set(input.readySectorIds ?? []).size !== (input.readySectorIds ?? []).length) {
    throw new BadRequestError("Один сектор готовности указан несколько раз", "SECTOR_READINESS_DUPLICATE");
  }
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
  for (const plan of context.plans) {
    if (!plan.ownerStudentId || presentStudentIds.has(plan.ownerStudentId)) continue;
    if (input.topicUpdates.some(update => plan.topics.some(topic => topic.id === update.topicId))
      || plan.topics.some(topic => topic.id === input.homeworkAssignment?.topicId)) {
      throw new BadRequestError("Личный прогресс и ДЗ можно указать только присутствующему ученику", "PERSONAL_LEARNING_STUDENT_ABSENT");
    }
  }

  if ((input.readySectorIds ?? []).some(id => !presentStudentIds.has(context.examReadiness.find(plan => plan.planId === id)?.crmStudentId ?? ""))) {
    throw new BadRequestError("Готовность к экзамену можно отметить только присутствующему ученику", "SECTOR_READINESS_STUDENT_ABSENT");
  }
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
  // 31.10: «было %» must be the topic's percent now, counting earlier sent lessons. A draft filled
  // before an earlier report changed would otherwise reach approval and never apply.
  const topicsNow = new Map(context.plans.flatMap((plan) => plan.topics.map((topic) => [topic.id, topic] as const)));
  for (const update of input.topicUpdates) {
    const topic = topicsNow.get(update.topicId);
    if (topic && update.expectedPercent !== topic.progressPercent) {
      throw new ConflictError(
        `Процент темы «${topic.title}» изменился: теперь ${topic.progressPercent}%. Обновите «было» у темы в уроке и отправьте снова.`,
        "LESSON_TOPIC_PERCENT_CHANGED",
      );
    }
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
  setAsideMismatchedTopics = false,
) {
  if ((input.readySectorIds?.length || input.studiedPlanIds?.length) && !approval) {
    throw new BadRequestError("Готовность к экзамену применяется после подтверждения урока в CRM", "SECTOR_READINESS_REQUIRES_APPROVAL");
  }
  const assignmentRecipients = learningHomeworkAssignmentRecipientsForApproval(input, approval);
  const homeworkResults = [];
  for (const decision of input.homeworkDecisions) {
    homeworkResults.push(await reviewLearningHomework({
      recipientId: decision.recipientId,
      reviewerUserId: actorUserId,
      decision: decision.decision,
      completionPercent: decision.completionPercent ?? null,
      comment: decision.comment,
      idempotencyKey: `offline-lesson:${crmClassId}:homework:${decision.recipientId}:${decision.cycleNumber}`,
      checkedAtLesson: true,
    }));
  }
  // 04.11: only a CRM-approved lesson sets a mismatched topic aside; the teacher's own apply
  // keeps failing loudly so the teacher refreshes «было».
  const skippedTopics: SkippedLessonTopicUpdate[] | undefined = setAsideMismatchedTopics ? [] : undefined;
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
      skippedTopics,
    },
  );
  // A report can be finalized again after its plan closes. Resolve ownership from the topic,
  // rather than today's open plans, so personal homework never fans out to the whole group.
  const homeworkOwner = input.homeworkAssignment ? (await prisma.learningTopic.findUnique({
    where: { id: input.homeworkAssignment.topicId }, select: { crmStudentId: true },
  }))?.crmStudentId : null;
  const homeworkRecipients = homeworkOwner ? assignmentRecipients?.filter(id => id === homeworkOwner) : assignmentRecipients;
  const homeworkAssignment = input.homeworkAssignment && approval && homeworkRecipients?.length
    ? await createLearningHomeworkAssignmentForRecipients({
        createdByUserId: approval.createdByUserId,
        topicId: input.homeworkAssignment.topicId,
        crmStudentIds: homeworkRecipients,
        instructions: input.homeworkAssignment.instructions,
        sourceLessonId: crmClassId,
        idempotencyKey: `offline-lesson:${crmClassId}:v${approval.reportVersion}:assignment`,
      })
    : null;
  if (approval && input.studiedPlanIds?.length) {
    await recordApprovedSectorStudy({
      planIds: input.studiedPlanIds, crmClassId, reportVersion: approval.reportVersion,
      actorUserId: approval.createdByUserId, eventAt: context.eventAt!,
      recipientCrmStudentIds: approval.recipientCrmStudentIds,
      groupId: context.owner.kind === "group" ? context.owner.id : null,
    });
  }
  const sectorReadiness = approval && input.readySectorIds?.length
    ? await applyApprovedSectorReadiness({
        planIds: input.readySectorIds, recipientCrmStudentIds: approval.recipientCrmStudentIds,
        crmClassId, actorUserId: approval.createdByUserId, reportVersion: approval.reportVersion, eventAt: context.eventAt!,
      }) : { applied: [], skipped: [] };
  return {
    crmClassId,
    sectorReadiness,
    homeworkResults,
    topicResults,
    homeworkAssignment,
    skippedTopics: skippedTopics ?? [],
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
  // Finalization runs only after CRM approved the lesson, so a mismatched topic is set aside.
  const result = await applyValidatedLearningLessonV2Results(actorUserId, crmClassId, input, context, approval, true);
  // Records the set-aside topics, or closes an older version's conflict when nothing is left.
  await recordLessonTopicConflicts({
    crmClassId,
    reportVersion: approval?.reportVersion ?? null,
    approvedBy: actorUserId,
    recipientCrmStudentIds: approval?.recipientCrmStudentIds ?? null,
    occurredAt: context.eventAt ?? null,
    topics: result.skippedTopics,
  });
  const written = result.topicResults.map((topic) => topic.id);
  if (written.length) await applyWaitingLessonTopicConflicts(written);
  // Later lessons that waited for this one: written if the topic is now at their «было», otherwise
  // handed to the admin — never left waiting for a lesson that is already approved.
  await releaseLessonsWaitingFor(crmClassId, "approved");
  return result;
}

/**
 * 01.11 (Vladislav, answer 5в): a topic is renamed or removed right from the lesson. Like the
 * quick topic, the change lands in a new published version of the sector (the draft copies it).
 * A topic without progress is removed and archived; one with progress is deferred
 * (`transferred`) so percents and Points stay; a mastered topic is not removed.
 */
export async function updateOfflineLessonTopic(
  actorUserId: string,
  crmClassId: string,
  topicId: string,
  change: { action: "rename"; title: string; masteryCriteria?: string } | { action: "remove" },
) {
  if (!learningLessonV2Enabled()) {
    throw new BadRequestError("Функционал учебных планов V2 отключен", "LEARNING_LESSON_V2_DISABLED");
  }
  const scope = await resolveLessonScope(actorUserId, crmClassId);
  if (!scope.canApply) {
    throw new ConflictError("Урок уже отправлен или закрыт: темы сектора из него не меняются", "LESSON_NOT_EDITABLE");
  }
  const ownerWhere = scope.owner.kind === "student"
    ? { crmStudentId: scope.owner.id, crmGroupId: null }
    : { crmStudentId: null, crmGroupId: scope.owner.id };
  const topic = await prisma.learningTopic.findFirst({ where: { id: topicId, ...ownerWhere, archivedAt: null } });
  if (!topic) throw new BadRequestError("Тема не найдена в секторе этого урока", "LEARNING_TOPIC_NOT_FOUND");
  const plan = await prisma.learningPlan.findFirst({
    where: {
      status: "active",
      publishedVersionNumber: { not: null },
      directionId: topic.directionId,
      ...ownerWhere,
    },
    include: { versions: { include: { topics: { orderBy: { sortOrder: "asc" } } } } },
    orderBy: [{ sequence: "desc" }, { updatedAt: "desc" }],
  });
  if (!plan || plan.publishedVersionNumber === null) {
    throw new BadRequestError("Сектор с этой темой не опубликован", "QUICK_TOPIC_SECTOR_NOT_PUBLISHED");
  }
  if (plan.lockedAt) throw new ConflictError("Сектор завершён: его темы больше не меняются", "MONTHLY_PLAN_LOCKED");
  const publishedVersionNumber = plan.publishedVersionNumber;
  const published = plan.versions.find((version) => version.version === publishedVersionNumber);
  if (!published) throw new ConflictError("Версия учебного плана не найдена", "MONTHLY_PLAN_VERSION_MISSING");
  if (!published.topics.some((link) => link.topicId === topicId && link.state === LearningPlanTopicState.active)) {
    throw new BadRequestError("Темы нет среди активных тем сектора", "LEARNING_TOPIC_NOT_FOUND");
  }
  const draft = plan.currentVersionNumber > publishedVersionNumber
    ? plan.versions.find((version) => version.version === plan.currentVersionNumber) ?? null
    : null;

  const title = change.action === "rename" ? change.title.trim() : topic.title;
  const masteryCriteria = change.action === "rename" ? (change.masteryCriteria ?? topic.masteryCriteria ?? "").trim() : topic.masteryCriteria;
  if (change.action === "rename" && !title) throw new BadRequestError("Укажите название темы", "TOPIC_TITLE_REQUIRED");
  if (change.action === "remove" && (topic.progressPercent ?? 0) >= 100) {
    throw new ConflictError("Освоенная тема остаётся в секторе: за неё уже начислены баллы", "LEARNING_TOPIC_MASTERED_LOCKED");
  }
  let deferred = false;
  if (change.action === "remove") {
    // Homework on the topic is checked at a lesson; a removed topic would hide it from every lesson.
    const openHomework = await prisma.learningHomeworkRecipient.count({
      where: { assignment: { topicId, archivedAt: null }, state: { in: ["assigned", "waiting_review", "revision"] } },
    });
    if (openHomework > 0) {
      throw new ConflictError(
        "По этой теме есть непроверенное домашнее задание. Проверьте его на уроке, потом убирайте тему.",
        "LEARNING_TOPIC_HAS_OPEN_HOMEWORK",
      );
    }
    // A sent, not yet approved report that moves the topic must still apply, so the topic stays.
    const pendingReport = await prisma.offlineLessonReport.findFirst({
      where: {
        status: { in: ["pending_sync", "pending_review", "approving", "conflict"] },
        versions: { some: { state: "submitted", payload: { path: ["learningResultsV2", "topicUpdates"], array_contains: [{ topicId }] } } },
      },
      select: { crmClassId: true },
    });
    deferred = (topic.progressPercent ?? 0) > 0 || Boolean(pendingReport);
  }

  await prisma.$transaction(async (tx) => {
    if (change.action === "rename") {
      await tx.learningTopic.update({ where: { id: topicId }, data: { title, masteryCriteria } });
    } else if (!deferred) {
      await tx.learningTopic.update({ where: { id: topicId }, data: { archivedAt: new Date() } });
    }
    type Link = typeof published.topics[number];
    const mapLinks = (links: Link[]) => links.flatMap((link, index) => {
      if (link.topicId !== topicId) return [{ ...link, sortOrder: index }];
      if (change.action === "rename") return [{ ...link, titleSnapshot: title, masteryCriteriaSnapshot: masteryCriteria, sortOrder: index }];
      return deferred ? [{ ...link, state: LearningPlanTopicState.transferred, sortOrder: index }] : [];
    }).map((link, index) => ({ ...link, sortOrder: index }));
    const copyVersion = (version: typeof published, versionNumber: number, publishedAt: Date | null) => tx.learningPlanVersion.create({
      data: {
        planId: plan.id,
        version: versionNumber,
        goal: version.goal,
        expectedResult: version.expectedResult,
        skills: version.skills,
        checkpoint: version.checkpoint,
        note: version.note,
        materials: version.materials ?? [],
        publishedAt,
        createdById: actorUserId,
        topics: {
          create: mapLinks(version.topics).map((link) => ({
            topicId: link.topicId,
            state: link.state,
            sortOrder: link.sortOrder,
            titleSnapshot: link.titleSnapshot,
            masteryCriteriaSnapshot: link.masteryCriteriaSnapshot,
            replacementTopicId: link.replacementTopicId,
          })),
        },
      },
    });
    const nextPublished = plan.currentVersionNumber + 1;
    await copyVersion(published, nextPublished, new Date());
    const nextCurrent = draft ? nextPublished + 1 : nextPublished;
    if (draft) await copyVersion(draft, nextCurrent, null);
    const updated = await tx.learningPlan.updateMany({
      where: { id: plan.id, currentVersionNumber: plan.currentVersionNumber, publishedVersionNumber, lockedAt: null },
      data: { currentVersionNumber: nextCurrent, publishedVersionNumber: nextPublished },
    });
    if (updated.count !== 1) {
      throw new ConflictError("Сектор только что изменился. Обновите страницу и повторите.", "MONTHLY_PLAN_STALE_DRAFT");
    }
  });

  return {
    success: true,
    action: change.action,
    deferred,
    topic: { id: topicId, title, masteryCriteria },
    learningV2: await getLearningLessonV2Context(actorUserId, crmClassId),
  };
}

/**
 * Plan 1.6: a teacher adds a topic during the lesson. It goes into the open sector the lesson
 * already shows for the chosen direction: the published version gets the topic, and an unpublished
 * draft keeps the teacher's edits and gets the topic too. Without a published sector there is
 * nowhere to add it: the sector is opened in the student or group card first.
 */
export async function quickAddOfflineLessonTopic(
  actorUserId: string,
  crmClassId: string,
  input: { title: string; masteryCriteria?: string; directionId: string },
) {
  if (!learningLessonV2Enabled()) {
    throw new BadRequestError("Функционал учебных планов V2 отключен", "LEARNING_LESSON_V2_DISABLED");
  }
  const title = input.title.trim();
  if (!title) {
    throw new BadRequestError("Укажите название темы", "TOPIC_TITLE_REQUIRED");
  }
  if (!input.directionId) {
    throw new BadRequestError("Выберите направление сектора", "DIRECTION_REQUIRED");
  }
  const masteryCriteria = (input.masteryCriteria ?? "").trim();
  const scope = await resolveLessonScope(actorUserId, crmClassId);
  if (scope.reportOnly) {
    throw new BadRequestError("На этом уроке темы сектора не меняются", "QUICK_TOPIC_NOT_AVAILABLE");
  }
  const ownerWhere = scope.owner.kind === "student"
    ? { crmStudentId: scope.owner.id, crmGroupId: null }
    : { crmStudentId: null, crmGroupId: scope.owner.id };

  // The same sector the lesson shows for this direction (see lessonPlans).
  const plan = await prisma.learningPlan.findFirst({
    where: {
      directionId: input.directionId,
      status: "active",
      publishedVersionNumber: { not: null },
      ...ownerWhere,
      ...(scope.allowedDirectionTitles
        ? { direction: { title: { in: scope.allowedDirectionTitles } } }
        : {}),
    },
    include: {
      versions: {
        include: {
          topics: {
            orderBy: { sortOrder: "asc" },
            include: { topic: true },
          },
        },
      },
    },
    orderBy: [{ sequence: "desc" }, { updatedAt: "desc" }],
  });
  if (!plan || plan.publishedVersionNumber === null) {
    throw new BadRequestError(
      "По этому направлению нет открытого сектора. Откройте и опубликуйте сектор в карточке ученика.",
      "QUICK_TOPIC_SECTOR_NOT_PUBLISHED",
    );
  }
  if (plan.lockedAt) {
    throw new ConflictError("Сектор завершён: темы в него больше не добавляются", "MONTHLY_PLAN_LOCKED");
  }
  const publishedVersionNumber = plan.publishedVersionNumber;
  const published = plan.versions.find((version) => version.version === publishedVersionNumber);
  if (!published) {
    throw new ConflictError("Версия учебного плана не найдена", "MONTHLY_PLAN_VERSION_MISSING");
  }
  const draft = plan.currentVersionNumber > publishedVersionNumber
    ? plan.versions.find((version) => version.version === plan.currentVersionNumber) ?? null
    : null;

  const sameTitle = (item: { state: LearningPlanTopicState; titleSnapshot: string }) => (
    item.state === LearningPlanTopicState.active
    && item.titleSnapshot.trim().toLowerCase() === title.toLowerCase()
  );
  const duplicate = published.topics.find(sameTitle);

  const topic = duplicate ? duplicate.topic : await prisma.$transaction(async (tx) => {
    const topicId = crypto.randomUUID();
    const sourceKey = "v2-plan-item:" + plan.id + ":" + topicId;
    const createdTopic = await tx.learningTopic.create({
      data: {
        id: topicId,
        directionId: plan.directionId,
        ...ownerWhere,
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
    const newLink = (sortOrder: number) => ({
      topicId: createdTopic.id,
      state: LearningPlanTopicState.active,
      sortOrder,
      titleSnapshot: title,
      masteryCriteriaSnapshot: masteryCriteria,
    });
    const copyVersion = (version: typeof published, versionNumber: number, publishedAt: Date | null) => {
      // A draft that already has a topic with this title points it at the new topic.
      const replaced = version.topics.some(sameTitle);
      return tx.learningPlanVersion.create({
        data: {
          planId: plan.id,
          version: versionNumber,
          goal: version.goal,
          expectedResult: version.expectedResult,
          skills: version.skills,
          checkpoint: version.checkpoint,
          note: version.note,
          materials: version.materials ?? [],
          publishedAt,
          createdById: actorUserId,
          topics: {
            create: [
              ...version.topics.map((item) => ({
                topicId: replaced && sameTitle(item) ? createdTopic.id : item.topicId,
                state: item.state,
                sortOrder: item.sortOrder,
                titleSnapshot: item.titleSnapshot,
                masteryCriteriaSnapshot: item.masteryCriteriaSnapshot,
                replacementTopicId: item.replacementTopicId,
              })),
              ...(replaced ? [] : [newLink(version.topics.length)]),
            ],
          },
        },
      });
    };

    const nextPublished = plan.currentVersionNumber + 1;
    await copyVersion(published, nextPublished, new Date());
    const nextCurrent = draft ? nextPublished + 1 : nextPublished;
    if (draft) await copyVersion(draft, nextCurrent, null);

    const updated = await tx.learningPlan.updateMany({
      where: {
        id: plan.id,
        currentVersionNumber: plan.currentVersionNumber,
        publishedVersionNumber,
        lockedAt: null,
      },
      data: { currentVersionNumber: nextCurrent, publishedVersionNumber: nextPublished },
    });
    if (updated.count !== 1) {
      throw new ConflictError(
        "Сектор только что изменился. Обновите страницу и добавьте тему снова.",
        "MONTHLY_PLAN_STALE_DRAFT",
      );
    }
    return createdTopic;
  });

  const updatedContext = await getLearningLessonV2Context(actorUserId, crmClassId);
  return {
    success: true,
    topic: {
      id: topic.id,
      title: topic.title,
      masteryCriteria: topic.masteryCriteria,
    },
    learningV2: updatedContext,
  };
}
