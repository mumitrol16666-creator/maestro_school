import { env } from "../../config/env.js";

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
    throw new Error(body.error || `CRM request failed (${response.status})`);
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
    throw new Error(body.error || `CRM request failed (${response.status})`);
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

export type TeacherSubmitPayload = {
  crmTeacherId: string;
  topic?: string;
  homeworkDraft?: string;
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

export async function postTeacherAttendance(
  crmClassId: string,
  payload: { crmTeacherId: string; studentId: string; attended: boolean },
) {
  return crmPost<Record<string, unknown>>(
    `/api/integration/v1/classes/${encodeURIComponent(crmClassId)}/teacher-attendance`,
    payload,
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
