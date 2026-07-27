import { apiRequest, apiRequestEnvelope } from "@/lib/api-client";
import type { StudentAchievementItem } from "@/types/api";

export interface AdminStudentSummary {
  id: string;
  login: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  fullName?: string;
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
  parents: ParentStudentLink[];
}

export type FamilyRelationship = "mother" | "father" | "guardian" | "other";

export interface ParentStudentLink {
  linkId: string;
  relationship: FamilyRelationship;
  isActive: boolean;
  parent: {
    id: string;
    login: string | null;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    fullName: string;
    phone: string;
    isActive: boolean;
    role: "parent";
  };
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
  createParent: (
    studentId: string,
    body: {
      firstName: string;
      lastName: string;
      middleName?: string;
      phone: string;
      login: string;
      password: string;
      relationship: FamilyRelationship;
    },
  ) =>
    apiRequest<ParentStudentLink>(`/admin/students/${studentId}/parents`, {
      method: "POST",
      body: JSON.stringify({ mode: "create", ...body }),
    }),
  linkParent: (
    studentId: string,
    body: { login: string; relationship: FamilyRelationship },
  ) =>
    apiRequest<ParentStudentLink>(`/admin/students/${studentId}/parents`, {
      method: "POST",
      body: JSON.stringify({ mode: "link", ...body }),
    }),
  unlinkParent: (studentId: string, linkId: string) =>
    apiRequest<{ revoked: boolean }>(`/admin/students/${studentId}/parents/${linkId}`, {
      method: "DELETE",
    }),
  resetParentPassword: (studentId: string, linkId: string, password: string) =>
    apiRequest<{ updated: boolean }>(`/admin/students/${studentId}/parents/${linkId}/password`, {
      method: "PATCH",
      body: JSON.stringify({ password }),
    }),
};
