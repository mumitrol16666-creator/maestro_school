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
