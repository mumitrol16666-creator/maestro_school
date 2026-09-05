import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import {
  fetchClassCard,
  fetchClassStudents,
  fetchAdminOfflineClasses,
  fetchPendingReviewClasses,
  postTeacherMarkNotHeld,
  postTeacherStart,
  postTeacherSubmit,
  postAdminApproveClass,
  postAdminAttendance,
  postAdminReopenClass,
  postAdminReturnClass,
  type TeacherSubmitPayload,
} from "../../infrastructure/crm/crm-client.js";
import { AppError, BadRequestError } from "../../domain/errors.js";
import {
  mergeOfflineLessonStudentChecks,
  saveOfflineLessonStudentCheck,
  type OfflineHomeworkReviewInput,
} from "./offline-lesson-student-check.service.js";
import { validateOfflineLessonSubmission } from "./offline-lesson-submission-policy.js";
import { awardManualPoints } from "./points.service.js";
import { addMaestroCoins } from "./coins.service.js";
import {
  awardLeagueXp,
  awardOfflineLessonAttendanceXp,
} from "./weekly-league.service.js";
import { evaluateAchievements } from "./achievement.service.js";
import { aqtobeMonthKey } from "../../lib/aqtobe-month.js";
import { buildMonthlyPlanSnapshot } from "../../domain/monthly-plan.js";
import {
  getLearningLessonV2Context,
  offlineLessonEventAt,
} from "./learning-lesson-v2.service.js";
import {
  productFeatureConfig,
  rewardEconomyV2AppliesToEvent,
} from "../../config/product-features.js";
import {
  fetchOfflineLessonWithProjection,
  fetchOfflineRosterWithProjection,
  getOfflineLessonSyncSummary,
  projectOfflineAgenda,
  withOfflineLessonSync,
} from "./offline-lesson-projection.service.js";
import {
  enqueueCrmOutboxEvent,
  flushCrmOutboxForLesson,
  processCrmOutboxEvent,
} from "./crm-outbox.service.js";
import {
  markOfflineLessonReportConfirmed,
  reopenOfflineLessonReport,
  submitOfflineLessonReportVersion,
} from "./offline-lesson-report.service.js";

function lessonSyncV2Enabled() {
  return productFeatureConfig.flags.lessonSyncV2;
}

type AdminOfflineLesson = {
  teacher?: { crmTeacherId?: string; name?: string } | null;
  classType?: string | null;
  group?: unknown;
  [key: string]: unknown;
};

type StoredPlanTopicUpdate = {
  itemId: string;
  status: "in_progress" | "completed";
};

type StoredMonthlyPlanItem = {
  id: string;
  title: string;
  status: "planned" | "in_progress" | "completed" | "moved";
};

function lessonMonth(lesson: Record<string, unknown>) {
  const date = typeof lesson.date === "string" ? new Date(lesson.date) : null;
  return date && !Number.isNaN(date.getTime()) ? aqtobeMonthKey(date) : aqtobeMonthKey();
}

