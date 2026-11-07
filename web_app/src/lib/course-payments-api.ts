import { ApiError, apiRequest, apiRequestEnvelope, getAccessToken } from "@/lib/api-client";
import {
  paymentFiltersQuery,
  type AccessListStatus,
  type PaymentDisplayStatus,
  type PaymentFilters,
} from "@/lib/course-payments-format";

/** Stage 4: the administrator's side of «Я оплатил» and of the access to paid courses. */

export interface PaymentPerson {
  id: string;
  name: string;
  phone: string | null;
}

export interface AdminPaymentRequest {
  id: string;
  status: "pending" | "confirmed" | "rejected";
  displayStatus: PaymentDisplayStatus;
  /** The price at the moment of the request. */
  amountKzt: number;
  /** The price of the course now (it may have changed since). */
  currentPriceKzt: number | null;
  createdAt: string;
  payerNote: string | null;
  decidedAt: string | null;
  decidedBy: { id: string; name: string } | null;
  decisionNote: string | null;
  refundedAt: string | null;
  refundedBy: { id: string; name: string } | null;
  refundNote: string | null;
  course: { id: string; title: string };
  student: PaymentPerson & { linkedToSchool: boolean };
  payer: PaymentPerson & { isStudent: boolean };
  access: {
    id: string;
    startsAt: string;
    expiresAt: string;
    revokedAt: string | null;
    revokeReason: "refund" | "admin" | null;
  } | null;
  /** A pending request for a course the student already holds. */
  repeatPurchase: { currentExpiresAt: string; source: "payment" | "admin_grant" } | null;
  /**
   * A pending request for a course the student now gets free from the school (linked to CRM, the
   * course is included in school): the administrator checks whether payment is still needed.
   */
  coveredBySchool: boolean;
}

/** A course for the payment filter and for giving access (GET /admin/course-payments/courses). */
export interface PaymentCourseOption {
  id: string;
  title: string;
  isPublished: boolean;
  priceKzt: number | null;
  includedInSchool: boolean;
}

export interface PaymentsTableFile {
  blob: Blob;
  filename: string | null;
  /** The server stopped at its limit: the table is not the whole list. */
  truncated: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

/** The table of payments. Like `apiDownload`, but also reads `X-Export-Truncated`. */
async function downloadPaymentsTable(path: string): Promise<PaymentsTableFile> {
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
    const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
    throw new ApiError(payload.error?.message ?? "Не удалось скачать файл", response.status, payload.error?.code ?? "API_ERROR");
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  return {
    blob: await response.blob(),
    filename: /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? null,
    truncated: response.headers.get("X-Export-Truncated") === "1",
  };
}

export interface PaymentRequestsMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface CourseAccessEntry {
  id: string;
  studentId: string;
  course: { id: string; title: string };
  source: "payment" | "admin_grant";
  status: AccessListStatus;
  startsAt: string;
  expiresAt: string;
  grantedBy: { id: string; name: string } | null;
  grantNote: string | null;
  revokedAt: string | null;
  revokedBy: { id: string; name: string } | null;
  revokeReason: "refund" | "admin" | null;
  revokeNote: string | null;
  payment: { requestId: string; amountKzt: number; refundedAt: string | null } | null;
  createdAt: string;
}

export interface CoursePaymentSettings {
  kaspiPayUrl: string | null;
  transferPhone: string | null;
  recipientName: string | null;
  hint: string | null;
  updatedAt: string | null;
  updatedBy: { id: string; name: string } | null;
}

export type CoursePaymentSettingsInput = Pick<
  CoursePaymentSettings,
  "kaspiPayUrl" | "transferPhone" | "recipientName" | "hint"
>;

/** The menu badge listens for this to read the count again right after a decision. */
export const COURSE_PAYMENTS_CHANGED_EVENT = "maestro:course-payments-changed";

export function announceCoursePaymentsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(COURSE_PAYMENTS_CHANGED_EVENT));
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body ?? {}) });

export const coursePaymentsApi = {
  list: (filters: PaymentFilters, page: number, limit: number) =>
    apiRequestEnvelope<AdminPaymentRequest[], PaymentRequestsMeta>(
      `/admin/course-payments/requests?${paymentFiltersQuery(filters, { page, limit })}`,
    ),
  pendingCount: () => apiRequest<{ count: number }>("/admin/course-payments/requests/pending-count"),
  get: (requestId: string) => apiRequest<AdminPaymentRequest>(`/admin/course-payments/requests/${requestId}`),
  confirm: (requestId: string) =>
    apiRequest<AdminPaymentRequest>(`/admin/course-payments/requests/${requestId}/confirm`, post({})),
  reject: (requestId: string, note: string) =>
    apiRequest<AdminPaymentRequest>(`/admin/course-payments/requests/${requestId}/reject`, post({ note })),
  refund: (requestId: string, note: string) =>
    apiRequest<AdminPaymentRequest>(
      `/admin/course-payments/requests/${requestId}/refund`,
      post(note.trim() ? { note: note.trim() } : {}),
    ),
  /** The table for Excel with the same filters as the list. */
  exportCsv: (filters: PaymentFilters) =>
    downloadPaymentsTable(`/admin/course-payments/requests/export.csv?${paymentFiltersQuery(filters)}`),
  /** All courses that are not deleted: needs only the payment right, not the catalog right. */
  courses: () => apiRequest<PaymentCourseOption[]>("/admin/course-payments/courses"),

  settings: () => apiRequest<CoursePaymentSettings>("/admin/course-payments/settings"),
  saveSettings: (body: CoursePaymentSettingsInput) =>
    apiRequest<CoursePaymentSettings>("/admin/course-payments/settings", { method: "PUT", body: JSON.stringify(body) }),

  studentAccess: (studentId: string) => apiRequest<CourseAccessEntry[]>(`/admin/students/${studentId}/course-access`),
  grantAccess: (studentId: string, body: { courseId: string; note: string; expiresAt?: string }) =>
    apiRequest<CourseAccessEntry>(`/admin/students/${studentId}/course-access`, post(body)),
  revokeAccess: (accessId: string, note: string) =>
    apiRequest<CourseAccessEntry>(
      `/admin/course-access/${accessId}/revoke`,
      post(note.trim() ? { note: note.trim() } : {}),
    ),
};

/** Hands the bytes to the browser as a file. */
export function saveBlobAsFile(blob: Blob, filename: string) {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 2000);
}
