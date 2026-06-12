import { apiRequest, apiRequestEnvelope } from "@/lib/api-client";
import type { StudentAchievementItem } from "@/types/api";

export interface AdminStudentSummary {
  id: string;
  login: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  createdAt: string;
  points: number;
  coins: number;
  completedLessons: number;
}

export interface AdminStudentDetail extends AdminStudentSummary {
  achievements: StudentAchievementItem[];
  earnedAchievementsCount: number;
  enrollments: {
    id: string;
    status: string;
    enrolledAt: string;
    course: { id: string; title: string; isPublished: boolean };
  }[];
  onlineLessons: {
    id: string;
    directionTitle: string;
    status: string;
    scheduledAt: string | null;
    createdAt: string;
  }[];
}

export const studentsApi = {
  list: (params: { search?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params.search) query.set("search", params.search);
    query.set("page", String(params.page ?? 1));
    query.set("limit", String(params.limit ?? 20));
    return apiRequestEnvelope<AdminStudentSummary[], { page: number; limit: number; total: number; pages: number }>(
      `/admin/students?${query}`,
    );
  },
  get: (id: string) => apiRequest<AdminStudentDetail>(`/admin/students/${id}`),
};
