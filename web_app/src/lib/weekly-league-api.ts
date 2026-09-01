import { apiRequest } from "@/lib/api-client";
import type {
  AdminWeeklyLeagueOverview,
  PointsLeaderboardOverview,
  WeeklyLeagueHistory,
  WeeklyLeagueOverview,
} from "@/types/weekly-league";

export const weeklyLeagueApi = {
  pointsLeaderboard: () =>
    apiRequest<PointsLeaderboardOverview>("/students/me/points-leaderboard"),
  studentOverview: (weekOffset = 0) =>
    apiRequest<WeeklyLeagueOverview>(
      `/students/me/weekly-league?weekOffset=${weekOffset}`,
    ),
  history: (cursor?: string, limit = 8) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set("cursor", cursor);
    return apiRequest<WeeklyLeagueHistory>(`/students/me/weekly-league/history?${query}`);
  },
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
  protectStreak: (params: {
    studentId: string;
    weekDate: string;
    category: "illness" | "family" | "other";
    comment: string;
    idempotencyKey: string;
  }) => apiRequest<{
    protection: { id: string };
    idempotent: boolean;
    corrected: boolean;
  }>("/admin/weekly-league/streak-protections", {
    method: "POST",
    body: JSON.stringify(params),
  }),
};
