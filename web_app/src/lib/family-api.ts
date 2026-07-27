import { apiRequest } from "./api-client";
import type { FamilyChild, FamilyChildOverview } from "@/types/family";

export const familyApi = {
  children: () => apiRequest<FamilyChild[]>("/parents/me/children"),
  childOverview: (studentId: string) =>
    apiRequest<FamilyChildOverview>(
      `/parents/me/children/${encodeURIComponent(studentId)}/offline-summary`,
    ),
};
