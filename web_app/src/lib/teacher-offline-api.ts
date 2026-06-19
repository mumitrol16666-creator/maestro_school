import { apiRequest } from "@/lib/api-client";
import type {
  TeacherOfflineAgenda,
  TeacherOfflineClass,
  TeacherOfflineClassStudents,
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
      materials?: Array<{ type?: string; url?: string; title?: string }>;
      teacherOutcomeHint?: "held" | "not_held" | "no_submission";
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
  attendance: (crmClassId: string, studentId: string, attendanceStatus: string, teacherNote?: string) =>
    apiRequest<Record<string, unknown>>(
      `/teachers/me/offline-lessons/${encodeURIComponent(crmClassId)}/attendance`,
      { method: "POST", body: JSON.stringify({ studentId, attendanceStatus, teacherNote }) },
    ),
};
