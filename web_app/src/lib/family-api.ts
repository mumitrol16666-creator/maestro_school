import { apiRequest } from "./api-client";
import type {
  FamilyChild,
  FamilyChildOverview,
  FamilyNewsPost,
  ParentVisibility,
  ParentVisibilityRequest,
  ParentVisibilityWorkspace,
} from "@/types/family";
import type { StudentMonthlyPlansResponse } from "@/types/api";

export const familyApi = {
  children: () => apiRequest<FamilyChild[]>("/parents/me/children"),
  /** Stage 4: «Добавить ребёнка» — a child account with its own phone, linked to this parent. */
  addChild: (child: { firstName: string; lastName: string; phone: string; password: string }) =>
    apiRequest<FamilyChild>("/parents/me/children", { method: "POST", body: JSON.stringify(child) }),
  childOverview: (studentId: string) =>
    apiRequest<FamilyChildOverview>(
      `/parents/me/children/${encodeURIComponent(studentId)}/offline-summary`,
    ),
  childMonthlyPlans: (studentId: string) =>
    apiRequest<StudentMonthlyPlansResponse>(
      `/parents/me/children/${encodeURIComponent(studentId)}/monthly-plans`,
    ),
  news: (limit = 5) => apiRequest<FamilyNewsPost[]>(`/parents/me/news?limit=${limit}`),
  myVisibility: () => apiRequest<ParentVisibilityWorkspace>("/students/me/parent-visibility"),
  requestVisibility: (requested: ParentVisibility, note?: string) =>
    apiRequest<ParentVisibilityRequest>("/students/me/parent-visibility-requests", {
      method: "POST",
      body: JSON.stringify({ requested, note: note || null }),
    }),
};
