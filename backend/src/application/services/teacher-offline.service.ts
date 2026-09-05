import { prisma } from "../../infrastructure/database/prisma.js";
import { AppError, BadRequestError } from "../../domain/errors.js";
import {
  fetchClassCard,
  fetchClassStudents,
  fetchTeacherOfflineClasses,
  postTeacherFinish,
  postTeacherMarkNotHeld,
  postTeacherWithdraw,
  postTeacherStart,
  postTeacherSubmit,
  postTeacherAttendance,
  type TeacherSubmitPayload,
} from "../../infrastructure/crm/crm-client.js";
import {
  mergeOfflineLessonStudentChecks,
  saveOfflineLessonStudentCheck,
  type OfflineHomeworkReviewInput,
} from "./offline-lesson-student-check.service.js";
import { validateOfflineLessonSubmission } from "./offline-lesson-submission-policy.js";
import { aqtobeMonthKey } from "../../lib/aqtobe-month.js";
import { normalizeTeacherAttendanceStatus } from "./teacher-attendance-policy.js";
import { getLearningLessonV2Context } from "./learning-lesson-v2.service.js";
import { productFeatureConfig } from "../../config/product-features.js";
import {
  fetchOfflineLessonWithProjection,
  fetchOfflineRosterWithProjection,
  getOfflineLessonSyncSummary,
  projectOfflineAgenda,
  updateProjectedOfflineLesson,
  withOfflineLessonSync,
} from "./offline-lesson-projection.service.js";
import {
  enqueueCrmOutboxEvent,
  flushCrmOutboxForLesson,
  processCrmOutboxEvent,
} from "./crm-outbox.service.js";
import {
  submitOfflineLessonReportVersion,
  withdrawOfflineLessonReport,
} from "./offline-lesson-report.service.js";

function lessonSyncV2Enabled() {
  return productFeatureConfig.flags.lessonSyncV2;
}

function lessonMonth(lesson: Record<string, unknown>) {
  const date = typeof lesson.date === "string" ? new Date(lesson.date) : null;
  return date && !Number.isNaN(date.getTime()) ? aqtobeMonthKey(date) : aqtobeMonthKey();
}

async function requireCrmTeacherId(appUserId: string) {
  const user = await prisma.user.findFirst({
    where: { id: appUserId },
    select: { crmTeacherId: true },
  });

  if (!user?.crmTeacherId) {
    throw new BadRequestError(
      "Профиль преподавателя не подключён. Обратитесь к администратору Maestro.",
      "CRM_NOT_LINKED",
    );
  }

  return user.crmTeacherId;
}

function defaultAgendaRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - 30);
  const end = new Date(start);
  end.setDate(end.getDate() + 60);
  return { from: start.toISOString(), to: end.toISOString() };
}

function dedupeOfflineClasses<T extends {
  crmClassId?: unknown;
  title?: unknown;
  date?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  teacher?: { crmTeacherId?: unknown } | null;
  group?: { crmGroupId?: unknown; name?: unknown } | null;
  crmIndividualStudentId?: unknown;
}>(classes: T[]): T[] {
  const seenIds = new Set<string>();
  const seenSignatures = new Set<string>();
  return classes.filter((item) => {
    const crmClassId = typeof item.crmClassId === "string" ? item.crmClassId : "";
    if (crmClassId) {
      if (seenIds.has(crmClassId)) return false;
      seenIds.add(crmClassId);
    }

    const signature = [
      item.date,
      item.startTime,
      item.endTime,
      item.title,
      item.teacher?.crmTeacherId,
      item.group?.crmGroupId ?? item.group?.name,
      item.crmIndividualStudentId,
    ].map((value) => String(value ?? "").trim()).join("|");

    if (signature.replace(/\|/g, "")) {
      if (seenSignatures.has(signature)) return false;
      seenSignatures.add(signature);
    }

    return true;
  });
}

