import { prisma } from "../../infrastructure/database/prisma.js";
import {
  fetchClassCard,
  fetchClassStudents,
  fetchAdminOfflineClasses,
  fetchPendingReviewClasses,
  postTeacherMarkNotHeld,
  postTeacherStart,
  postTeacherSubmit,
  postAdminAttendance,
  postAdminReopenClass,
  postAdminReturnClass,
  type TeacherSubmitPayload,
} from "../../infrastructure/crm/crm-client.js";
import { AppError, BadRequestError, ConflictError } from "../../domain/errors.js";
import {
  mergeOfflineLessonStudentChecks,
  saveOfflineLessonStudentCheck,
  type OfflineHomeworkReviewInput,
} from "./offline-lesson-student-check.service.js";
import { validateOfflineLessonSubmission } from "./offline-lesson-submission-policy.js";
import { aqtobeMonthKey } from "../../lib/aqtobe-month.js";
import {
  getLearningLessonV2Context,
  learningLessonV2ReferencedTopicIds,
  validateLearningLessonV2ResultsForSubmission,
  type LearningLessonV2ResultsInput,
} from "./learning-lesson-v2.service.js";
import { productFeatureConfig } from "../../config/product-features.js";
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
  getCurrentOfflineLessonLearningResultsV2,
  completeOfflineLessonCorrection,
  reserveOfflineLessonCorrection,
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

function lessonMonth(lesson: Record<string, unknown>) {
  const date = typeof lesson.date === "string" ? new Date(lesson.date) : null;
  return date && !Number.isNaN(date.getTime()) ? aqtobeMonthKey(date) : aqtobeMonthKey();
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
  const [learningV2, staged] = await Promise.all([
    getLearningLessonV2Context(actorUserId, crmClassId),
    lessonSyncV2Enabled()
      ? getCurrentOfflineLessonLearningResultsV2(crmClassId)
      : Promise.resolve(null),
  ]);
  const learningV2WithPending = learningV2
    ? { ...learningV2, pendingResults: staged?.learningResultsV2 ?? null }
    : null;
  return {
    ...merged,
    ...(learningV2WithPending ? { learningV2: learningV2WithPending } : {}),
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
  payload: Omit<TeacherSubmitPayload, "crmTeacherId"> & {
    learningResultsV2?: LearningLessonV2ResultsInput;
  },
) {
  const { learningResultsV2, ...crmPayload } = payload;
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
  const stagedLearningResults = learningResultsV2 ?? { homeworkDecisions: [], topicUpdates: [] };
  if (learningV2?.enabled) {
    await validateLearningLessonV2ResultsForSubmission(
      actorUserId,
      crmClassId,
      stagedLearningResults,
      presentStudentIds,
    );
  }
  const validation = validateOfflineLessonSubmission({
    lesson,
    students: roster.students,
    payload: crmPayload,
    requiresLegacyHomeworkReview: !learningV2?.enabled,
  });
  if (!validation.valid) {
    throw new BadRequestError(validation.message, validation.code);
  }

  const fullPayload = {
    ...crmPayload,
    teacherOutcomeHint: validation.outcome,
  };
  if (lessonSyncV2Enabled()) {
    return submitOfflineLessonReportVersion({
      crmClassId,
      authorUserId: actorUserId,
      crmTeacherId,
      payload: fullPayload,
      learningResultsV2: learningV2?.enabled ? stagedLearningResults : undefined,
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

export async function adminOfflineReturn(actorUserId: string, crmClassId: string, reason?: string) {
  if (!lessonSyncV2Enabled()) return postAdminReturnClass(crmClassId, reason);
  if (!reason?.trim()) {
    throw new BadRequestError(
      "Укажите причину возврата отчёта преподавателю.",
      "LESSON_CORRECTION_REASON_REQUIRED",
    );
  }

  const reservation = await reserveOfflineLessonCorrection(crmClassId, actorUserId, reason);
  const result = await postAdminReturnClass(crmClassId, reason);
  await completeOfflineLessonCorrection(reservation);
  return result;
}

export async function adminOfflineReopen(actorUserId: string, crmClassId: string, reason?: string) {
  if (!lessonSyncV2Enabled()) {
    const result = await postAdminReopenClass(crmClassId, reason);
    return { ...result, correction: null };
  }
  if (!reason?.trim()) {
    throw new BadRequestError(
      "Укажите причину переоткрытия отчёта.",
      "LESSON_CORRECTION_REASON_REQUIRED",
    );
  }

  const reservation = await reserveOfflineLessonCorrection(crmClassId, actorUserId, reason);
  const correction = reservation ? {
    reportId: reservation.reportId,
    reportVersion: reservation.reportVersion,
    reason: reservation.reason,
  } : undefined;
  const result = await postAdminReopenClass(
    crmClassId,
    reason,
    correction,
    correction ? `lesson-correction:${crmClassId}:v${correction.reportVersion}` : undefined,
  );
  await completeOfflineLessonCorrection(reservation);
  return { ...result, correction: correction ?? null };
}
