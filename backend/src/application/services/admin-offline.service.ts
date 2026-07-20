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
import { BadRequestError } from "../../domain/errors.js";
import {
  mergeOfflineLessonStudentChecks,
  saveOfflineLessonStudentCheck,
  type OfflineHomeworkReviewInput,
} from "./offline-lesson-student-check.service.js";
import { validateOfflineLessonSubmission } from "./offline-lesson-submission-policy.js";
import { generateWhatsappHomeworkDrafts } from "./whatsapp-homework-message.service.js";

type AdminOfflineLesson = {
  teacher?: { crmTeacherId?: string; name?: string } | null;
  classType?: string | null;
  group?: unknown;
  [key: string]: unknown;
};

async function getLessonWithAssignedTeacher(crmClassId: string) {
  const lesson = await fetchClassCard(crmClassId) as AdminOfflineLesson;
  const crmTeacherId = lesson.teacher?.crmTeacherId;
  if (!crmTeacherId) {
    throw new BadRequestError(
      "У урока не назначен преподаватель. Сначала назначьте его в расписании CRM.",
      "LESSON_TEACHER_REQUIRED",
    );
  }
  return { lesson, crmTeacherId };
}

export async function getPendingReviewAgenda() {
  const result = await fetchPendingReviewClasses();
  return { classes: result.classes };
}

export async function getAdminOfflineAgenda() {
  return fetchAdminOfflineClasses();
}

export async function getAdminOfflineClass(crmClassId: string) {
  return fetchClassCard(crmClassId);
}

export async function getAdminOfflineClassStudents(crmClassId: string) {
  const roster = await fetchClassStudents(crmClassId);
  return mergeOfflineLessonStudentChecks(crmClassId, roster);
}

export async function adminOfflineStart(crmClassId: string) {
  const { crmTeacherId } = await getLessonWithAssignedTeacher(crmClassId);
  return postTeacherStart(crmClassId, crmTeacherId);
}

export async function adminOfflineSubmit(
  crmClassId: string,
  payload: Omit<TeacherSubmitPayload, "crmTeacherId">,
) {
  const { lesson, crmTeacherId } = await getLessonWithAssignedTeacher(crmClassId);
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

export async function adminOfflineMarkNotHeld(crmClassId: string, comment: string) {
  const { crmTeacherId } = await getLessonWithAssignedTeacher(crmClassId);
  return postTeacherMarkNotHeld(crmClassId, { crmTeacherId, comment });
}

export async function adminOfflineSetAttendance(
  crmClassId: string,
  studentId: string,
  attendanceStatus: string,
  teacherNote?: string,
  homeworkReview?: OfflineHomeworkReviewInput,
) {
  const crmResult = await postAdminAttendance(crmClassId, {
    studentId,
    attendanceStatus,
    teacherNote,
    attended: ["present", "late"].includes(attendanceStatus),
  });
  const lessonCheck = await saveOfflineLessonStudentCheck({
    crmClassId,
    crmStudentId: studentId,
    attendanceStatus,
    teacherNote,
    homeworkReview,
  });
  return { crmResult, lessonCheck };
}

export async function adminOfflineApprove(
  crmClassId: string,
  payload: {
    deduct?: boolean;
    topic?: string;
    lessonGoals?: string;
    lessonSummary?: string;
    homeworkDraft?: string;
    nextLessonFocus?: string;
    materials?: Array<{ type?: string; url?: string; title?: string }>;
    teacherComment?: string;
    trialReport?: Record<string, unknown>;
  },
) {
  return postAdminApproveClass(crmClassId, payload);
}

export async function adminOfflineReturn(crmClassId: string, reason?: string) {
  return postAdminReturnClass(crmClassId, reason);
}

export async function adminOfflineReopen(crmClassId: string, reason?: string) {
  return postAdminReopenClass(crmClassId, reason);
}

export async function adminOfflineWhatsappDrafts(crmClassId: string, studentId?: string) {
  return {
    drafts: await generateWhatsappHomeworkDrafts(crmClassId, studentId),
  };
}
