import { apiRequest } from "@/lib/api-client";
import type {
  AdminSectorExamRow,
  SectorExam,
  SectorExamItemDraft,
  TeacherSectorExamRow,
} from "@/types/sector-exam";

/** Plan 1.10: the sector exam. Held live at the school; the platform keeps the list and the marks. */
export const sectorExamsApi = {
  board: () => apiRequest<{ generatedAt: string; sectors: AdminSectorExamRow[] }>("/admin/sector-exams"),
  template: (planId: string) =>
    apiRequest<{ planId: string; items: SectorExamItemDraft[] }>(`/admin/sector-exams/template/${encodeURIComponent(planId)}`),
  create: (planId: string, items: SectorExamItemDraft[], send: boolean) =>
    apiRequest<SectorExam>("/admin/sector-exams", { method: "POST", body: JSON.stringify({ planId, items, send }) }),
  updateItems: (examId: string, items: SectorExamItemDraft[]) =>
    apiRequest<SectorExam>(`/admin/sector-exams/${encodeURIComponent(examId)}/items`, { method: "PUT", body: JSON.stringify({ items }) }),
  send: (examId: string) =>
    apiRequest<SectorExam>(`/admin/sector-exams/${encodeURIComponent(examId)}/send`, { method: "POST", body: JSON.stringify({}) }),
  cancel: (examId: string, reason?: string) =>
    apiRequest<SectorExam>(`/admin/sector-exams/${encodeURIComponent(examId)}/cancel`, { method: "POST", body: JSON.stringify({ reason: reason ?? null }) }),

  forStudent: (crmStudentId: string) =>
    apiRequest<TeacherSectorExamRow[]>(`/teachers/me/students/${encodeURIComponent(crmStudentId)}/sector-exams`),
  start: (examId: string) =>
    apiRequest<SectorExam>(`/teachers/me/sector-exams/${encodeURIComponent(examId)}/start`, { method: "POST", body: JSON.stringify({}) }),
  mark: (examId: string, itemId: string, done: boolean) =>
    apiRequest<SectorExam>(
      `/teachers/me/sector-exams/${encodeURIComponent(examId)}/items/${encodeURIComponent(itemId)}`,
      { method: "PUT", body: JSON.stringify({ done }) },
    ),
  finish: (examId: string, decision: "close_sector" | "retake", comment?: string) =>
    apiRequest<{ exam: SectorExam; retakeExamId: string | null; awardedPoints: number }>(
      `/teachers/me/sector-exams/${encodeURIComponent(examId)}/finish`,
      { method: "POST", body: JSON.stringify({ decision, comment: comment?.trim() || null }) },
    ),
};

export const sectorExamStatusLabel: Record<string, string> = {
  draft: "Черновик",
  awaiting_schedule: "Ждёт назначения в CRM",
  scheduled: "Назначен",
  in_progress: "Идёт экзамен",
  completed: "Завершён",
  cancelled: "Отменён",
};

export const sectorExamOutcomeLabel: Record<string, string> = {
  passed: "Сдан",
  partial: "Сдан частично",
  failed: "Не сдан",
};

export function formatExamDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Aqtobe" });
}