export async function applyOfflineLessonLearningResults(
  crmClassId: string,
  approvedBy: string,
  lesson?: AdminOfflineLesson,
) {
  const checks = await prisma.offlineLessonStudentCheck.findMany({
    where: { crmClassId, rewardsAppliedAt: null },
  });
  const results: Array<{
    crmStudentId: string;
    points: number;
    coins: number;
    xp: number;
    planTopics: number;
  }> = [];
  const eventAt = offlineLessonEventAt((lesson ?? {}) as Parameters<typeof offlineLessonEventAt>[0]);
  const useV2Economy = rewardEconomyV2AppliesToEvent(eventAt);
  const trialLesson = ["trial", "repeat_trial"].includes(String(lesson?.classType ?? ""));

  for (const check of checks) {
    const attended = ["present", "late"].includes(check.attendanceStatus);
    if (!attended) {
      await prisma.offlineLessonStudentCheck.update({
        where: { id: check.id },
        data: { rewardsAppliedAt: new Date() },
      });
      results.push({ crmStudentId: check.crmStudentId, points: 0, coins: 0, xp: 0, planTopics: 0 });
      continue;
    }

    if (useV2Economy) {
      const student = await prisma.user.findUnique({
        where: { crmStudentId: check.crmStudentId },
        select: { id: true },
      });
      let awardedXp = 0;
      if (
        student
        && !trialLesson
        && rewardEconomyV2AppliesToEvent(eventAt)
      ) {
        const xpResult = await awardOfflineLessonAttendanceXp({
          studentId: student.id,
          crmStudentId: check.crmStudentId,
          crmClassId,
          eventAt,
          awardedById: check.teacherUserId ?? approvedBy,
        });
        awardedXp = xpResult.awarded ? xpResult.amount : 0;
      }
      await prisma.offlineLessonStudentCheck.update({
        where: { id: check.id },
        data: { rewardsAppliedAt: new Date() },
      });
      results.push({
        crmStudentId: check.crmStudentId,
        points: 0,
        coins: 0,
        xp: awardedXp,
        planTopics: 0,
      });
      continue;
    }

    const updates = Array.isArray(check.planTopicUpdates)
      ? check.planTopicUpdates as StoredPlanTopicUpdate[]
      : [];
    let appliedPlanTopics = 0;
    let completedPlanId: string | null = null;
    const completedPlanTopics: Array<{ id: string; title: string }> = [];

    if (check.monthlyPlanId && updates.length) {
      const plan = await prisma.studentMonthlyPlan.findFirst({
        where: {
          id: check.monthlyPlanId,
          crmStudentId: check.crmStudentId,
        },
      });
      if (plan) {
        completedPlanId = plan.id;
        const byId = new Map(updates.map((item) => [item.itemId, item.status]));
        const items = (Array.isArray(plan.items) ? plan.items : []) as StoredMonthlyPlanItem[];
        const nextItems = items.map((item) => {
          const nextStatus = byId.get(item.id);
          if (!nextStatus || item.status === "moved") return item;
          appliedPlanTopics += 1;
          if (nextStatus === "completed" && item.status !== "completed") {
            completedPlanTopics.push({ id: item.id, title: item.title });
          }
          return {
            ...item,
            status: item.status === "completed" ? "completed" : nextStatus,
          };
        });
        const nextRevision = plan.draftRevision + 1;
        const publishedSnapshot = plan.publishedAt && plan.publishedSnapshot
          ? buildMonthlyPlanSnapshot({ ...plan, items: nextItems })
          : null;
        await prisma.studentMonthlyPlan.update({
          where: { id: plan.id },
          data: {
            items: nextItems as Prisma.InputJsonValue,
            draftRevision: nextRevision,
            ...(publishedSnapshot ? {
              publishedSnapshot: publishedSnapshot as unknown as Prisma.InputJsonValue,
              publishedRevision: nextRevision,
              publishedAt: new Date(),
            } : {}),
          },
        });
      }
    }

    const student = await prisma.user.findUnique({
      where: { crmStudentId: check.crmStudentId },
      select: { id: true },
    });
    let awardedPoints = 0;
    let awardedCoins = 0;
    let awardedXp = 0;

    if (student) {
      const xpResult = await awardLeagueXp({
        studentId: student.id,
        amount: 20,
        sourceType: "offline_lesson",
        sourceKey: `offline-lesson:${crmClassId}:${check.crmStudentId}`,
        description: "Посещение урока с преподавателем",
        awardedById: check.teacherUserId ?? approvedBy,
      });
      awardedXp = xpResult.awarded ? 20 : 0;
      if (completedPlanId) {
        for (const topic of completedPlanTopics) {
          await awardLeagueXp({
            studentId: student.id,
            amount: 3,
            sourceType: "monthly_plan",
            sourceKey: `monthly-plan-topic:${completedPlanId}:${topic.id}`,
            description: `Освоена тема плана «${topic.title}»`,
            awardedById: check.teacherUserId ?? approvedBy,
          });
        }
      }
      const pointsResult = await awardManualPoints({
        studentId: student.id,
        amount: check.lessonPoints,
        reason: "Урок с преподавателем",
        awardedBy: check.teacherUserId ?? approvedBy,
        idempotencyKey: `offline-lesson-points:${crmClassId}:${check.crmStudentId}`,
      });
      awardedPoints = pointsResult.awarded ? check.lessonPoints : 0;

      const coinResult = await addMaestroCoins({
        studentId: student.id,
        amount: 1,
        reason: "Посещение урока с преподавателем",
        sourceType: "offline_lesson",
        sourceId: check.id,
        sourceKey: `offline-lesson:${crmClassId}:${check.crmStudentId}`,
        createdBy: approvedBy,
      });
      awardedCoins = coinResult.awarded ? 1 : 0;
      await evaluateAchievements(student.id);
    }

    await prisma.offlineLessonStudentCheck.update({
      where: { id: check.id },
      data: { rewardsAppliedAt: new Date() },
    });
    results.push({
      crmStudentId: check.crmStudentId,
      points: awardedPoints,
      coins: awardedCoins,
      xp: awardedXp,
      planTopics: appliedPlanTopics,
    });
  }

  return results;
}

