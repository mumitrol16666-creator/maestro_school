import { apiRequest, apiRequestEnvelope } from "@/lib/api-client";
import type { OnlineLessonRequest, OnlineLessonTeacherOption } from "@/types/online-lessons";

export interface OnlineLessonsMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export const onlineLessonsApi = {
  myRequests: () => apiRequest<OnlineLessonRequest[]>("/online-lessons/requests"),
  myRequest: (id: string) => apiRequest<OnlineLessonRequest>(`/online-lessons/requests/${id}`),
  createRequest: (body: {
    requestType?: "trial" | "online_lesson";
    directionId?: string | null;
    directionTitle: string;
    level: string;
    preferredTime: string;
    comment?: string;
  }) =>
    apiRequest<OnlineLessonRequest>("/online-lessons/requests", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  submitAssignment: (
    requestId: string,
    body: { comment?: string; attachmentUrl?: string; attachmentType?: string },
  ) =>
    apiRequest(`/online-lessons/requests/${requestId}/submissions`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  myCoins: () => apiRequest<{ balance: number }>("/students/me/coins"),

  adminList: (params: {
    status?: string;
    search?: string;
    mine?: boolean;
    teacherId?: string;
    unassigned?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.search) query.set("search", params.search);
    if (params.mine) query.set("mine", "true");
    if (params.teacherId) query.set("teacherId", params.teacherId);
    if (params.unassigned) query.set("unassigned", "true");
    query.set("page", String(params.page ?? 1));
    query.set("limit", String(params.limit ?? 20));
    return apiRequestEnvelope<OnlineLessonRequest[], OnlineLessonsMeta>(
      `/admin/online-lesson-requests?${query}`,
    );
  },
  adminGet: (id: string) => apiRequest<OnlineLessonRequest>(`/admin/online-lesson-requests/${id}`),
  teachers: () => apiRequest<OnlineLessonTeacherOption[]>("/admin/online-lesson-teachers"),
  pendingCount: () =>
    apiRequest<{ newRequests: number; myInWork: number; assignedOrScheduled: number; submissions: number }>(
      "/admin/online-lesson-requests/pending-count",
    ),
  assign: (id: string, teacherId?: string) =>
    apiRequest<OnlineLessonRequest>(`/admin/online-lesson-requests/${id}/assign`, {
      method: "PATCH",
      body: JSON.stringify(teacherId ? { teacherId } : {}),
    }),
  schedule: (id: string, body: { scheduledAt: string; zoomUrl: string }) =>
    apiRequest<OnlineLessonRequest>(`/admin/online-lesson-requests/${id}/schedule`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  cancel: (id: string) =>
    apiRequest<OnlineLessonRequest>(`/admin/online-lesson-requests/${id}/cancel`, { method: "PATCH" }),
  noShow: (id: string) =>
    apiRequest<OnlineLessonRequest>(`/admin/online-lesson-requests/${id}/no-show`, { method: "PATCH" }),
  complete: (id: string, body: Record<string, unknown>) =>
    apiRequest<OnlineLessonRequest>(`/admin/online-lesson-requests/${id}/complete`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  reviewSubmission: (submissionId: string, body: Record<string, unknown>) =>
    apiRequest(`/admin/online-lesson-submissions/${submissionId}/review`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};
