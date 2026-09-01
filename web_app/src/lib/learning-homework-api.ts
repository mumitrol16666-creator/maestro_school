import {
  ApiError,
  apiRequest,
  clearSession,
  getAccessToken,
} from "@/lib/api-client";
import type {
  CreatedLearningHomeworkAssignment,
  LearningHomeworkMaterial,
  StudentLearningHomeworkAssignment,
  StudentLearningHomeworkResponse,
  TeacherLearningHomeworkResponse,
} from "@/types/learning-homework";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

async function authenticatedFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const target = path.startsWith("/api/v1/") ? path : `${API_URL}${path}`;
  let response: Response;
  try {
    response = await fetch(target, { ...init, headers, cache: "no-store" });
  } catch {
    throw new ApiError("Не удалось связаться с сервером Maestro", 0, "NETWORK_ERROR");
  }
  if (response.status === 401) {
    clearSession();
    if (typeof window !== "undefined") window.location.assign("/login");
  }
  return response;
}

async function multipartSubmission(
  assignmentId: string,
  body: {
    submissionMode: "materials" | "ready_for_lesson";
    text?: string | null;
    materials?: LearningHomeworkMaterial[];
    files: File[];
    previousAttemptId?: string | null;
    idempotencyKey: string;
  },
) {
  const form = new FormData();
  form.set("submissionMode", body.submissionMode);
  if (body.text?.trim()) form.set("text", body.text.trim());
  if (body.previousAttemptId) form.set("previousAttemptId", body.previousAttemptId);
  const link = body.materials?.find((material) => material.type === "link")?.url.trim();
  if (link) form.set("link", link);
  for (const file of body.files) form.append("file", file, file.name);
  const response = await authenticatedFetch(
    `/homeworks/${encodeURIComponent(assignmentId)}/submissions`,
    {
      method: "POST",
      headers: { "Idempotency-Key": body.idempotencyKey },
      body: form,
    },
  );
  const payload = await response.json().catch(() => ({})) as {
    data?: StudentLearningHomeworkAssignment;
    error?: { code?: string; message?: string };
  };
  if (!response.ok) {
    throw new ApiError(
      payload.error?.message ?? "Не удалось отправить домашнее задание",
      response.status,
      payload.error?.code ?? "API_ERROR",
    );
  }
  return payload.data as StudentLearningHomeworkAssignment;
}

export const learningHomeworkApi = {
  teacherAvailability: async () => {
    try {
      await apiRequest<{ enabled: true; model: "learning_homework_v2" }>(
        "/teachers/me/homework-flow",
      );
      return true;
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 404) return false;
      throw reason;
    }
  },

  createAssignment: (body: {
    topicId: string;
    instructions: string;
    dueAt?: string | null;
    sourceLessonId?: string | null;
    materials?: LearningHomeworkMaterial[];
    idempotencyKey: string;
  }) => apiRequest<CreatedLearningHomeworkAssignment>(
    "/teachers/me/homework-assignments",
    { method: "POST", body: JSON.stringify(body) },
  ),

  teacherTopicAssignments: (topicId: string) =>
    apiRequest<TeacherLearningHomeworkResponse>(
      `/teachers/me/learning-topics/${encodeURIComponent(topicId)}/homework-assignments`,
    ),

  studentAssignments: async (): Promise<StudentLearningHomeworkResponse> => {
    try {
      const response = await apiRequest<{
        model: "learning_homework_v2";
        assignments: StudentLearningHomeworkAssignment[];
      }>("/students/me/homework-assignments");
      return { enabled: true, ...response };
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 404) {
        return { enabled: false, model: "legacy", assignments: [] };
      }
      throw reason;
    }
  },

  submit: (
    assignmentId: string,
    body: {
      submissionMode: "materials" | "ready_for_lesson";
      text?: string | null;
      materials?: LearningHomeworkMaterial[];
      files?: File[];
      previousAttemptId?: string | null;
      idempotencyKey: string;
    },
  ) => body.files?.length
    ? multipartSubmission(assignmentId, { ...body, files: body.files })
    : apiRequest<StudentLearningHomeworkAssignment>(
        `/homeworks/${encodeURIComponent(assignmentId)}/submissions`,
        { method: "POST", body: JSON.stringify(body) },
      ),

  downloadMaterial: async (material: LearningHomeworkMaterial) => {
    const response = await authenticatedFetch(material.url);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as {
        error?: { code?: string; message?: string };
      };
      throw new ApiError(
        payload.error?.message ?? "Не удалось скачать файл",
        response.status,
        payload.error?.code ?? "API_ERROR",
      );
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = material.title || "homework-file";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
  },
};
