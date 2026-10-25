import type { UnifiedTask } from "@/types/unified-tasks";

export function isHistoricalTask(task: UnifiedTask) {
  return task.provenance === "legacy_offline"
    || (!task.provenance && task.source === "offline" && task.id.startsWith("offline:"));
}

export function taskDate(value: string | null, withTime = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Aqtobe", day: "numeric", month: "long", year: "numeric",
    ...(withTime ? { hour: "2-digit" as const, minute: "2-digit" as const } : {}),
  }).format(new Date(value));
}

/** School homework is checked by the teacher at the lesson, so its words differ from a course's. */
function isSchoolHomework(task: UnifiedTask) {
  return task.source === "offline";
}

/** The status in the child's words; null when there is nothing worth a badge. */
export function taskStatusLabel(task: UnifiedTask): string | null {
  if (task.legacyDecision === "continue") return "Продолжить работу";
  if (task.legacyDecision === "accepted") return "Принято преподавателем";
  if (task.status === "archived") return "Неактуально";
  if (isHistoricalTask(task)) {
    const percent = task.result.completionPercent;
    const safe = percent != null && Number.isFinite(percent) ? Math.min(100, Math.max(0, Math.round(percent))) : null;
    const label = task.status === "completed" ? "Выполнено"
      : task.status === "needs_revision" ? (safe != null && safe > 0 ? "Частично выполнено" : "Не выполнено")
      : task.status === "waiting_review" ? "Проверит на уроке" : null;
    if (label === null) return null;
    return safe == null ? label : `${label} · ${safe}%`;
  }
  if (isSchoolHomework(task)) {
    return { todo: "К уроку", waiting_review: "Проверит на уроке", needs_revision: "Доработать", completed: "Выполнено" }[task.status];
  }
  return { todo: "Нужно сделать", waiting_review: "На проверке", needs_revision: "Доработать", completed: "Выполнено" }[task.status];
}
