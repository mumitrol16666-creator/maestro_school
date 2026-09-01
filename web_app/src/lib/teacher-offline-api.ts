import { apiRequest } from "@/lib/api-client";
import type {
  TeacherOfflineAgenda,
  TeacherOfflineClass,
  TeacherOfflineClassStudents,
  OfflineHomeworkReview,
  LearningLessonV2ResultsInput,
  TrialLessonReport,
  OfflineLessonServerDraft,
  OfflineLessonReportHistory,
} from "@/types/teacher-offline";

export const teacherOfflineApi = {
  agenda: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const qs = query.toString();
    return apiRequest<TeacherOfflineAgenda>(`/teachers/me/offline-lessons${qs ? `?${qs}` : ""}`);
  },
  classCard: (crmClassId: string) =>
    apiRequest<TeacherOfflineClass>(`/teachers/me/offline-lessons/${encodeURIComponent(crmClassId)}`),
  students: (crmClassId: string) =>
    apiRequest<TeacherOfflineClassStudents>(
      `/teachers/me/offline-lessons/${encodeURIComponent(crmClassId)}/students`,
    ),
  draft: (crmClassId: string) =>
    apiRequest<OfflineLessonServerDraft | null>(
      `/teachers/me/offline-lessons/${encodeURIComponent(crmClassId)}/draft`,
    ),
  saveDraft: (crmClassId: string, expectedRevision: number, payload: Record<string, unknown>) =>
    apiRequest<OfflineLessonServerDraft>(
      `/teachers/me/offline-lessons/${encodeURIComponent(crmClassId)}/draft`,
      { method: "PUT", body: JSON.stringify({ expectedRevision, payload }) },
    ),
  deleteDraft: (crmClassId: string) =>
    apiRequest<{ deleted: number }>(
      `/teachers/me/offline-lessons/${encodeURIComponent(crmClassId)}/draft`,
      { method: "DELETE" },
    ),
  reportVersions: (crmClassId: string) =>
    apiRequest<OfflineLessonReportHistory | null>(
      `/teachers/me/offline-lessons/${encodeURIComponent(crmClassId)}/report-versions`,
    ),
  start: (crmClassId: string) =>
    apiRequest<Record<string, unknown>>(
      `/teachers/me/offline-lessons/${encodeURIComponent(crmClassId)}/start`,
      { method: "POST", body: JSON.stringify({}) },
    ),
  finish: (crmClassId: string, comment?: string) =>
    apiRequest<Record<string, unknown>>(
      `/teachers/me/offline-lessons/${encodeURIComponent(crmClassId)}/finish`,
      { method: "POST", body: JSON.stringify({ comment }) },
    ),
  submit: (
    crmClassId: string,
    body: {
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
    apiRequest<Record<string, unknown>>(
      `/teachers/me/offline-lessons/${encodeURIComponent(crmClassId)}/submit`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  notHeld: (crmClassId: string, comment?: string) =>
    apiRequest<Record<string, unknown>>(
      `/teachers/me/offline-lessons/${encodeURIComponent(crmClassId)}/not-held`,
      { method: "POST", body: JSON.stringify({ comment }) },
    ),
  withdraw: (crmClassId: string, reason: string) =>
    apiRequest<Record<string, unknown>>(
      `/teachers/me/offline-lessons/${encodeURIComponent(crmClassId)}/withdraw`,
      { method: "POST", body: JSON.stringify({ reason }) },
    ),
  attendance: (
    crmClassId: string,
    studentId: string,
    attendanceStatus: string,
    teacherNote?: string,
    homeworkReview?: OfflineHomeworkReview,
    learning?: {
      lessonPoints?: number;
      monthlyPlanId?: string | null;
      planTopicUpdates?: Array<{ itemId: string; status: "in_progress" | "completed" }>;
    },
  ) =>
    apiRequest<Record<string, unknown>>(
      `/teachers/me/offline-lessons/${encodeURIComponent(crmClassId)}/attendance`,
      {
        method: "POST",
        body: JSON.stringify({
          studentId,
          attendanceStatus,
          teacherNote,
          homeworkReview,
          ...learning,
        }),
      },
    ),
  attendanceBatch: (
    crmClassId: string,
    checks: Array<{
      studentId: string;
      attendanceStatus: string;
      teacherNote?: string;
      homeworkReview?: OfflineHomeworkReview;
      lessonPoints?: number;
      monthlyPlanId?: string | null;
      planTopicUpdates?: Array<{ itemId: string; status: "in_progress" | "completed" }>;
    }>,
  ) =>
    apiRequest<{ savedCount: number }>(
      `/teachers/me/offline-lessons/${encodeURIComponent(crmClassId)}/attendance-batch`,
      { method: "POST", body: JSON.stringify({ checks }) },
    ),
  learningResults: (crmClassId: string, body: LearningLessonV2ResultsInput) =>
    apiRequest<Record<string, unknown>>(
      `/teachers/me/offline-lessons/${encodeURIComponent(crmClassId)}/learning-results`,
      { method: "POST", body: JSON.stringify(body) },
    ),
};
