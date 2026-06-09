import { apiRequest, apiRequestEnvelope } from "@/lib/api-client";
import type { HomeworkAttemptsResponse } from "@/types/homework";
import type {
  HomeworkReviewFilterStatus,
  HomeworkReviewMeta,
  HomeworkReviewResponse,
  HomeworkSubmissionItem,
} from "@/types/homework-review";

export interface ListSubmissionsParams {
  status?: HomeworkReviewFilterStatus;
  courseId?: string;
  studentId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const homeworkReviewApi = {
  list: (params: ListSubmissionsParams = {}) => {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.courseId) query.set("courseId", params.courseId);
    if (params.studentId) query.set("studentId", params.studentId);
    if (params.search) query.set("search", params.search);
    query.set("page", String(params.page ?? 1));
    query.set("limit", String(params.limit ?? 20));
    return apiRequestEnvelope<HomeworkSubmissionItem[], HomeworkReviewMeta>(
      `/admin/homework-submissions?${query}`,
    );
  },

  get: (submissionId: string) =>
    apiRequest<HomeworkSubmissionItem>(`/admin/homework-submissions/${submissionId}`),

  attempts: (submissionId: string) =>
    apiRequest<HomeworkAttemptsResponse>(`/admin/homework-submissions/${submissionId}/attempts`),

  review: (
    submissionId: string,
    body: { action: "approve" | "reject"; reviewComment?: string },
  ) =>
    apiRequest<HomeworkReviewResponse>(`/homeworks/submissions/${submissionId}/review`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};
