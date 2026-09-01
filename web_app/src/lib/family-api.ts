import { apiRequest } from "./api-client";
import type {
  FamilyChild,
  FamilyChildOverview,
  FamilyNewsPost,
  ParentVisibility,
  ParentVisibilityRequest,
  ParentVisibilityWorkspace,
} from "@/types/family";

export const familyApi = {
  children: () => apiRequest<FamilyChild[]>("/parents/me/children"),
  childOverview: (studentId: string) =>
    apiRequest<FamilyChildOverview>(
      `/parents/me/children/${encodeURIComponent(studentId)}/offline-summary`,
    ),
  news: (limit = 5) => apiRequest<FamilyNewsPost[]>(`/parents/me/news?limit=${limit}`),
  myVisibility: () => apiRequest<ParentVisibilityWorkspace>("/students/me/parent-visibility"),
  requestVisibility: (requested: ParentVisibility, note?: string) =>
    apiRequest<ParentVisibilityRequest>("/students/me/parent-visibility-requests", {
      method: "POST",
      body: JSON.stringify({ requested, note: note || null }),
    }),
};
