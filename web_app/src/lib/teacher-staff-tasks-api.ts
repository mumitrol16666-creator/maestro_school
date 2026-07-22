import { apiRequest } from "@/lib/api-client";

export type TeacherStaffTask = {
  id: string;
  title: string;
  description: string | null;
  status: "open" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string; role: string } | null;
};

export const teacherStaffTasksApi = {
  list: () => apiRequest<{ tasks: TeacherStaffTask[] }>("/teachers/me/staff-tasks"),
  complete: (crmTaskId: string) => apiRequest<{ task: TeacherStaffTask }>(
    `/teachers/me/staff-tasks/${encodeURIComponent(crmTaskId)}/complete`,
    { method: "POST" },
  ),
};
