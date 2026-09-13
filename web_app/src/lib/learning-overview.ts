import type { SchoolOfflineLesson } from "@/types/school-offline";
import type { UnifiedTask } from "@/types/unified-tasks";

const schoolZone = "Asia/Aqtobe";
function lessonTime(lesson: SchoolOfflineLesson, time: string) {
  return Date.parse(`${lesson.date.slice(0, 10)}T${time.slice(0, 5)}:00+05:00`);
}

export function nearestLearningLesson(lessons: readonly SchoolOfflineLesson[], now = new Date()) {
  return lessons.filter((lesson) => {
    if (!["scheduled", "started"].includes(lesson.status)) return false;
    const end = lessonTime(lesson, lesson.endTime || lesson.startTime);
    return Number.isFinite(end) && end > now.getTime();
  }).sort((a, b) => lessonTime(a, a.startTime) - lessonTime(b, b.startTime))[0] ?? null;
}

export function schoolDateLabel(date: string, weekday = false) {
  const value = new Date(`${date.slice(0, 10)}T12:00:00+05:00`);
  if (!Number.isFinite(value.getTime())) return "Дата уточняется";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: schoolZone, ...(weekday ? { weekday: "long" as const } : { day: "numeric" as const, month: "long" as const }) }).format(value);
}

export function learningTaskContext(task: UnifiedTask) {
  // An imported partial grade is not proof of a new teacher request to revise.
  const label = task.source === "offline" ? "Из прошлых уроков"
    : task.source === "course" ? "Из курса" : "Онлайн-задание";
  const date = task.timing.assignedAt ? new Date(task.timing.assignedAt) : null;
  return { label, date: date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: schoolZone }).format(date)
    : null };
}
