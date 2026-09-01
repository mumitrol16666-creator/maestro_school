import { apiRequest } from "@/lib/api-client";
import { ApiError } from "@/lib/api-client";
import type {
  GroupMonthlyPlan,
  GroupMonthlyPlanResponse,
  LearningPlanMode,
  LearningTopicDetail,
  StudentMonthlyPlan,
  StudentMonthlyPlanResponse,
  TeacherCrmDirection,
  TeacherGroupsResponse,
  TeacherStudentsResponse,
} from "@/types/teacher-students";

export const teacherStudentsApi = {
  list: () => apiRequest<TeacherStudentsResponse>("/teachers/me/students"),
  openDialog: (studentUserId: string, recipient: "student" | "parent") =>
    apiRequest<{ conversationId: string; recipients: string[] }>(
      `/teachers/me/students/${encodeURIComponent(studentUserId)}/dialog`,
      { method: "POST", body: JSON.stringify({ recipient }) },
    ),
  learningPlanMode: async (): Promise<LearningPlanMode> => {
    try {
      const directions = await apiRequest<TeacherCrmDirection[]>("/teachers/me/crm-directions");
      return { mode: "v2", directions };
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 404) {
        return { mode: "legacy", directions: [] };
      }
      throw reason;
    }
  },
  monthlyPlan: (crmStudentId: string, month: string, crmDirectionId?: string) =>
    apiRequest<StudentMonthlyPlanResponse>(
      `/teachers/me/students/${encodeURIComponent(crmStudentId)}/monthly-plan?${new URLSearchParams({
        month,
        ...(crmDirectionId ? { crmDirectionId } : {}),
      }).toString()}`,
    ),
  saveMonthlyPlan: (crmStudentId: string, plan: StudentMonthlyPlan, crmDirectionId?: string) =>
    apiRequest<StudentMonthlyPlan>(
      `/teachers/me/students/${encodeURIComponent(crmStudentId)}/monthly-plan`,
      { method: "PUT", body: JSON.stringify({ ...plan, crmDirectionId }) },
    ),
  publishMonthlyPlan: (
    crmStudentId: string,
    month: string,
    expectedDraftRevision?: number,
    crmDirectionId?: string,
  ) =>
    apiRequest<StudentMonthlyPlan>(
      `/teachers/me/students/${encodeURIComponent(crmStudentId)}/monthly-plan/publish`,
      { method: "POST", body: JSON.stringify({ month, expectedDraftRevision, crmDirectionId }) },
    ),
  groups: () => apiRequest<TeacherGroupsResponse>("/teachers/me/groups"),
  groupMonthlyPlan: (crmGroupId: string, month: string, crmDirectionId?: string) =>
    apiRequest<GroupMonthlyPlanResponse>(
      `/teachers/me/groups/${encodeURIComponent(crmGroupId)}/monthly-plan?${new URLSearchParams({
        month,
        ...(crmDirectionId ? { crmDirectionId } : {}),
      }).toString()}`,
    ),
  saveGroupMonthlyPlan: (crmGroupId: string, plan: GroupMonthlyPlan, crmDirectionId?: string) =>
    apiRequest<GroupMonthlyPlan>(
      `/teachers/me/groups/${encodeURIComponent(crmGroupId)}/monthly-plan`,
      { method: "PUT", body: JSON.stringify({ ...plan, crmDirectionId }) },
    ),
  publishGroupMonthlyPlan: (
    crmGroupId: string,
    month: string,
    expectedDraftRevision?: number,
    crmDirectionId?: string,
  ) =>
    apiRequest<GroupMonthlyPlan>(
      `/teachers/me/groups/${encodeURIComponent(crmGroupId)}/monthly-plan/publish`,
      { method: "POST", body: JSON.stringify({ month, expectedDraftRevision, crmDirectionId }) },
    ),
  learningTopic: (topicId: string) =>
    apiRequest<LearningTopicDetail>(`/teachers/me/learning-topics/${encodeURIComponent(topicId)}`),
  updateLearningTopicProgress: (
    topicId: string,
    body: { toPercent: number; expectedPercent: number | null; sourceKey: string; comment?: string },
  ) => apiRequest<LearningTopicDetail>(
    `/teachers/me/learning-topics/${encodeURIComponent(topicId)}/progress`,
    { method: "PATCH", body: JSON.stringify(body) },
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
