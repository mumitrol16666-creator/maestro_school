import type { SectorProposal } from "@/types/teacher-students";
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
  ApiStudentHome,
  CompleteLessonResponse,
  HomeworkSubmissionResponse,
  LoginResponse,
  RegisterInput,
  StartLessonResponse,
  StudentAchievementItem,
  StudentAchievementsMeta,
  StudentEconomyProfile,
  StudentMonthlyPlansResponse,
  StudentPointsReadModel,
  TrialBookingInput,
  TrialBookingResponse,
} from "@/types/api";
import type { StudentOfflineSummary } from "@/types/school-offline";
import type { UnifiedTaskFilters, UnifiedTasksData, UnifiedTasksMeta } from "@/types/unified-tasks";
import type {
  PreparedTestAdminPreview,
  PreparedTestAttemptResponse,
  PreparedTestDetail,
  PreparedTestsAnalytics,
  PreparedTestsResponse,
} from "@/types/prepared-tests";
import { reportApiReachable, reportApiUnreachable, resetConnectionStatus } from "@/lib/connection-status";
import { clearHomeSnapshots, isFreshSavedAnswer } from "@/lib/offline-snapshot";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";
const TOKEN_KEY = "maestro_access_token";
const USER_KEY = "maestro_auth_user";

/**
 * В-18: in the student app the last answer of every read stays in this tab's memory, so a
 * screen opened again without network shows what was already loaded (the shell shows
 * «Нет связи»), if it is younger than 12 hours. Nothing is written to the device here;
 * logout and a new session drop it.
 */
const SAVED_READS_LIMIT = 80;
const savedReads = new Map<string, { at: number; payload: unknown }>();
/** Answers handed out from memory while offline; their data must not be saved again as fresh. */
const answersServedFromMemory = new WeakSet<object>();
let savedReadsEnabled = false;

/** Only the student shell turns this on: staff and family screens have no «Нет связи» strip. */
export function setSavedReadsEnabled(enabled: boolean) {
  savedReadsEnabled = enabled;
}

/** A change sent outside `apiRequestEnvelope` (multipart uploads) drops the kept answers too. */
export function forgetSavedReads() {
  savedReads.clear();
}

export function isAnswerFromMemory(data: unknown) {
  return typeof data === "object" && data !== null && answersServedFromMemory.has(data);
}

function keepSavedRead(path: string, payload: unknown) {
  savedReads.delete(path);
  savedReads.set(path, { at: Date.now(), payload });
  if (savedReads.size > SAVED_READS_LIMIT) {
    const oldest = savedReads.keys().next().value;
    if (oldest !== undefined) savedReads.delete(oldest);
  }
}

interface ApiEnvelope<T, M = unknown> {
  data: T;
  meta?: M;
}

interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code = "API_ERROR",
    /** Stage 4: what the server added to the error (the new price of a course, for one). */
    public readonly details: unknown = undefined,
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

// В-41: a signed-in student stays in for 30 days if every visit renews the session. The app asks
// for a new token when it opens, at most once in 12 hours.
const RENEWED_AT_KEY = "maestro_session_renewed_at";
const SESSION_RENEW_INTERVAL_MS = 12 * 60 * 60 * 1000;

export function sessionRenewalDue(now = Date.now()) {
  if (typeof window === "undefined") return false;
  try {
    const renewedAt = Number(window.localStorage.getItem(RENEWED_AT_KEY) || 0);
    return !Number.isFinite(renewedAt) || now - renewedAt >= SESSION_RENEW_INTERVAL_MS || renewedAt > now;
  } catch {
    return true;
  }
}

