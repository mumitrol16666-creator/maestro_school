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

export function taskStatusLabel(task: UnifiedTask) {
  if (isHistoricalTask(task)) {
    const percent = task.result.completionPercent;
    const safe = percent != null && Number.isFinite(percent) ? Math.min(100, Math.max(0, Math.round(percent))) : null;
    const label = task.status === "completed" ? "Выполнено"
      : task.status === "needs_revision" ? (safe != null && safe > 0 ? "Частично выполнено" : "Не выполнено")
      : task.status === "waiting_review" ? "На проверке" : "Результат не отмечен";
    return safe == null ? label : `${label} · ${safe}%`;
  }
  return { todo: "Нужно сделать", waiting_review: "На проверке", needs_revision: "Доработать", completed: "Выполнено" }[task.status];
}
