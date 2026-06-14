import { apiRequest } from "@/lib/api-client";
import type {
  TeacherOfflineClass,
  TeacherOfflineClassStudents,
} from "@/types/teacher-offline";

export type PendingReviewAgenda = {
  classes: TeacherOfflineClass[];
};

export type ApproveOfflineLessonResult = {
  crmClassId: string;
  status: string;
  class: TeacherOfflineClass;
  deductions: Array<{ studentId: string; deducted?: boolean }>;
};

export const adminOfflineApi = {
  pendingReview: () =>
    apiRequest<PendingReviewAgenda>("/admin/offline-lessons/pending-review"),
  classCard: (crmClassId: string) =>
    apiRequest<TeacherOfflineClass>(`/admin/offline-lessons/${encodeURIComponent(crmClassId)}`),
  students: (crmClassId: string) =>
    apiRequest<TeacherOfflineClassStudents>(
      `/admin/offline-lessons/${encodeURIComponent(crmClassId)}/students`,
    ),
  attendance: (crmClassId: string, studentId: string, attendanceStatus: string, teacherNote?: string) =>
    apiRequest<Record<string, unknown>>(
      `/admin/offline-lessons/${encodeURIComponent(crmClassId)}/attendance`,
      { method: "POST", body: JSON.stringify({ studentId, attendanceStatus, teacherNote }) },
    ),
  approve: (
    crmClassId: string,
    body: {
      deduct?: boolean;
      topic?: string;
      lessonGoals?: string;
      lessonSummary?: string;
      homeworkDraft?: string;
      nextLessonFocus?: string;
      teacherComment?: string;
      materials?: Array<{ type?: string; url?: string; title?: string }>;
    },
  ) =>
    apiRequest<ApproveOfflineLessonResult>(
      `/admin/offline-lessons/${encodeURIComponent(crmClassId)}/approve`,
      { method: "POST", body: JSON.stringify(body) },
    ),
};
