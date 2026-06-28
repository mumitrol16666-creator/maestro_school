import { env } from "../../config/env.js";
import { AppError } from "../../domain/errors.js";

type CrmResponse<T> = { success: boolean; data?: T; error?: string };

function integrationHeaders(): Record<string, string> {
  const secret = process.env.INTEGRATION_SERVICE_SECRET;
  if (!secret) {
    throw new Error("INTEGRATION_SERVICE_SECRET is not configured");
  }
  return {
    Authorization: `Bearer ${secret}`,
    "X-Integration-System": "learning-platform",
    Accept: "application/json",
  };
}

function crmBaseUrl(): string {
  return env.CRM_API_URL.replace(/\/$/, "");
}

async function crmGet<T>(path: string): Promise<T> {
  const response = await fetch(`${crmBaseUrl()}${path}`, {
    headers: integrationHeaders(),
  });

  const body = (await response.json()) as CrmResponse<T>;
  if (!response.ok || !body.success || !body.data) {
    throw new AppError(response.status, body.error || `CRM request failed (${response.status})`);
  }
  return body.data;
}

async function crmPost<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${crmBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      ...integrationHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as CrmResponse<T>;
  if (!response.ok || !body.success || !body.data) {
    throw new AppError(response.status, body.error || `CRM request failed (${response.status})`);
  }
  return body.data;
}

export async function fetchTeacherOfflineClasses(
  crmTeacherId: string,
  params?: { from?: string; to?: string },
) {
  const query = new URLSearchParams();
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  const qs = query.toString();
  return crmGet<{
    crmTeacherId: string;
    classes: Array<Record<string, unknown>>;
  }>(`/api/integration/v1/teachers/${encodeURIComponent(crmTeacherId)}/offline-classes${qs ? `?${qs}` : ""}`);
}

export async function fetchTeacherStudents(crmTeacherId: string) {
  return crmGet<{
    crmTeacherId: string;
    teacher: { crmTeacherId: string; name: string } | null;
    students: Array<{
      crmStudentId: string;
      appUserId?: string | null;
      externalLinkStatus?: string | null;
      name: string;
      firstName: string;
      lastName: string;
      phone: string;
      avatarUrl?: string | null;
      learningLevel?: string | null;
      accountBalance: number;
      directions: string[];
      assignedDirectly: boolean;
      groups: Array<{
        crmGroupId: string;
        name: string;
        direction: string;
        level: string;
      }>;
      schedules: Array<{
        id: string;
        dayOfWeek: number;
        time: string;
        duration: number;
      }>;
      attendanceHistory: Array<{
        crmClassId: string;
        title: string;
        date: string;
        startTime: string;
        classStatus: string;
        attended: boolean;
        attendanceStatus: string;
        chargeAmount: number;
        chargeSource: string | null;
      }>;
      memberships: Array<{
        crmMembershipId: string;
        type: string;
        classesRemaining: number;
        endDate: string;
        group: {
          crmGroupId: string;
          name: string;
          direction: string;
        } | null;
      }>;
    }>;
  }>(`/api/integration/v1/teachers/${encodeURIComponent(crmTeacherId)}/students`);
}

export async function fetchClassCard(crmClassId: string) {
  return crmGet<Record<string, unknown>>(`/api/integration/v1/classes/${encodeURIComponent(crmClassId)}`);
}

export async function fetchClassStudents(crmClassId: string) {
  return crmGet<{ crmClassId: string; students: Array<Record<string, unknown>> }>(
    `/api/integration/v1/classes/${encodeURIComponent(crmClassId)}/students`,
  );
}

export async function fetchStudentOfflineSummary(crmStudentId: string) {
  return crmGet<Record<string, unknown>>(
    `/api/integration/v1/students/${encodeURIComponent(crmStudentId)}/offline-summary`,
  );
}

export async function fetchStudentFreezeStatus(crmStudentId: string, date?: string) {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  return crmGet<Record<string, unknown>>(
    `/api/integration/v1/students/${encodeURIComponent(crmStudentId)}/freeze-status${qs}`,
  );
}

export async function postOnlineLessonBooking(payload: {
  externalSourceId: string;
  requestType?: "trial" | "online_lesson";
  name: string;
  lastName: string;
  phone: string;
  direction: string;
  level: string;
  preferredTime: string;
  comment?: string;
}) {
  return crmPost<{
    crmBookingId: string;
    externalSourceId: string;
    status: string;
  }>("/api/integration/v1/bookings/online-lesson", payload);
}

export async function postOnlineLessonStatus(
  externalSourceId: string,
  status: "new" | "assigned" | "scheduled" | "completed" | "cancelled" | "no_show",
) {
  return crmPost<{ crmBookingId: string; appStatus: string }>(
    `/api/integration/v1/bookings/${encodeURIComponent(externalSourceId)}/app-status`,
    { status },
  );
}

export type TeacherSubmitPayload = {
  crmTeacherId: string;
  topic?: string;
  lessonGoals?: string;
  lessonSummary?: string;
  homeworkDraft?: string;
  nextLessonFocus?: string;
  materials?: Array<{ type?: string; url?: string; title?: string }>;
  teacherOutcomeHint?: "held" | "not_held" | "no_submission";
  comment?: string;
};

export async function postTeacherStart(crmClassId: string, crmTeacherId: string) {
  return crmPost<Record<string, unknown>>(
    `/api/integration/v1/classes/${encodeURIComponent(crmClassId)}/teacher-start`,
    { crmTeacherId },
  );
}