/** Call whenever a fresh token was issued: a sign-in, a renewal, a password change. */
export function markSessionRenewed(now = Date.now()) {
  try {
    window.localStorage.setItem(RENEWED_AT_KEY, String(now));
  } catch {
    // Without storage the app renews at every opening, which is harmless.
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(RENEWED_AT_KEY); } catch { /* nothing to forget */ }
  savedReads.clear();
  clearHomeSnapshots();
  resetConnectionStatus();
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export async function apiRequestEnvelope<T, M = unknown>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T, M>> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const method = (init.method ?? "GET").toUpperCase();
  const attempts = method === "GET" ? 2 : 1;
  let response: Response | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      response = await fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
      break;
    } catch {
      if (init.signal?.aborted) {
        throw new ApiError("Не удалось связаться с сервером Maestro", 0, "NETWORK_ERROR");
      }
      if (attempt === attempts - 1) return unreachable<T, M>(method, path);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  if (!response) return unreachable<T, M>(method, path);
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T, M> & ApiErrorEnvelope;
  // A gateway answer (502/504 page, empty body) without our error envelope means the Maestro server
  // itself is down; any `error` the server wrote, with or without a code, is its own answer.
  if (response.status >= 500 && !payload.error) return unreachable<T, M>(method, path);
  reportApiReachable();
  if (response.ok && method === "GET" && savedReadsEnabled) keepSavedRead(path, payload);
  // After a change the kept answers may show the state before it; a reread must not fall back to them.
  if (response.ok && method !== "GET") savedReads.clear();
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
      payload.error?.details,
    );
  }
  return payload;
}

function unreachable<T, M>(method: string, path: string): ApiEnvelope<T, M> {
  const saved = method === "GET" && savedReadsEnabled ? savedReads.get(path) : undefined;
  if (saved && isFreshSavedAnswer(saved.at)) {
    reportApiUnreachable({ servedSavedAt: saved.at });
    const envelope = saved.payload as ApiEnvelope<T, M>;
    if (typeof envelope.data === "object" && envelope.data !== null) answersServedFromMemory.add(envelope.data);
    return envelope;
  }
  reportApiUnreachable();
  throw new ApiError("Не удалось связаться с сервером Maestro", 0, "NETWORK_ERROR");
}

/**
 * A file the server builds for the signed-in person (a table for Excel): the token goes in the
 * header, so the file cannot be opened by a plain link. Returns the bytes and the file name.
 */
export async function apiDownload(path: string): Promise<{ blob: Blob; filename: string | null }> {
  const token = getAccessToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { headers, cache: "no-store" });
  } catch {
    throw new ApiError("Не удалось связаться с сервером Maestro", 0, "NETWORK_ERROR");
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ApiErrorEnvelope;
    throw new ApiError(
      payload.error?.message ?? "Не удалось скачать файл",
      response.status,
      payload.error?.code ?? "API_ERROR",
    );
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? null;
  return { blob: await response.blob(), filename };
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await apiRequestEnvelope<T>(path, init)).data;
}