export async function getTeacherOfflineAgenda(
  appUserId: string,
  params?: { from?: string; to?: string },
) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  const fallback = defaultAgendaRange();
  const agenda = await fetchTeacherOfflineClasses(crmTeacherId, {
    from: params?.from ?? fallback.from,
    to: params?.to ?? fallback.to,
  }).catch(async (error) => {
    if (!lessonSyncV2Enabled() || !(error instanceof AppError) || error.statusCode < 500) throw error;
    const projections = await prisma.offlineLessonProjection.findMany({
      where: { crmTeacherId },
      orderBy: { lastSyncedAt: "desc" },
    });
    return {
      crmTeacherId,
      from: params?.from ?? fallback.from,
      to: params?.to ?? fallback.to,
      classes: projections.map((item) => item.lessonPayload as Record<string, unknown>),
      integration: { state: "pending_sync", source: "projection" },
    };
  });
  if (lessonSyncV2Enabled() && Array.isArray(agenda.classes)) {
    await projectOfflineAgenda(agenda.classes);
  }
  return {
    ...agenda,
    classes: Array.isArray(agenda.classes) ? dedupeOfflineClasses(agenda.classes) : [],
  };
}

export async function getTeacherOfflineClass(appUserId: string, crmClassId: string) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  const projected = lessonSyncV2Enabled()
    ? await fetchOfflineLessonWithProjection(crmClassId)
    : { lesson: await fetchClassCard(crmClassId) as Record<string, unknown>, source: "crm" as const };
  const lesson = projected.lesson as {
    teacher?: { crmTeacherId?: string } | null;
    classType?: string | null;
    group?: unknown;
  };
  if (lesson.teacher?.crmTeacherId !== crmTeacherId) {
    throw new BadRequestError("Этот урок назначен другому преподавателю", "LESSON_NOT_ASSIGNED");
  }
  return lessonSyncV2Enabled()
    ? withOfflineLessonSync(crmClassId, lesson as Record<string, unknown>, projected.source)
    : lesson;
}

export async function getTeacherOfflineClassStudents(appUserId: string, crmClassId: string) {
  const lesson = await getTeacherOfflineClass(appUserId, crmClassId) as Record<string, unknown>;
  const projectedRoster = lessonSyncV2Enabled()
    ? await fetchOfflineRosterWithProjection(crmClassId, lesson)
    : { roster: await fetchClassStudents(crmClassId) as Record<string, unknown>, source: "crm" as const };
  const roster = projectedRoster.roster as { students: Array<Record<string, unknown>> };
  const merged = await mergeOfflineLessonStudentChecks(crmClassId, roster, {
    teacherUserId: appUserId,
    month: lessonMonth(lesson),
  });
  const learningV2 = await getLearningLessonV2Context(appUserId, crmClassId);
  return {
    ...merged,
    ...(learningV2 ? { learningV2 } : {}),
    ...(lessonSyncV2Enabled()
      ? { integration: await getOfflineLessonSyncSummary(crmClassId, projectedRoster.source) }
      : {}),
  };
}

export async function teacherOfflineStart(appUserId: string, crmClassId: string) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  try {
    const result = await postTeacherStart(crmClassId, crmTeacherId);
    if (lessonSyncV2Enabled() && result.class && typeof result.class === "object") {
      await projectOfflineAgenda([result.class as Record<string, unknown>]);
    }
    return result;
  } catch (error) {
    if (!lessonSyncV2Enabled() || !(error instanceof AppError) || error.statusCode < 500) throw error;
    await getTeacherOfflineClass(appUserId, crmClassId);
    await updateProjectedOfflineLesson(crmClassId, {
      status: "started",
      startedAt: new Date().toISOString(),
    });
    return { crmClassId, status: "started", syncState: "pending_sync" };
  }
}

