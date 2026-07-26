import { apiRequest } from "@/lib/api-client";
import type {
  GroupMonthlyPlan,
  GroupMonthlyPlanResponse,
  StudentMonthlyPlan,
  StudentMonthlyPlanResponse,
  TeacherGroupsResponse,
  TeacherStudentsResponse,
} from "@/types/teacher-students";

export const teacherStudentsApi = {
  list: () => apiRequest<TeacherStudentsResponse>("/teachers/me/students"),
  monthlyPlan: (crmStudentId: string, month: string) =>
    apiRequest<StudentMonthlyPlanResponse>(
      `/teachers/me/students/${encodeURIComponent(crmStudentId)}/monthly-plan?month=${encodeURIComponent(month)}`,
    ),
  saveMonthlyPlan: (crmStudentId: string, plan: StudentMonthlyPlan) =>
    apiRequest<StudentMonthlyPlan>(
      `/teachers/me/students/${encodeURIComponent(crmStudentId)}/monthly-plan`,
      { method: "PUT", body: JSON.stringify(plan) },
    ),
  groups: () => apiRequest<TeacherGroupsResponse>("/teachers/me/groups"),
  groupMonthlyPlan: (crmGroupId: string, month: string) =>
    apiRequest<GroupMonthlyPlanResponse>(
      `/teachers/me/groups/${encodeURIComponent(crmGroupId)}/monthly-plan?month=${encodeURIComponent(month)}`,
    ),
  saveGroupMonthlyPlan: (crmGroupId: string, plan: GroupMonthlyPlan) =>
    apiRequest<GroupMonthlyPlan>(
      `/teachers/me/groups/${encodeURIComponent(crmGroupId)}/monthly-plan`,
      { method: "PUT", body: JSON.stringify(plan) },
    ),
  awardWeeklyLeagueBonus: (body: {
    studentId: string;
    amount: number;
    reason: string;
    idempotencyKey: string;
  }) =>
    apiRequest<{ awarded: boolean; eventId?: string }>(
      "/teacher/weekly-league/bonus",
      { method: "POST", body: JSON.stringify(body) },
    ),
};
