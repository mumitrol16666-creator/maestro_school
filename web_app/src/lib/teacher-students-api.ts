import { apiRequest } from "@/lib/api-client";
import type {
  StudentMonthlyPlan,
  StudentMonthlyPlanResponse,
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
};