export async function teacherOfflineFinish(
  appUserId: string,
  crmClassId: string,
  comment?: string,
) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  try {
    const result = await postTeacherFinish(crmClassId, { crmTeacherId, comment });
    if (lessonSyncV2Enabled() && result.class && typeof result.class === "object") {
      await projectOfflineAgenda([result.class as Record<string, unknown>]);
    }
    return result;
  } catch (error) {
    if (!lessonSyncV2Enabled() || !(error instanceof AppError) || error.statusCode < 500) throw error;
    await getTeacherOfflineClass(appUserId, crmClassId);
    await updateProjectedOfflineLesson(crmClassId, {
      status: "started",
      finishedAt: new Date().toISOString(),
      ...(comment ? { teacherComment: comment } : {}),
    });
    return { crmClassId, status: "started", syncState: "pending_sync" };
  }
}

export async function teacherOfflineSubmit(
  appUserId: string,
  crmClassId: string,
  payload: Omit<TeacherSubmitPayload, "crmTeacherId">,
) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  const lesson = await getTeacherOfflineClass(appUserId, crmClassId);
  const projectedRoster = lessonSyncV2Enabled()
    ? await fetchOfflineRosterWithProjection(crmClassId, lesson as Record<string, unknown>)
    : { roster: await fetchClassStudents(crmClassId) as Record<string, unknown> };
  const roster = await mergeOfflineLessonStudentChecks(
    crmClassId,
    projectedRoster.roster as { students: Array<Record<string, unknown>> },
  );
  const learningV2 = await getLearningLessonV2Context(appUserId, crmClassId);
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
    lesson: {
      classType: typeof (lesson as Record<string, unknown>).classType === "string"
        ? (lesson as Record<string, unknown>).classType as string
        : null,
      group: (lesson as Record<string, unknown>).group,
    },
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
      authorUserId: appUserId,
      crmTeacherId,
      payload: fullPayload,
    });
  }
  return postTeacherSubmit(crmClassId, { ...fullPayload, crmTeacherId });
}

export async function teacherOfflineMarkNotHeld(
  appUserId: string,
  crmClassId: string,
  comment: string,
) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  if (lessonSyncV2Enabled()) {
    await getTeacherOfflineClass(appUserId, crmClassId);
    return submitOfflineLessonReportVersion({
      crmClassId,
      authorUserId: appUserId,
      crmTeacherId,
      payload: { comment, teacherOutcomeHint: "not_held" },
      eventType: "teacher_not_held",
    });
  }
  return postTeacherMarkNotHeld(crmClassId, { crmTeacherId, comment });
}

export async function teacherOfflineWithdraw(appUserId: string, crmClassId: string, reason?: string) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  if (lessonSyncV2Enabled()) {
    return withdrawOfflineLessonReport({
      crmClassId,
      actorUserId: appUserId,
      crmTeacherId,
      reason: reason ?? "Преподаватель отозвал урок для исправления",
    });
  }
  return postTeacherWithdraw(crmClassId, { crmTeacherId, reason });
}

