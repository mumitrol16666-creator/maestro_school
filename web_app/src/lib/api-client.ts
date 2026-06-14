import type { HomeworkAttempt, HomeworkAttachmentType } from "@/types/homework";
import type {
  ApiAuthUser,
  ApiCourseDetail,
  ApiCourseSummary,
  ApiDashboard,
  ApiDirection,
  ApiLessonDetail,
  ApiNewsPost,
  ApiProgress,
  HomeworkSubmissionResponse,
  LoginResponse,
  RegisterInput,
  StartLessonResponse,
  StudentAchievementItem,
  StudentAchievementsMeta,
} from "@/types/api";
import type { StudentOfflineSummary } from "@/types/school-offline";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const TOKEN_KEY = "maestro_access_token";
const USER_KEY = "maestro_auth_user";

interface ApiEnvelope<T, M = unknown> {
  data: T;
  meta?: M;
}

interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code = "API_ERROR",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): ApiAuthUser | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(USER_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as ApiAuthUser;
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: ApiAuthUser) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export async function apiRequestEnvelope<T, M = unknown>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T, M>> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
  } catch {
    throw new ApiError("Не удалось связаться с сервером Maestro", 0, "NETWORK_ERROR");
  }

  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T, M> & ApiErrorEnvelope;
  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.assign("/login");
      }
    }
    throw new ApiError(
      payload.error?.message ?? "Произошла ошибка при загрузке данных",
      response.status,
      payload.error?.code ?? "API_ERROR",
    );
  }
  return payload;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await apiRequestEnvelope<T>(path, init)).data;
}

export const api = {
  login: (phone: string, password: string) =>
    apiRequest<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone, password }),
    }),
  ssoExchange: (token: string) =>
    apiRequest<LoginResponse>("/auth/sso-exchange", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  register: (body: RegisterInput) =>
    apiRequest<LoginResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  me: () => apiRequest<ApiAuthUser>("/auth/me"),
  updateProfile: (body: { firstName?: string; lastName?: string; phone?: string }) =>
    apiRequest<ApiAuthUser>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest<{ ok: boolean }>("/auth/me/password", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  directions: () => apiRequest<ApiDirection[]>("/directions"),
  courses: (directionId?: string) =>
    apiRequest<ApiCourseSummary[]>(`/courses${directionId ? `?directionId=${encodeURIComponent(directionId)}` : ""}`),
  course: (courseId: string) => apiRequest<ApiCourseDetail>(`/courses/${courseId}`),
  enroll: (courseId: string) =>
    apiRequest<{ id: string; courseId: string; status: string; enrolledAt: string }>(
      `/courses/${courseId}/enroll`,
      { method: "POST" },
    ),
  lesson: (lessonId: string) => apiRequest<ApiLessonDetail>(`/lessons/${lessonId}`),
  askLessonQuestion: (lessonId: string, message: string) =>
    apiRequest<{ id: string; lessonId: string; message: string; status: string; createdAt: string }>(
      `/lessons/${lessonId}/questions`,
      { method: "POST", body: JSON.stringify({ message }) },
    ),
  signupFromLesson: (lessonId: string) =>
    apiRequest<{
      mode: "course" | "external";
      alreadyEnrolled?: boolean;
      courseId?: string;
      courseTitle?: string;
      url?: string;
      label?: string;
    }>(`/lessons/${lessonId}/signup`, { method: "POST" }),
  dashboard: () => apiRequest<ApiDashboard>("/students/me/dashboard"),
  achievements: () =>
    apiRequestEnvelope<StudentAchievementItem[], StudentAchievementsMeta>("/students/me/achievements"),
  progress: (courseId?: string) =>
    apiRequest<ApiProgress>(`/students/me/progress${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ""}`),
  startLesson: (lessonId: string) =>
    apiRequest<StartLessonResponse>(`/lessons/${lessonId}/start`, { method: "POST" }),
  myHomeworkSubmissions: (homeworkId: string) =>
    apiRequest<HomeworkAttempt[]>(`/homeworks/${homeworkId}/submissions/me`),
  submitHomework: (
    homeworkId: string,
    body: {
      comment?: string;
      attachmentUrl?: string;
      attachmentType?: HomeworkAttachmentType;
      testAnswers?: Record<string, string>;
    },
  ) =>
    apiRequest<HomeworkSubmissionResponse>(`/homeworks/${homeworkId}/submissions`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  news: () => apiRequest<ApiNewsPost[]>("/news"),
  studentOfflineSummary: () => apiRequest<StudentOfflineSummary>("/students/me/offline-summary"),
};
