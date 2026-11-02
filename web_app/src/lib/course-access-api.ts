import { apiRequest } from "@/lib/api-client";
import type { CourseAccessInfo, RequestDisplayStatus } from "@/lib/course-access-format";
import type { LoginResponse } from "@/types/api";

/** Stage 4: what a student or a parent sees about the access to paid courses, and how they pay. */

export interface PaymentDetails {
  kaspiPayUrl: string | null;
  transferPhone: string | null;
  recipientName: string | null;
  hint: string | null;
  configured: boolean;
}

export interface StudentPaymentRequest {
  id: string;
  courseId: string;
  courseTitle: string;
  amountKzt: number;
  status: "pending" | "confirmed" | "rejected";
  displayStatus: RequestDisplayStatus;
  payerNote: string | null;
  rejectionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
  refundedAt: string | null;
  paidBy: "student" | "parent";
  paidByViewer: boolean | null;
  access: { startsAt: string; expiresAt: string } | null;
}

/** `GET /courses/:id/access` and its parent twin. */
export interface CoursePaymentView {
  course: { id: string; title: string; priceKzt: number | null; includedInSchool: boolean; freeLessonsCount: number };
  access: CourseAccessInfo;
  canRequestPayment: boolean;
  blockedBy: "not_for_sale" | "school" | "pending" | null;
  lastRequest: StudentPaymentRequest | null;
  paymentDetails: PaymentDetails;
}

export interface ChildCourse {
  id: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  priceKzt: number | null;
  includedInSchool: boolean;
  freeLessonsCount: number;
  access: CourseAccessInfo;
}

/** A lesson of `GET /courses/:id` carries `locked` once the payment gate is on. */
export interface LessonPaymentLock {
  id: string;
  locked?: boolean;
}

export interface PaymentRequestBody {
  /** The price the person saw; the server answers 409 COURSE_PRICE_CHANGED when it is not the current one. */
  expectedPriceKzt: number;
  payerNote?: string | null;
}

function post(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body ?? {}) };
}

function paymentBody(body: PaymentRequestBody) {
  const note = body.payerNote?.trim();
  return { expectedPriceKzt: body.expectedPriceKzt, ...(note ? { payerNote: note } : {}) };
}

export const courseAccessApi = {
  access: (courseId: string) => apiRequest<CoursePaymentView>(`/courses/${encodeURIComponent(courseId)}/access`),
  requestPayment: (courseId: string, body: PaymentRequestBody) =>
    apiRequest<StudentPaymentRequest>(
      `/courses/${encodeURIComponent(courseId)}/payment-requests`,
      post(paymentBody(body)),
    ),
  myRequests: () => apiRequest<StudentPaymentRequest[]>("/students/me/course-payment-requests"),

  childCourses: (studentId: string) =>
    apiRequest<ChildCourse[]>(`/parents/me/children/${encodeURIComponent(studentId)}/courses`),
  childAccess: (studentId: string, courseId: string) =>
    apiRequest<CoursePaymentView>(
      `/parents/me/children/${encodeURIComponent(studentId)}/courses/${encodeURIComponent(courseId)}/access`,
    ),
  requestChildPayment: (studentId: string, courseId: string, body: PaymentRequestBody) =>
    apiRequest<StudentPaymentRequest>(
      `/parents/me/children/${encodeURIComponent(studentId)}/courses/${encodeURIComponent(courseId)}/payment-requests`,
      post(paymentBody(body)),
    ),
};

export interface ParentRegistrationInput {
  parent: { firstName: string; lastName: string; phone: string; password: string };
  child: { firstName: string; lastName: string; phone: string; password: string };
}

/** One form makes the parent, the child and the link between them; the answer is the parent's session. */
export function registerParent(body: ParentRegistrationInput) {
  return apiRequest<LoginResponse>("/auth/register/parent", post(body));
}
