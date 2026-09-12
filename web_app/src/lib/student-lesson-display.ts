import type { SchoolOfflineLesson } from "@/types/school-offline";

export function studentLessonTitle(lesson: SchoolOfflineLesson) {
  if (lesson.topic?.trim()) return lesson.topic.trim();
  if (lesson.groupName?.trim()) return lesson.groupName.trim();
  const formats: Record<string, string> = {
    individual: "Индивидуальный урок",
    group: "Групповой урок",
    theory: "Теория",
    trial: "Пробный урок",
  };
  return (
    formats[lesson.classType || ""] ||
    lesson.title.split(/\s[·•]\s/)[0]?.trim() ||
    "Урок музыки"
  );
}

export function schoolDateLabel(date: string, weekday = false) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    ...(weekday ? { weekday: "long" as const } : { year: "numeric" as const }),
  }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`));
}
