import { LessonStatus } from "@/types";

export const lessonStatusLabels: Record<LessonStatus, string> = {
  available: "Доступен",
  locked: "Закрыт",
  in_progress: "В процессе",
  submitted: "На проверке",
  reviewed: "Проверен",
  completed: "Завершен",
};

export const lessonStatusStyles: Record<LessonStatus, string> = {
  available: "bg-stone-100 text-stone-600",
  locked: "bg-stone-100 text-stone-400",
  in_progress: "bg-amber-50 text-amber-800",
  submitted: "bg-blue-50 text-blue-700",
  reviewed: "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-50 text-emerald-700",
};
