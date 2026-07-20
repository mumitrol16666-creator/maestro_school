import { apiRequest } from "@/lib/api-client";
import type { ManagementDayOverview } from "@/types/admin-overview";

export const adminOverviewApi = {
  get: () => apiRequest<ManagementDayOverview>("/admin/day-overview"),
};
