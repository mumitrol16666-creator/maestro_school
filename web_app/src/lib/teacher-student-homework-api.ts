import { apiRequest } from "@/lib/api-client";

export type LegacyDecision = "accepted" | "continue" | "obsolete";
export type TeacherHomeworkItem = {
  key: string; model: "legacy" | "learning_homework_v2"; title: string; instructions: string;
  assignedAt: string | null; state: string; comment: string | null;
  reviewHref: string | null; lessonHref: string | null; canResolve: boolean;
  revision: number; crmClassId: string | null;
  history: Array<{ decision: LegacyDecision; comment: string; actorName: string; at: string }>;
};
export type TeacherHomeworkWorkspace = {
  planHref?: string | null;
  student: { crmStudentId: string; name: string }; items: TeacherHomeworkItem[]; partial: boolean;
};
const path = (id: string) => `/teachers/me/students/${encodeURIComponent(id)}/homework`;
export const teacherHomeworkApi = {
  list: (id: string) => apiRequest<TeacherHomeworkWorkspace>(path(id)),
  resolve: (id: string, classId: string, input: { decision: LegacyDecision; comment: string; expectedRevision: number; requestKey: string }) =>
    apiRequest<{ revision: number; idempotent: boolean }>(`${path(id)}/${encodeURIComponent(classId)}/resolve`, { method: "POST", body: JSON.stringify(input) }),
};
