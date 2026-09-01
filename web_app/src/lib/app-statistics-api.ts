import { apiRequest } from "@/lib/api-client";
import type { AppStatisticsData } from "@/types/app-statistics";

export const appStatisticsApi = {
  get: (params: { month: string; search?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams({
      month: params.month,
      page: String(params.page ?? 1),
      limit: String(params.limit ?? 20),
      ...(params.search ? { search: params.search } : {}),
    });
    return apiRequest<AppStatisticsData>(`/admin/app-statistics?${query.toString()}`);
  },
};