async function getLessonWithAssignedTeacher(crmClassId: string) {
  const lesson = lessonSyncV2Enabled()
    ? (await fetchOfflineLessonWithProjection(crmClassId)).lesson as AdminOfflineLesson
    : await fetchClassCard(crmClassId) as AdminOfflineLesson;
  const crmTeacherId = lesson.teacher?.crmTeacherId;
  if (!crmTeacherId) {
    throw new BadRequestError(
      "У урока не назначен преподаватель. Назначьте его в расписании и попробуйте снова.",
      "LESSON_TEACHER_REQUIRED",
    );
  }
  return { lesson, crmTeacherId };
}

export async function getPendingReviewAgenda() {
  const result = await fetchPendingReviewClasses().catch(async (error) => {
    if (!lessonSyncV2Enabled() || !(error instanceof AppError) || error.statusCode < 500) throw error;
    const reports = await prisma.offlineLessonReport.findMany({
      where: { status: { in: ["pending_sync", "pending_review", "conflict"] } },
      include: { projection: true },
      orderBy: { updatedAt: "desc" },
    });
    return {
      classes: reports.map((report) => ({
        ...(report.projection.lessonPayload as Record<string, unknown>),
        integration: {
          state: report.status === "conflict" ? "conflict" : "pending_sync",
          source: "projection",
        },
      })),
    };
  });
  if (lessonSyncV2Enabled()) await projectOfflineAgenda(result.classes);
  return { classes: result.classes };
}

export async function getAdminOfflineAgenda() {
  const result = await fetchAdminOfflineClasses().catch(async (error) => {
    if (!lessonSyncV2Enabled() || !(error instanceof AppError) || error.statusCode < 500) throw error;
    const projections = await prisma.offlineLessonProjection.findMany({
      orderBy: { lastSyncedAt: "desc" },
    });
    return {
      from: "",
      to: "",
      classes: projections.map((item) => item.lessonPayload as Record<string, unknown>),
      integration: { state: "pending_sync", source: "projection" },
    };
  });
  if (lessonSyncV2Enabled()) await projectOfflineAgenda(result.classes);
  return result;
}

export async function getAdminOfflineClass(crmClassId: string) {
  if (!lessonSyncV2Enabled()) return fetchClassCard(crmClassId);
  const projected = await fetchOfflineLessonWithProjection(crmClassId);
  return withOfflineLessonSync(crmClassId, projected.lesson, projected.source);
}

export async function getAdminOfflineClassStudents(actorUserId: string, crmClassId: string) {
  const projectedLesson = lessonSyncV2Enabled()
    ? await fetchOfflineLessonWithProjection(crmClassId)
    : { lesson: await fetchClassCard(crmClassId) as AdminOfflineLesson, source: "crm" as const };
  const lesson = projectedLesson.lesson as AdminOfflineLesson;
  const projectedRoster = lessonSyncV2Enabled()
    ? await fetchOfflineRosterWithProjection(crmClassId, lesson)
    : { roster: await fetchClassStudents(crmClassId), source: "crm" as const };
  const roster = projectedRoster.roster as { students: Array<Record<string, unknown>> };
  const crmTeacherId = lesson.teacher?.crmTeacherId;
  const teacher = crmTeacherId
    ? await prisma.user.findUnique({ where: { crmTeacherId }, select: { id: true } })
    : null;
  const merged = await mergeOfflineLessonStudentChecks(crmClassId, roster, {
    teacherUserId: teacher?.id,
    month: lessonMonth(lesson),
  });
  const learningV2 = await getLearningLessonV2Context(actorUserId, crmClassId);
  return {
    ...merged,
    ...(learningV2 ? { learningV2 } : {}),
    ...(lessonSyncV2Enabled()
      ? { integration: await getOfflineLessonSyncSummary(crmClassId, projectedRoster.source) }
      : {}),
  };
}

