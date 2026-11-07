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

/**
 * 07.11 (owner): whether an exam is passed is the teacher's decision, never the checklist.
 * «Сдан» comes from decision «pass» (and the old «close_sector»); «N из M пунктов» is information only.
 */
export function sectorExamResultLabel(exam: { decision?: string | null }) {
  if (exam.decision === "retake") return "Нужна пересдача";
  if (exam.decision === "pass" || exam.decision === "close_sector") return "Сдан";
  return null;
}

export function formatExamDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Aqtobe" });
}
