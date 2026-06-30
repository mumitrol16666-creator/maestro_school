import { apiRequest, apiRequestEnvelope } from "@/lib/api-client";

export interface AdminLessonQuestion {
  id: string;
  lessonId: string;
  message: string;
  status: "pending" | "answered";
  createdAt: string;
  updatedAt: string;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    email: string;
  };
  lesson: {
    id: string;
    title: string;
    module: {
      title: string;
      course: { id: string; title: string };
    };
  };
}

export interface LessonQuestionsMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export const lessonQuestionsApi = {
  list: (params: { status?: "pending" | "answered"; search?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.search) query.set("search", params.search);
    query.set("page", String(params.page ?? 1));
    query.set("limit", String(params.limit ?? 20));
    return apiRequestEnvelope<AdminLessonQuestion[], LessonQuestionsMeta>(`/admin/lesson-questions?${query}`);
  },
  pendingCount: () => apiRequest<{ count: number }>("/admin/lesson-questions/pending-count"),
  markAnswered: (id: string) =>
    apiRequest<{ id: string; status: string }>(`/admin/lesson-questions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "answered" }),
    }),
};
