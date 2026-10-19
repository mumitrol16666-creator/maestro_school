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

/** States of a homework given from a lesson (learning_homework_v2), as the teacher and student see them. */
export const learningHomeworkStateLabels: Record<string, string> = {
  assigned: "Нужно сделать",
  waiting_review: "Ждёт проверки на уроке",
  revision: "На доработке",
  accepted: "Выполнено",
  accepted_with_comment: "Выполнено с замечанием",
  not_completed: "Не выполнено",
};

/**
 * Colour of a completion percent the teacher set at the lesson:
 * 80–100 green, 50–79 orange, 1–49 dark orange, 0 red.
 */
export function homeworkPercentTone(percent: number | null | undefined) {
  if (percent == null) return { label: "Не проверено", className: "bg-stone-100 text-stone-600", bar: "bg-stone-300" };
  if (percent >= 80) return { label: `${percent}%`, className: "bg-emerald-50 text-emerald-800", bar: "bg-emerald-500" };
  if (percent >= 50) return { label: `${percent}%`, className: "bg-amber-50 text-amber-800", bar: "bg-amber-400" };
  if (percent > 0) return { label: `${percent}%`, className: "bg-orange-100 text-orange-900", bar: "bg-orange-600" };
  return { label: "Не выполнено", className: "bg-red-50 text-red-700", bar: "bg-red-500" };
}