export async function adminOfflineStart(crmClassId: string) {
  const { crmTeacherId } = await getLessonWithAssignedTeacher(crmClassId);
  return postTeacherStart(crmClassId, crmTeacherId);
}

export async function adminOfflineSubmit(
  actorUserId: string,
  crmClassId: string,
  payload: Omit<TeacherSubmitPayload, "crmTeacherId">,
) {
  const { lesson, crmTeacherId } = await getLessonWithAssignedTeacher(crmClassId);
  const projectedRoster = lessonSyncV2Enabled()
    ? await fetchOfflineRosterWithProjection(crmClassId, lesson)
    : { roster: await fetchClassStudents(crmClassId) as Record<string, unknown> };
  const roster = await mergeOfflineLessonStudentChecks(
    crmClassId,
    projectedRoster.roster as { students: Array<Record<string, unknown>> },
  );
  const learningV2 = await getLearningLessonV2Context(actorUserId, crmClassId);
  const presentStudentIds = new Set(roster.students
    .filter((student) => ["present", "late"].includes(String(student.attendanceStatus ?? "")))
    .map((student) => String(student.crmStudentId ?? "")));
  const pendingLearningHomework = learningV2?.available
    ? learningV2.students.reduce(
        (total, student) => total + (presentStudentIds.has(student.crmStudentId)
          ? student.pendingHomework.length
          : 0),
        0,
      )
    : 0;
  if (pendingLearningHomework > 0) {
    throw new BadRequestError(
      "Проверьте прошлое домашнее задание у всех присутствующих учеников.",
      "LESSON_HOMEWORK_REVIEW_REQUIRED",
    );
  }
  const validation = validateOfflineLessonSubmission({
    lesson,
    students: roster.students,
    payload,
    requiresLegacyHomeworkReview: !learningV2?.enabled,
  });
  if (!validation.valid) {
    throw new BadRequestError(validation.message, validation.code);
  }

  const fullPayload = {
    ...payload,
    teacherOutcomeHint: validation.outcome,
  };
  if (lessonSyncV2Enabled()) {
    return submitOfflineLessonReportVersion({
      crmClassId,
      authorUserId: actorUserId,
      crmTeacherId,
      payload: fullPayload,
    });
  }
  return postTeacherSubmit(crmClassId, { ...fullPayload, crmTeacherId });
}

export async function adminOfflineMarkNotHeld(actorUserId: string, crmClassId: string, comment: string) {
  const { crmTeacherId } = await getLessonWithAssignedTeacher(crmClassId);
  if (lessonSyncV2Enabled()) {
    return submitOfflineLessonReportVersion({
      crmClassId,
      authorUserId: actorUserId,
      crmTeacherId,
      payload: { comment, teacherOutcomeHint: "not_held" },
      eventType: "teacher_not_held",
    });
  }
  return postTeacherMarkNotHeld(crmClassId, { crmTeacherId, comment });
}

