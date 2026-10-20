import { apiRequest } from "@/lib/api-client";
import { ApiError } from "@/lib/api-client";
import type {
  GroupMonthlyPlan,
  GroupMonthlyPlanResponse,
  LearningPlanMode,
  LearningTopicDetail,
  PreparedTestOption,
  SectorProposal,
  SectorTemplate,
  StudentMonthlyPlan,
  StudentMonthlyPlanResponse,
  TeacherCrmDirection,
  TeacherGroupsResponse,
  TeacherStudentsResponse,
} from "@/types/teacher-students";
import type { TeacherStudentWorkspace } from "@/types/teacher-student-workspace";

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
  monthlyPlan: (crmStudentId: string, crmDirectionId?: string) =>
    apiRequest<StudentMonthlyPlanResponse>(
      `/teachers/me/students/${encodeURIComponent(crmStudentId)}/monthly-plan?${new URLSearchParams({
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
    expectedDraftRevision?: number,
    crmDirectionId?: string,
  ) =>
    apiRequest<StudentMonthlyPlan>(
      `/teachers/me/students/${encodeURIComponent(crmStudentId)}/monthly-plan/publish`,
      { method: "POST", body: JSON.stringify({ expectedDraftRevision, crmDirectionId }) },
    ),
  groups: () => apiRequest<TeacherGroupsResponse>("/teachers/me/groups"),
  groupMonthlyPlan: (crmGroupId: string, crmDirectionId?: string) =>
    apiRequest<GroupMonthlyPlanResponse>(
      `/teachers/me/groups/${encodeURIComponent(crmGroupId)}/monthly-plan?${new URLSearchParams({
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
    expectedDraftRevision?: number,
    crmDirectionId?: string,
  ) =>
    apiRequest<GroupMonthlyPlan>(
      `/teachers/me/groups/${encodeURIComponent(crmGroupId)}/monthly-plan/publish`,
      { method: "POST", body: JSON.stringify({ expectedDraftRevision, crmDirectionId }) },
    ),
  sectorTemplates: (crmDirectionId?: string) =>
    apiRequest<SectorTemplate[]>(
      `/teachers/me/sector-templates${crmDirectionId ? `?crmDirectionId=${encodeURIComponent(crmDirectionId)}` : ""}`,
    ),
  preparedTests: () => apiRequest<PreparedTestOption[]>("/teachers/me/prepared-tests"),
  sectorProposals: (filter: { status?: "new" | "accepted" | "declined"; crmStudentId?: string } = {}) =>
    apiRequest<SectorProposal[]>(
      `/teachers/me/sector-proposals?${new URLSearchParams(
        Object.fromEntries(Object.entries(filter).filter(([, value]) => Boolean(value))) as Record<string, string>,
      ).toString()}`,
    ),
  decideSectorProposal: (id: string, body: { decision: "accepted" | "declined"; reply?: string | null; acceptedTopicId?: string | null }) =>
    apiRequest<SectorProposal>(`/teachers/me/sector-proposals/${encodeURIComponent(id)}/decision`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  closeSectorEarly: (crmStudentId: string, body: { crmDirectionId: string; points: number; comment?: string | null }) =>
    apiRequest<StudentMonthlyPlan & { awardedPoints: number }>(
      `/teachers/me/students/${encodeURIComponent(crmStudentId)}/monthly-plan/close`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  workspace: (crmStudentId: string, crmClassId?: string | null) =>
    apiRequest<TeacherStudentWorkspace>(
      `/teachers/me/students/${encodeURIComponent(crmStudentId)}/workspace${crmClassId ? `?crmClassId=${encodeURIComponent(crmClassId)}` : ""}`,
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
  weeklyLeagueBonusStatus: (studentIds: string[]) =>
    apiRequest<Array<{ studentId: string; given: boolean; amount: number | null; byMe: boolean }>>(
      `/teacher/weekly-league/bonus-status?studentIds=${encodeURIComponent(studentIds.join(","))}`,
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