export async function teacherOfflineSetAttendance(
  appUserId: string,
  crmClassId: string,
  studentId: string,
  attendanceStatus: string,
  teacherNote?: string,
  homeworkReview?: OfflineHomeworkReviewInput,
  lessonPoints?: number,
  monthlyPlanId?: string | null,
  planTopicUpdates?: Array<{ itemId: string; status: "in_progress" | "completed" }>,
) {
  await getTeacherOfflineClass(appUserId, crmClassId);
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  const normalizedAttendanceStatus = normalizeTeacherAttendanceStatus(attendanceStatus);
  const attendancePayload = {
    crmTeacherId,
    studentId,
    attendanceStatus: normalizedAttendanceStatus,
    teacherNote,
    homeworkReview,
    attended: ["present", "late"].includes(normalizedAttendanceStatus),
  };
  if (lessonSyncV2Enabled()) {
    const queued = await prisma.$transaction(async (tx) => {
      const lessonCheck = await saveOfflineLessonStudentCheck({
        crmClassId,
        crmStudentId: studentId,
        teacherUserId: appUserId,
        attendanceStatus: normalizedAttendanceStatus,
        teacherNote,
        homeworkReview,
        lessonPoints,
        monthlyPlanId,
        planTopicUpdates,
        syncPending: true,
      }, tx);
      const event = await enqueueCrmOutboxEvent({
        aggregateId: crmClassId,
        eventType: "teacher_attendance",
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
  const crmResult = await postTeacherAttendance(crmClassId, attendancePayload);
  const lessonCheck = await saveOfflineLessonStudentCheck({
    crmClassId,
    crmStudentId: studentId,
    teacherUserId: appUserId,
    attendanceStatus: normalizedAttendanceStatus,
    teacherNote,
    homeworkReview,
    lessonPoints,
    monthlyPlanId,
    planTopicUpdates,
  });
  return { crmResult, lessonCheck };
}

export async function teacherOfflineSetAttendanceBatch(
  appUserId: string,
  crmClassId: string,
  checks: Array<{
    studentId: string;
    attendanceStatus: string;
    teacherNote?: string;
    homeworkReview?: OfflineHomeworkReviewInput;
    lessonPoints?: number;
    monthlyPlanId?: string | null;
    planTopicUpdates?: Array<{ itemId: string; status: "in_progress" | "completed" }>;
  }>,
) {
  const lesson = await getTeacherOfflineClass(appUserId, crmClassId);
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  const results = [];

  for (const check of checks) {
    const normalizedAttendanceStatus = normalizeTeacherAttendanceStatus(check.attendanceStatus);
    const attendancePayload = {
      crmTeacherId,
      studentId: check.studentId,
      attendanceStatus: normalizedAttendanceStatus,
      teacherNote: check.teacherNote,
      homeworkReview: check.homeworkReview,
      attended: ["present", "late"].includes(normalizedAttendanceStatus),
    };
    if (lessonSyncV2Enabled()) {
      const queued = await prisma.$transaction(async (tx) => {
        const lessonCheck = await saveOfflineLessonStudentCheck({
          crmClassId,
          crmStudentId: check.studentId,
          teacherUserId: appUserId,
          attendanceStatus: normalizedAttendanceStatus,
          teacherNote: check.teacherNote,
          homeworkReview: check.homeworkReview,
          lessonPoints: check.lessonPoints,
          monthlyPlanId: check.monthlyPlanId,
          planTopicUpdates: check.planTopicUpdates,
          syncPending: true,
        }, tx);
        const event = await enqueueCrmOutboxEvent({
          aggregateId: crmClassId,
          eventType: "teacher_attendance",
          payload: {
            crmClassId,
            body: attendancePayload,
            studentCheckId: lessonCheck.id,
            studentId: check.studentId,
            syncRevision: lessonCheck.syncRevision,
          },
          idempotencyKey: `lesson-attendance:${crmClassId}:${check.studentId}:r${lessonCheck.syncRevision}`,
        }, tx);
        return { lessonCheck, event };
      });
      results.push({ studentId: check.studentId, crmResult: queued.event, lessonCheck: queued.lessonCheck });
      continue;
    }
    const crmResult = await postTeacherAttendance(crmClassId, attendancePayload);
    const lessonCheck = await saveOfflineLessonStudentCheck({
      crmClassId,
      crmStudentId: check.studentId,
      teacherUserId: appUserId,
      attendanceStatus: normalizedAttendanceStatus,
      teacherNote: check.teacherNote,
      homeworkReview: check.homeworkReview,
      lessonPoints: check.lessonPoints,
      monthlyPlanId: check.monthlyPlanId,
      planTopicUpdates: check.planTopicUpdates,
    });
    results.push({ studentId: check.studentId, crmResult, lessonCheck });
  }

  if (lessonSyncV2Enabled()) {
    await flushCrmOutboxForLesson(crmClassId);
  }

  return {
    crmClassId,
    classStatus: (lesson as { status?: string }).status ?? null,
    savedCount: results.length,
    results,
  };
}
