import { apiRequest } from "@/lib/api-client";
import type {
  TeacherOfflineAgenda,
  TeacherOfflineClass,
  TeacherOfflineClassStudents,
  OfflineHomeworkReview,
  LearningLessonV2Context,
  LearningLessonV2ResultsInput,
  TrialLessonReport,
  OfflineLessonServerDraft,
  OfflineLessonReportHistory,
  LessonStudentsOverview,
  LessonTextTemplate,
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
      learningResultsV2?: LearningLessonV2ResultsInput;
    },
  ) =>
    apiRequest<Record<string, unknown>>(
      `/teachers/me/offline-lessons/${encodeURIComponent(crmClassId)}/submit`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  studentsOverview: (crmClassId: string) =>
    apiRequest<LessonStudentsOverview>(
      `/teachers/me/offline-lessons/${encodeURIComponent(crmClassId)}/students-overview`,
    ),
  /** Plan 1.14: «Отменить урок» — every student «Не пришёл», the admin decides the kind of absence. */
  cancel: (crmClassId: string, reason?: string) =>
    apiRequest<Record<string, unknown>>(
      `/teachers/me/offline-lessons/${encodeURIComponent(crmClassId)}/cancel`,
      { method: "POST", body: JSON.stringify(reason?.trim() ? { reason: reason.trim() } : {}) },
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
  quickAddTopic: (
    crmClassId: string,
    data: { title: string; masteryCriteria?: string; directionId: string },
  ) =>
    apiRequest<{
      success: boolean;
      topic: { id: string; title: string; masteryCriteria: string };
      learningV2: LearningLessonV2Context;
    }>(
      `/teachers/me/offline-lessons/${encodeURIComponent(crmClassId)}/quick-topic`,
      { method: "POST", body: JSON.stringify(data) },
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
};

/** Plan 1.14: summary and homework phrases — the teacher's own and the school's per direction. */
export const lessonTemplatesApi = {
  forLesson: (crmDirectionId?: string | null) =>
    apiRequest<{ own: LessonTextTemplate[]; school: LessonTextTemplate[] }>(
      `/teachers/me/lesson-templates${crmDirectionId ? `?crmDirectionId=${encodeURIComponent(crmDirectionId)}` : ""}`,
    ),
  addOwn: (kind: LessonTextTemplate["kind"], text: string) =>
    apiRequest<LessonTextTemplate>("/teachers/me/lesson-templates", { method: "POST", body: JSON.stringify({ kind, text }) }),
  removeOwn: (id: string) =>
    apiRequest<{ id: string }>(`/teachers/me/lesson-templates/${encodeURIComponent(id)}`, { method: "DELETE" }),
  school: (crmDirectionId?: string | null) =>
    apiRequest<LessonTextTemplate[]>(`/admin/lesson-templates${crmDirectionId ? `?crmDirectionId=${encodeURIComponent(crmDirectionId)}` : ""}`),
  addSchool: (input: { kind: LessonTextTemplate["kind"]; text: string; crmDirectionId?: string | null }) =>
    apiRequest<LessonTextTemplate>("/admin/lesson-templates", { method: "POST", body: JSON.stringify(input) }),
  updateSchool: (id: string, input: { text?: string; crmDirectionId?: string | null; sortOrder?: number }) =>
    apiRequest<LessonTextTemplate>(`/admin/lesson-templates/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }),
  removeSchool: (id: string) =>
    apiRequest<{ id: string }>(`/admin/lesson-templates/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
