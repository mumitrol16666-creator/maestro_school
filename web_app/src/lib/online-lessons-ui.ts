import type { OnlineLessonRequestStatus } from "@/types/online-lessons";

export const onlineLessonStatusLabels: Record<OnlineLessonRequestStatus, string> = {
  new: "Новая",
  assigned: "В работе",
  scheduled: "Назначен",
  completed: "Завершён",
  cancelled: "Отменена",
  no_show: "Неявка",
};

export const onlineLessonStatusClasses: Record<OnlineLessonRequestStatus, string> = {
  new: "bg-amber-50 text-amber-800",
  assigned: "bg-sky-50 text-sky-800",
  scheduled: "bg-indigo-50 text-indigo-800",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-stone-100 text-stone-600",
  no_show: "bg-red-50 text-red-700",
};

export const levelOptions = [
  { value: "beginner", label: "Начальный" },
  { value: "intermediate", label: "Средний" },
  { value: "advanced", label: "Продвинутый" },
];
