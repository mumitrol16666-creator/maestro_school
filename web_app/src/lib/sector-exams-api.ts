import { apiRequest } from "@/lib/api-client";
import type { AdminSectorExamRow, SectorExam, TeacherSectorExamRow } from "@/types/sector-exam";

/** Plan 1.10: the sector exam. Held live at the school; the platform keeps the list and the marks. */
export const sectorExamsApi = {
  markReady: (crmStudentId: string, planId: string) => apiRequest<{ ready: boolean; readyAt: string; idempotent: boolean }>(
    `/teachers/me/students/${encodeURIComponent(crmStudentId)}/sectors/${encodeURIComponent(planId)}/exam-readiness`, { method: "POST", body: JSON.stringify({}) }),
  board: () => apiRequest<{ generatedAt: string; sectors: AdminSectorExamRow[] }>("/admin/sector-exams"),
  forStudent: (crmStudentId: string) =>
    apiRequest<TeacherSectorExamRow[]>(`/teachers/me/students/${encodeURIComponent(crmStudentId)}/sector-exams`),
  start: (examId: string) =>
    apiRequest<SectorExam>(`/teachers/me/sector-exams/${encodeURIComponent(examId)}/start`, { method: "POST", body: JSON.stringify({}) }),
  mark: (examId: string, itemId: string, done: boolean) =>
    apiRequest<SectorExam>(
      `/teachers/me/sector-exams/${encodeURIComponent(examId)}/items/${encodeURIComponent(itemId)}`,
      { method: "PUT", body: JSON.stringify({ done }) },
    ),
  finish: (examId: string, decision: "pass" | "retake", comment?: string) =>
    apiRequest<{ exam: SectorExam; retakeExamId: string | null; awardedPoints: number }>(
      `/teachers/me/sector-exams/${encodeURIComponent(examId)}/finish`,
      { method: "POST", body: JSON.stringify({ decision, comment: comment?.trim() || null }) },
    ),
};

export const sectorExamStatusLabel: Record<string, string> = {
  draft: "Черновик",
  awaiting_schedule: "Ждёт назначения",
  scheduled: "Назначен",
  in_progress: "Идёт экзамен",
  completed: "Завершён",
  cancelled: "Отменён",
};

export const sectorExamOutcomeLabel: Record<string, string> = {
  passed: "Сдан",
  // Only old exams (before 05.11) closed a sector with a partial result.
  partial: "Сдан частично",
  failed: "Не сдан",
};

/**
 * 07.11 (P3): one label for an exam's result everywhere. A retake decision is «Нужна пересдача»,
 * as in the notification and the admin list; «Сдан частично» stays only for old closed sectors.
 */
export function sectorExamResultLabel(exam: { outcome: string | null; decision?: string | null }) {
  if (exam.decision === "retake") return "Нужна пересдача";
  return exam.outcome ? sectorExamOutcomeLabel[exam.outcome] ?? null : null;
}

export function formatExamDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Aqtobe" });
}
