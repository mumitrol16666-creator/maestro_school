import { ApiError, clearSession, getAccessToken, apiRequest } from "@/lib/api-client";
import type {
  LearningDialogArchiveFilter,
  LearningDialogDetail,
  LearningDialogMessage,
  LearningDialogSummary,
} from "@/types/learning-dialogs";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";
const TEACHER_SYNC_COOLDOWN_MS = 5_000;

let teacherSyncPromise: Promise<unknown> | null = null;
let teacherSyncedAt = 0;

function idempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function authenticatedFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
  } catch {
    throw new ApiError("Не удалось связаться с сервером Maestro", 0, "NETWORK_ERROR");
  }
  if (response.status === 401) {
    clearSession();
    if (typeof window !== "undefined") window.location.assign("/login");
  }
  return response;
}

async function formRequest<T>(path: string, form: FormData, key: string): Promise<T> {
  const response = await authenticatedFetch(path, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: form,
  });
  const payload = await response.json().catch(() => ({})) as {
    data?: T;
    error?: { code?: string; message?: string };
  };
  if (!response.ok) {
    throw new ApiError(
      payload.error?.message ?? "Не удалось отправить сообщение",
      response.status,
      payload.error?.code ?? "API_ERROR",
    );
  }
  return payload.data as T;
}

function syncTeacherDialogs() {
  if (teacherSyncPromise) return teacherSyncPromise;
  if (Date.now() - teacherSyncedAt < TEACHER_SYNC_COOLDOWN_MS) {
    return Promise.resolve();
  }

  teacherSyncPromise = apiRequest("/learning-dialogs/sync", { method: "POST" })
    .then((result) => {
      teacherSyncedAt = Date.now();
      return result;
    })
    .finally(() => {
      teacherSyncPromise = null;
    });
  return teacherSyncPromise;
}

export const learningDialogsApi = {
  list: (archive: LearningDialogArchiveFilter = "active") =>
    apiRequest<LearningDialogSummary[]>(`/learning-dialogs?limit=100&archive=${archive}`),
  unreadCount: () => apiRequest<{ count: number }>("/learning-dialogs/unread-count"),
  syncTeacher: syncTeacherDialogs,
  detail: (conversationId: string, before?: string) => apiRequest<LearningDialogDetail>(
    `/learning-dialogs/${conversationId}?limit=100${before ? `&before=${encodeURIComponent(before)}` : ""}`,
  ),
  markRead: (conversationId: string) =>
    apiRequest(`/learning-dialogs/${conversationId}/read`, { method: "POST" }),
  preferences: (
    conversationId: string,
    preferences: { notificationsMuted?: boolean; archived?: boolean },
  ) => apiRequest<{ conversationId: string; notificationsMuted: boolean; archivedAt: string | null }>(
    `/learning-dialogs/${conversationId}/preferences`,
    { method: "PATCH", body: JSON.stringify(preferences) },
  ),
  startCurator: (message: string) => apiRequest<{ conversationId: string; created: boolean; message: LearningDialogMessage }>(
    "/learning-dialogs/curator",
    { method: "POST", body: JSON.stringify({ message, idempotencyKey: idempotencyKey() }) },
  ),
  askLessonQuestion: (lessonId: string, message: string) => apiRequest<{ conversationId: string; created: boolean; message: LearningDialogMessage }>(
    "/learning-dialogs/lesson-question",
    { method: "POST", body: JSON.stringify({ lessonId, message, idempotencyKey: idempotencyKey() }) },
  ),
  send: async (
    conversationId: string,
    input: { message: string; files: File[]; contextType?: string; contextId?: string },
  ) => {
    const key = idempotencyKey();
    if (input.files.length > 0) {
      const form = new FormData();
      if (input.message.trim()) form.set("message", input.message.trim());
      if (input.contextType && input.contextId) {
        form.set("contextType", input.contextType);
        form.set("contextId", input.contextId);
      }
      for (const file of input.files) form.append("file", file, file.name);
      return formRequest<LearningDialogMessage>(
        `/learning-dialogs/${conversationId}/messages`,
        form,
        key,
      );
    }
    return apiRequest<LearningDialogMessage>(`/learning-dialogs/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        message: input.message.trim(),
        idempotencyKey: key,
        ...(input.contextType && input.contextId
          ? { contextType: input.contextType, contextId: input.contextId }
          : {}),
      }),
    });
  },
  edit: (conversationId: string, messageId: string, message: string) =>
    apiRequest<{ changed: boolean; message: LearningDialogMessage }>(
      `/learning-dialogs/${conversationId}/messages/${messageId}`,
      { method: "PATCH", body: JSON.stringify({ message, idempotencyKey: idempotencyKey() }) },
    ),
  retract: (conversationId: string, messageId: string) =>
    apiRequest<{ changed: boolean; message: LearningDialogMessage }>(
      `/learning-dialogs/${conversationId}/messages/${messageId}/retract`,
      { method: "POST", body: JSON.stringify({ idempotencyKey: idempotencyKey() }) },
    ),
  report: (conversationId: string, messageId: string, versionId: string, reason: string) =>
    apiRequest(`/learning-dialogs/${conversationId}/messages/${messageId}/reports`, {
      method: "POST",
      body: JSON.stringify({ versionId, reason, idempotencyKey: idempotencyKey() }),
    }),
  hide: (conversationId: string, messageId: string, reason: string) =>
    apiRequest(`/learning-dialogs/${conversationId}/messages/${messageId}/hide`, {
      method: "POST",
      body: JSON.stringify({ reason, idempotencyKey: idempotencyKey() }),
    }),
  resolveReport: (
    conversationId: string,
    reportId: string,
    status: "resolved" | "dismissed",
    resolution: string,
  ) => apiRequest(`/learning-dialogs/${conversationId}/reports/${reportId}/resolve`, {
    method: "POST",
    body: JSON.stringify({ status, resolution, idempotencyKey: idempotencyKey() }),
  }),
  restrict: (conversationId: string, userId: string, restrictedUntil: string, reason: string) =>
    apiRequest(`/learning-dialogs/${conversationId}/members/${userId}/restrict`, {
      method: "POST",
      body: JSON.stringify({ restrictedUntil, reason, idempotencyKey: idempotencyKey() }),
    }),
  unrestrict: (conversationId: string, userId: string, reason: string) =>
    apiRequest(`/learning-dialogs/${conversationId}/members/${userId}/unrestrict`, {
      method: "POST",
      body: JSON.stringify({ reason, idempotencyKey: idempotencyKey() }),
    }),
  download: async (attachmentId: string, filename: string) => {
    const response = await authenticatedFetch(`/learning-dialog-attachments/${attachmentId}/download`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: { message?: string; code?: string } };
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
    link.download = filename || "attachment";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
  },
};

export function notifyLearningDialogsUpdated() {
  window.dispatchEvent(new CustomEvent("maestro:messages-updated"));
}
