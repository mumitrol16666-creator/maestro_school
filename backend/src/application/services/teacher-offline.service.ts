import { prisma } from "../../infrastructure/database/prisma.js";
import { BadRequestError } from "../../domain/errors.js";
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
  });
  return {
    ...agenda,
    classes: Array.isArray(agenda.classes) ? dedupeOfflineClasses(agenda.classes) : [],
  };
}

export async function getTeacherOfflineClass(appUserId: string, crmClassId: string) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  const lesson = await fetchClassCard(crmClassId) as {
    teacher?: { crmTeacherId?: string } | null;
    classType?: string | null;
    group?: unknown;
  };
  if (lesson.teacher?.crmTeacherId !== crmTeacherId) {
    throw new BadRequestError("Этот урок назначен другому преподавателю", "LESSON_NOT_ASSIGNED");
  }
  return lesson;
}

export async function getTeacherOfflineClassStudents(appUserId: string, crmClassId: string) {
  const lesson = await getTeacherOfflineClass(appUserId, crmClassId) as Record<string, unknown>;
  const roster = await fetchClassStudents(crmClassId);
  return mergeOfflineLessonStudentChecks(crmClassId, roster, {
    teacherUserId: appUserId,
    month: lessonMonth(lesson),
  });
}

export async function teacherOfflineStart(appUserId: string, crmClassId: string) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  return postTeacherStart(crmClassId, crmTeacherId);
}

export async function teacherOfflineFinish(
  appUserId: string,
  crmClassId: string,
  comment?: string,
) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  return postTeacherFinish(crmClassId, { crmTeacherId, comment });
}

export async function teacherOfflineSubmit(
  appUserId: string,
  crmClassId: string,
  payload: Omit<TeacherSubmitPayload, "crmTeacherId">,
) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  const lesson = await getTeacherOfflineClass(appUserId, crmClassId);
  const roster = await mergeOfflineLessonStudentChecks(crmClassId, await fetchClassStudents(crmClassId));
  const validation = validateOfflineLessonSubmission({
    lesson,
    students: roster.students,
    payload,
  });
  if (!validation.valid) {
    throw new BadRequestError(validation.message, validation.code);
  }

  return postTeacherSubmit(crmClassId, {
    ...payload,
    teacherOutcomeHint: validation.outcome,
    crmTeacherId,
  });
}

export async function teacherOfflineMarkNotHeld(
  appUserId: string,
  crmClassId: string,
  comment: string,
) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
  return postTeacherMarkNotHeld(crmClassId, { crmTeacherId, comment });
}

export async function teacherOfflineWithdraw(appUserId: string, crmClassId: string, reason?: string) {
  const crmTeacherId = await requireCrmTeacherId(appUserId);
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
  const crmResult = await postTeacherAttendance(crmClassId, {
    crmTeacherId,
    studentId,
    attendanceStatus: normalizedAttendanceStatus,
    teacherNote,
    homeworkReview,
    attended: ["present", "late"].includes(normalizedAttendanceStatus),
  });
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
    const crmResult = await postTeacherAttendance(crmClassId, {
      crmTeacherId,
      studentId: check.studentId,
      attendanceStatus: normalizedAttendanceStatus,
      teacherNote: check.teacherNote,
      homeworkReview: check.homeworkReview,
      attended: ["present", "late"].includes(normalizedAttendanceStatus),
    });
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

  return {
    crmClassId,
    classStatus: (lesson as { status?: string }).status ?? null,
    savedCount: results.length,
    results,
  };
}
