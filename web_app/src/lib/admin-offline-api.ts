import { apiRequest } from "@/lib/api-client";
import type {
  TeacherOfflineClass,
  TeacherOfflineClassStudents,
  OfflineHomeworkReview,
  LearningLessonV2Context,
  LearningLessonV2ResultsInput,
  TrialLessonReport,
  OfflineLessonServerDraft,
  OfflineLessonReportHistory,
} from "@/types/teacher-offline";

export type PendingReviewAgenda = {
  classes: TeacherOfflineClass[];
};

export type CrmSyncJournal = {
  events: Array<{
    id: string;
    eventType: string;
    status: string;
    attempts: number;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  conflicts: Array<{
    id: string;
    outboxEventId: string | null;
    kind: string;
    status: string;
    errorMessage: string;
    createdAt: string;
  }>;
};

export const adminOfflineApi = {
  syncJournal: (crmClassId?: string) => {
    const query = crmClassId ? `?crmClassId=${encodeURIComponent(crmClassId)}` : "";
    return apiRequest<CrmSyncJournal>(`/admin/crm-sync-journal${query}`);
  },
  retrySyncEvent: (eventId: string) =>
    apiRequest<Record<string, unknown>>(
      `/admin/crm-sync-journal/events/${encodeURIComponent(eventId)}/retry`,
      { method: "POST", body: JSON.stringify({}) },
    ),
  resolveSyncConflict: (
    conflictId: string,
    resolution: "accept_crm" | "retry_local",
    reason: string,
  ) =>
    apiRequest<Record<string, unknown>>(
      `/admin/crm-sync-journal/conflicts/${encodeURIComponent(conflictId)}/resolve`,
      { method: "POST", body: JSON.stringify({ resolution, reason }) },
    ),
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
  draft: (crmClassId: string) =>
    apiRequest<OfflineLessonServerDraft | null>(
      `/admin/offline-lessons/${encodeURIComponent(crmClassId)}/draft`,
    ),
  saveDraft: (crmClassId: string, expectedRevision: number, payload: Record<string, unknown>) =>
    apiRequest<OfflineLessonServerDraft>(
      `/admin/offline-lessons/${encodeURIComponent(crmClassId)}/draft`,
      { method: "PUT", body: JSON.stringify({ expectedRevision, payload }) },
    ),
  deleteDraft: (crmClassId: string) =>
    apiRequest<{ deleted: number }>(
      `/admin/offline-lessons/${encodeURIComponent(crmClassId)}/draft`,
      { method: "DELETE" },
    ),
  reportVersions: (crmClassId: string) =>
    apiRequest<OfflineLessonReportHistory | null>(
      `/admin/offline-lessons/${encodeURIComponent(crmClassId)}/report-versions`,
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
      learningResultsV2?: LearningLessonV2ResultsInput;
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
    learning?: {
      lessonPoints?: number;
      monthlyPlanId?: string | null;
      planTopicUpdates?: Array<{ itemId: string; status: "in_progress" | "completed" }>;
    },
  ) =>
    apiRequest<Record<string, unknown>>(
      `/admin/offline-lessons/${encodeURIComponent(crmClassId)}/attendance`,
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

  returnToTeacher: (crmClassId: string, reason: string) =>
    apiRequest<Record<string, unknown>>(
      `/admin/offline-lessons/${encodeURIComponent(crmClassId)}/return-to-teacher`,
      { method: "POST", body: JSON.stringify({ reason }) },
    ),
  quickAddTopic: (
    crmClassId: string,
    data: { title: string; masteryCriteria?: string; directionId?: string },
  ) =>
    apiRequest<{
      success: boolean;
      topic: { id: string; title: string; masteryCriteria: string };
      learningV2: LearningLessonV2Context;
    }>(
      `/admin/offline-lessons/${encodeURIComponent(crmClassId)}/quick-topic`,
      { method: "POST", body: JSON.stringify(data) },
    ),
  reopen: (crmClassId: string, reason: string) =>
    apiRequest<Record<string, unknown>>(
      `/admin/offline-lessons/${encodeURIComponent(crmClassId)}/reopen`,
      { method: "POST", body: JSON.stringify({ reason }) },
    ),
};