export async function postTeacherFinish(
  crmClassId: string,
  payload: { crmTeacherId: string; comment?: string },
) {
  return crmPost<Record<string, unknown>>(
    `/api/integration/v1/classes/${encodeURIComponent(crmClassId)}/teacher-finish`,
    payload,
  );
}

export async function postTeacherSubmit(crmClassId: string, payload: TeacherSubmitPayload) {
  return crmPost<Record<string, unknown>>(
    `/api/integration/v1/classes/${encodeURIComponent(crmClassId)}/teacher-submit`,
    payload,
  );
}

export async function postTeacherMarkNotHeld(
  crmClassId: string,
  payload: { crmTeacherId: string; comment?: string },
) {
  return crmPost<Record<string, unknown>>(
    `/api/integration/v1/classes/${encodeURIComponent(crmClassId)}/teacher-mark-not-held`,
    payload,
  );
}

export async function postTeacherWithdraw(
  crmClassId: string,
  payload: { crmTeacherId: string; reason?: string },
) {
  return crmPost<Record<string, unknown>>(
    `/api/integration/v1/classes/${encodeURIComponent(crmClassId)}/teacher-withdraw`,
    payload,
  );
}

export async function postTeacherAttendance(
  crmClassId: string,
  payload: {
    crmTeacherId: string;
    studentId: string;
    attended?: boolean;
    attendanceStatus: string;
    teacherNote?: string;
  },
) {
  return crmPost<Record<string, unknown>>(
    `/api/integration/v1/classes/${encodeURIComponent(crmClassId)}/teacher-attendance`,
    payload,
  );
}

export async function fetchPendingReviewClasses() {
  return crmGet<{ classes: Array<Record<string, unknown>> }>(
    "/api/integration/v1/classes/pending-review",
  );
}

export async function fetchAdminOfflineClasses() {
  return crmGet<{
    from: string;
    to: string;
    classes: Array<Record<string, unknown>>;
  }>("/api/integration/v1/classes/admin-agenda");
}

export async function postAdminAttendance(
  crmClassId: string,
  payload: {
    studentId: string;
    attended?: boolean;
    attendanceStatus: string;
    teacherNote?: string;
  },
) {
  return crmPost<Record<string, unknown>>(
    `/api/integration/v1/classes/${encodeURIComponent(crmClassId)}/admin-attendance`,
    payload,
  );
}

export async function postAdminApproveClass(
  crmClassId: string,
  payload: {
    deduct?: boolean;
    topic?: string;
    lessonGoals?: string;
    lessonSummary?: string;
    homeworkDraft?: string;
    nextLessonFocus?: string;
    materials?: Array<{ type?: string; url?: string; title?: string }>;
    teacherComment?: string;
  },
) {
  return crmPost<{
    crmClassId: string;
    status: string;
    class: Record<string, unknown>;
    deductions: Array<{ studentId: string; deducted?: boolean }>;
  }>(`/api/integration/v1/classes/${encodeURIComponent(crmClassId)}/approve`, payload);
}

export async function postAdminReturnClass(crmClassId: string, reason?: string) {
  return crmPost<Record<string, unknown>>(
    `/api/integration/v1/classes/${encodeURIComponent(crmClassId)}/return-to-teacher`,
    { reason },
  );
}

export async function postAdminReopenClass(crmClassId: string, reason?: string) {
  return crmPost<Record<string, unknown>>(
    `/api/integration/v1/classes/${encodeURIComponent(crmClassId)}/reopen`,
    { reason },
  );
}

export async function syncStudentFromApp(payload: {
  appUserId: string;
  phone: string;
  firstName: string;
  lastName: string;
  email: string;
}) {
  return crmPost<{
    status: string;
    crmStudentId: string;
    appUserId: string;
    created: boolean;
  }>("/api/integration/v1/users/sync-from-app", payload);
}

export async function postStudentAvatarToCrm(crmStudentId: string, avatarUrl: string) {
  return crmPost<{
    crmStudentId: string;
    studentAvatar: string;
  }>(`/api/integration/v1/students/${encodeURIComponent(crmStudentId)}/avatar`, { avatarUrl });
}

export async function postCrmUserLink(payload: {
  phone: string;
  phoneNormalized?: string;
  crmStudentId?: string;
  crmTeacherId?: string;
  crmRole?: string;
  appUserId: string;
  initiatedBy?: string;
}) {
  return crmPost<{
    status: string;
    crmStudentId?: string;
    crmTeacherId?: string;
    appUserId: string;
    crm?: Record<string, unknown>;
    app?: Record<string, unknown>;
  }>("/api/integration/v1/users/link", {
    ...payload,
    initiatedBy: payload.initiatedBy ?? "learning-platform",
  });
}

export async function fetchCrmProfileByPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return crmGet<{
    found: boolean;
    phoneNormalized?: string;
    crmUserId?: string;
    role?: string;
    name?: string;
    phone?: string;
    appUserId?: string | null;
    externalLinkStatus?: string | null;
    linkedAt?: string | null;
  }>(`/api/integration/v1/users/crm-lookup/${encodeURIComponent(digits || phone)}`);
}

export async function fetchCrmLinkStatusByPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return crmGet<Record<string, unknown>>(
    `/api/integration/v1/users/link-status/${encodeURIComponent(digits || phone)}`,
  );
}

export async function fetchTeacherSalarySummary(crmTeacherId: string) {
  return crmGet<Record<string, any>>(
    `/api/integration/v1/teachers/${encodeURIComponent(crmTeacherId)}/salary-summary`
  );
}
