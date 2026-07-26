import { apiRequest } from "@/lib/api-client";
import type {
  AdminWeeklyLeagueOverview,
  WeeklyLeagueOverview,
} from "@/types/weekly-league";

export const weeklyLeagueApi = {
  studentOverview: (weekOffset = 0) =>
    apiRequest<WeeklyLeagueOverview>(
      `/students/me/weekly-league?weekOffset=${weekOffset}`,
    ),
  adminOverview: (weekOffset = 0) =>
    apiRequest<AdminWeeklyLeagueOverview>(
      `/admin/weekly-league?weekOffset=${weekOffset}`,
    ),
  setEligibility: (studentId: string, eligible: boolean) =>
    apiRequest<{
      id: string;
      firstName: string;
      lastName: string;
      isActive: boolean;
      leagueEligible: boolean;
    }>(`/admin/weekly-league/students/${encodeURIComponent(studentId)}`, {
      method: "PATCH",
      body: JSON.stringify({ eligible }),
    }),
};