export async function adminOfflineSetAttendance(
  crmClassId: string,
  studentId: string,
  attendanceStatus: string,
  teacherNote?: string,
  homeworkReview?: OfflineHomeworkReviewInput,
  lessonPoints?: number,
  monthlyPlanId?: string | null,
  planTopicUpdates?: StoredPlanTopicUpdate[],
) {
  if (lessonSyncV2Enabled()) await getAdminOfflineClass(crmClassId);
  const attendancePayload = {
    studentId,
    attendanceStatus,
    teacherNote,
    homeworkReview,
    attended: ["present", "late"].includes(attendanceStatus),
  };
  if (lessonSyncV2Enabled()) {
    const queued = await prisma.$transaction(async (tx) => {
      const lessonCheck = await saveOfflineLessonStudentCheck({
        crmClassId,
        crmStudentId: studentId,
        attendanceStatus,
        teacherNote,
        homeworkReview,
        lessonPoints,
        monthlyPlanId,
        planTopicUpdates,
        syncPending: true,
      }, tx);
      const event = await enqueueCrmOutboxEvent({
        aggregateId: crmClassId,
        eventType: "admin_attendance",
        payload: {
          crmClassId,
          body: attendancePayload,
          studentCheckId: lessonCheck.id,
          studentId,
          syncRevision: lessonCheck.syncRevision,
        },
        idempotencyKey: `lesson-attendance:${crmClassId}:${studentId}:r${lessonCheck.syncRevision}`,
      }, tx);
      return { lessonCheck, event };
    });
    const crmResult = await processCrmOutboxEvent(queued.event.id);
    const lessonCheck = await prisma.offlineLessonStudentCheck.findUniqueOrThrow({
      where: { id: queued.lessonCheck.id },
    });
    return { crmResult, lessonCheck };
  }
  const crmResult = await postAdminAttendance(crmClassId, attendancePayload);
  const lessonCheck = await saveOfflineLessonStudentCheck({
    crmClassId,
    crmStudentId: studentId,
    attendanceStatus,
    teacherNote,
    homeworkReview,
    lessonPoints,
    monthlyPlanId,
    planTopicUpdates,
  });
  return { crmResult, lessonCheck };
}

export async function adminOfflineApprove(
  approvedBy: string,
  crmClassId: string,
  payload: {
    deduct?: boolean;
    topic?: string;
    lessonGoals?: string;
    lessonSummary?: string;
    homeworkDraft?: string;
    nextLessonFocus?: string;
    materials?: Array<{ type?: string; url?: string; title?: string; description?: string | null; mimeType?: string | null }>;
    teacherComment?: string;
    trialReport?: Record<string, unknown>;
  },
) {
  if (lessonSyncV2Enabled()) {
    await flushCrmOutboxForLesson(crmClassId);
    const sync = await getOfflineLessonSyncSummary(crmClassId);
    if (sync.pendingCount || sync.conflictCount) {
      throw new BadRequestError(
        sync.conflictCount
          ? "Данные урока расходятся с расписанием. Сначала выберите верную версию в журнале."
          : "Отчёт ещё отправляется. Дождитесь завершения и повторите подтверждение.",
        sync.conflictCount ? "CRM_SYNC_CONFLICT" : "CRM_SYNC_PENDING",
      );
    }
  }
  const lesson = await fetchClassCard(crmClassId) as AdminOfflineLesson;
  const crmResult = await postAdminApproveClass(crmClassId, payload);
  if (lessonSyncV2Enabled()) {
    await markOfflineLessonReportConfirmed(crmClassId);
    const responseClass = (crmResult as { class?: Record<string, unknown> }).class;
    if (responseClass) {
      await projectOfflineAgenda([responseClass]);
    }
  }
  const learningRewards = await applyOfflineLessonLearningResults(crmClassId, approvedBy, lesson);
  return { ...crmResult, learningRewards };
}

export async function adminOfflineReturn(actorUserId: string, crmClassId: string, reason?: string) {
  const result = await postAdminReturnClass(crmClassId, reason);
  if (lessonSyncV2Enabled() && reason) {
    await reopenOfflineLessonReport(crmClassId, actorUserId, reason);
  }
  return result;
}

export async function adminOfflineReopen(actorUserId: string, crmClassId: string, reason?: string) {
  const report = lessonSyncV2Enabled()
    ? await prisma.offlineLessonReport.findUnique({ where: { crmClassId } })
    : null;
  const correction = report && reason ? {
    reportId: report.id,
    reportVersion: report.currentVersion,
    reason,
  } : undefined;
  const result = await postAdminReopenClass(
    crmClassId,
    reason,
    correction,
    correction ? `lesson-correction:${crmClassId}:v${correction.reportVersion}` : undefined,
  );
  if (lessonSyncV2Enabled() && reason) {
    await reopenOfflineLessonReport(crmClassId, actorUserId, reason);
  }
  return { ...result, correction: correction ?? null };
}
