import { apiRequest } from "@/lib/api-client";
import type {
  TeacherOfflineClass,
  TeacherOfflineClassStudents,
  OfflineHomeworkReview,
  TrialLessonReport,
  WhatsappHomeworkMessageDraft,
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
  agenda: () =>
    apiRequest<{ from: string; to: string; classes: TeacherOfflineClass[] }>("/admin/offline-lessons"),
  pendingReview: () =>
    apiRequest<PendingReviewAgenda>("/admin/offline-lessons/pending-review"),
  classCard: (crmClassId: string) =>
    apiRequest<TeacherOfflineClass>(`/admin/offline-lessons/${encodeURIComponent(crmClassId)}`),
  students: (crmClassId: string) =>
    apiRequest<TeacherOfflineClassStudents>(
      `/admin/offline-lessons/${encodeURIComponent(crmClassId)}/students`,
    ),
  startForTeacher: (crmClassId: string) =>
    apiRequest(`/admin/offline-lessons/${encodeURIComponent(crmClassId)}/start-for-teacher`, {
      method: "POST",
    }),
  submitForTeacher: (
    crmClassId: string,
    payload: {
      topic?: string;
      lessonGoals?: string;
      lessonSummary?: string;
      homeworkDraft?: string;
      nextLessonFocus?: string;
      materials?: Array<{ type?: string; url?: string; title?: string; description?: string | null; mimeType?: string | null }>;
      teacherOutcomeHint?: "held" | "not_held" | "no_submission";
      trialReport?: TrialLessonReport;
      comment?: string;
    },
  ) =>
    apiRequest(`/admin/offline-lessons/${encodeURIComponent(crmClassId)}/submit-for-teacher`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  notHeldForTeacher: (crmClassId: string, comment: string) =>
    apiRequest(`/admin/offline-lessons/${encodeURIComponent(crmClassId)}/not-held-for-teacher`, {
      method: "POST",
      body: JSON.stringify({ comment }),
    }),
  attendance: (
    crmClassId: string,
    studentId: string,
    attendanceStatus: string,
    teacherNote?: string,
    homeworkReview?: OfflineHomeworkReview,
  ) =>
    apiRequest<Record<string, unknown>>(
      `/admin/offline-lessons/${encodeURIComponent(crmClassId)}/attendance`,
      { method: "POST", body: JSON.stringify({ studentId, attendanceStatus, teacherNote, homeworkReview }) },
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
      materials?: Array<{ type?: string; url?: string; title?: string; description?: string | null; mimeType?: string | null }>;
      trialReport?: TrialLessonReport;
    },
  ) =>
    apiRequest<ApproveOfflineLessonResult>(
      `/admin/offline-lessons/${encodeURIComponent(crmClassId)}/approve`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  returnToTeacher: (crmClassId: string, reason: string) =>
    apiRequest<Record<string, unknown>>(
      `/admin/offline-lessons/${encodeURIComponent(crmClassId)}/return-to-teacher`,
      { method: "POST", body: JSON.stringify({ reason }) },
    ),
  reopen: (crmClassId: string, reason: string) =>
    apiRequest<Record<string, unknown>>(
      `/admin/offline-lessons/${encodeURIComponent(crmClassId)}/reopen`,
      { method: "POST", body: JSON.stringify({ reason }) },
    ),
  whatsappHomeworkDrafts: (crmClassId: string, studentId?: string) =>
    apiRequest<{ drafts: WhatsappHomeworkMessageDraft[] }>(
      `/admin/offline-lessons/${encodeURIComponent(crmClassId)}/whatsapp-homework-drafts`,
      { method: "POST", body: JSON.stringify({ studentId }) },
    ),
};
