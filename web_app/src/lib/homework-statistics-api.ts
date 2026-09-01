import { apiRequest } from "@/lib/api-client";
import type { HomeworkStatisticsData } from "@/types/homework-statistics";

type StatisticsParams = {
  month: string;
  directionId?: string;
  search?: string;
  page?: number;
  limit?: number;
};

function queryString(params: StatisticsParams) {
  return new URLSearchParams({
    month: params.month,
    ...(params.directionId ? { directionId: params.directionId } : {}),
    ...(params.search ? { search: params.search } : {}),
    ...(params.page ? { page: String(params.page) } : {}),
    ...(params.limit ? { limit: String(params.limit) } : {}),
  }).toString();
}

export const homeworkStatisticsApi = {
  admin: (params: StatisticsParams) => (
    apiRequest<HomeworkStatisticsData>(`/admin/homework-statistics?${queryString(params)}`)
  ),
  teacher: (params: StatisticsParams) => (
    apiRequest<HomeworkStatisticsData>(`/teachers/me/homework-statistics?${queryString(params)}`)
  ),
  student: (params: Pick<StatisticsParams, "month" | "directionId">) => (
    apiRequest<HomeworkStatisticsData>(`/students/me/homework-statistics?${queryString(params)}`)
  ),
};
