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
      homeworkDraft?: string;
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
  attendance: (crmClassId: string, studentId: string, attended: boolean) =>
    apiRequest<Record<string, unknown>>(
      `/teachers/me/offline-lessons/${encodeURIComponent(crmClassId)}/attendance`,
      { method: "POST", body: JSON.stringify({ studentId, attended }) },
    ),
};
