import type { HomeworkAttachmentType } from "@/types/homework";

export const attachmentTypeLabels: Record<HomeworkAttachmentType, string> = {
  text: "Текст",
  video: "Видео",
  audio: "Аудио",
  file: "Файл",
};

export const submissionStatusLabels: Record<string, string> = {
  submitted: "На проверке",
  under_review: "Проверяется",
  approved: "Принято",
  rejected: "На доработке",
  pending: "Ожидает",
};

export function submissionStatusClass(status: string) {
  if (status === "submitted" || status === "under_review") return "bg-amber-50 text-amber-800";
  if (status === "approved") return "bg-emerald-50 text-emerald-700";
  if (status === "rejected") return "bg-red-50 text-red-700";
  return "bg-stone-100 text-stone-600";
}

export const lessonStatusHints: Record<string, string> = {
  locked: "Сначала завершите предыдущий урок.",
  available: "Урок открыт. Начните и посмотрите видео.",
  in_progress: "Продолжайте урок и отправьте домашнее задание.",
  submitted: "Работа отправлена. Ожидайте проверку преподавателя.",
  reviewed: "Преподаватель проверяет вашу работу.",
  completed: "Урок завершён. Баллы начислены, следующий урок открыт.",
};

export const testLessonStatusHints: Record<string, string> = {
  ...lessonStatusHints,
  in_progress: "Посмотрите урок и пройдите тест.",
  submitted: "Тест отправлен. Ожидайте результат.",
  completed: "Тест пройден. Урок завершён, следующий урок открыт.",
};

export function attemptStatusLabel(status: string, isTest: boolean) {
  if (isTest && status === "rejected") return "Не пройден";
  if (isTest && status === "approved") return "Пройден";
  return submissionStatusLabels[status] ?? "Неизвестный статус";
}
