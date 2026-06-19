import { apiRequest } from "@/lib/api-client";
import type { TeacherStudentsResponse } from "@/types/teacher-students";

export const teacherStudentsApi = {
  list: () => apiRequest<TeacherStudentsResponse>("/teachers/me/students"),
};