export const api = {
  login: (
    phone: string,
    password: string,
    profile?: "student" | "parent" | "staff",
  ) =>
    apiRequest<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone, password, profile }),
    }),
  refreshSession: () => apiRequest<LoginResponse>("/auth/refresh", { method: "POST" }),
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
  createTrialBooking: (body: TrialBookingInput) =>
    apiRequest<TrialBookingResponse>("/trial-bookings", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  me: () => apiRequest<ApiAuthUser>("/auth/me"),
  /** Plan 1.12: the cookie that lets <img>, <video> and links open uploaded files. */
  refreshMediaSession: () => apiRequest<{ ok: boolean }>("/auth/media-session", { method: "POST", body: JSON.stringify({}) }),
  clearMediaSession: () => apiRequest<{ ok: boolean }>("/auth/media-session", { method: "DELETE" }),
  updateProfile: (body: {
    firstName?: string;
    lastName?: string;
    middleName?: string | null;
    phone?: string;
    profileBio?: string | null;
    profileInstrument?: string | null;
    profileInterests?: string[];
    profilePublic?: boolean;
  }) =>
    apiRequest<ApiAuthUser>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  uploadAvatar: (body: { filename: string; mimeType: string; base64: string }) =>
    apiRequest<ApiAuthUser>("/auth/me/avatar", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  changePassword: async (currentPassword: string, newPassword: string) => {
    const result = await apiRequest<{ ok: boolean; token: string }>("/auth/me/password", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (typeof window !== "undefined") {
      localStorage.setItem(TOKEN_KEY, result.token);
      markSessionRenewed();
    }
    return result;
  },
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
  studentLevel: () => apiRequest<StudentPointsReadModel>("/students/me/level"),
  studentEconomyProfile: () => apiRequest<StudentEconomyProfile>("/students/me/economy-profile"),
  studentHome: () => apiRequest<ApiStudentHome>("/students/me/home"),
  sectorProposals: () => apiRequest<SectorProposal[]>("/students/me/sector-proposals"),
  createSectorProposal: (body: { crmDirectionId: string; kind: "topic" | "song" | "goal"; text: string; link?: string | null }) =>
    apiRequest<SectorProposal>("/students/me/sector-proposals", { method: "POST", body: JSON.stringify(body) }),
  studentMonthlyPlans: (options: { history?: boolean } = {}) => apiRequest<StudentMonthlyPlansResponse>(
    `/students/me/monthly-plans${options.history ? "?history=1" : ""}`,
  ),
  studentTasks: (filters: UnifiedTaskFilters = {}) => {
    const query = new URLSearchParams();
    if (filters.scope) query.set("scope", filters.scope);
    if (filters.source) query.set("source", filters.source);
    if (filters.status) query.set("status", filters.status);
    if (filters.limit) query.set("limit", String(filters.limit));
    const suffix = query.toString();
    return apiRequestEnvelope<UnifiedTasksData, UnifiedTasksMeta>(`/students/me/tasks${suffix ? `?${suffix}` : ""}`);
  },
  achievements: () =>
    apiRequestEnvelope<StudentAchievementItem[], StudentAchievementsMeta>("/students/me/achievements"),
  progress: (courseId?: string) =>
    apiRequest<ApiProgress>(`/students/me/progress${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ""}`),
  startLesson: (lessonId: string) =>
    apiRequest<StartLessonResponse>(`/lessons/${lessonId}/start`, { method: "POST" }),
  completeLesson: (lessonId: string) =>
    apiRequest<CompleteLessonResponse>(`/lessons/${lessonId}/complete`, { method: "POST" }),
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
  preparedTests: () => apiRequest<PreparedTestsResponse>("/tests"),
  preparedTest: (testId: string) =>
    apiRequest<PreparedTestDetail>(`/tests/${encodeURIComponent(testId)}`),
  savePreparedTestDraft: (
    testId: string,
    answers: Record<string, string>,
    currentQuestion: number,
  ) =>
    apiRequest<{ saved: boolean; updatedAt: string }>(`/tests/${encodeURIComponent(testId)}/draft`, {
      method: "PUT",
      body: JSON.stringify({ answers, currentQuestion }),
    }),
  submitPreparedTest: (testId: string, answers: Record<string, string>) =>
    apiRequest<PreparedTestAttemptResponse>(`/tests/${encodeURIComponent(testId)}/attempts`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),
  preparedTestsAnalytics: () =>
    apiRequest<PreparedTestsAnalytics>("/admin/tests/analytics"),
  preparedTestAdminPreview: (testId: string) =>
    apiRequest<PreparedTestAdminPreview>(`/admin/tests/${encodeURIComponent(testId)}/preview`),
};

/** Plan 5.6: practice reminders and «позанимался». */
export const practiceApi = {
  status: () => apiRequest<import("@/types/api").PracticeStatus>("/students/me/practice"),
  saveReminder: (input: Partial<import("@/types/api").PracticeReminderSettings>) =>
    apiRequest<import("@/types/api").PracticeReminderSettings>("/students/me/practice/reminder", { method: "PUT", body: JSON.stringify(input) }),
  checkIn: () =>
    apiRequest<import("@/types/api").PracticeStatus & { reply: string }>("/students/me/practice/checkin", { method: "POST", body: JSON.stringify({ source: "home" }) }),
};
