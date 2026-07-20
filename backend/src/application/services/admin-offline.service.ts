import {
  fetchClassCard,
  fetchClassStudents,
  fetchAdminOfflineClasses,
  fetchPendingReviewClasses,
  postAdminApproveClass,
  postAdminAttendance,
  postAdminReopenClass,
  postAdminReturnClass,
} from "../../infrastructure/crm/crm-client.js";
import {
  mergeOfflineLessonStudentChecks,
  saveOfflineLessonStudentCheck,
  type OfflineHomeworkReviewInput,
} from "./offline-lesson-student-check.service.js";

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
