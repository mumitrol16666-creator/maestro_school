import {
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  Clock3,
  MonitorPlay,
  RotateCcw,
  School,
  Star,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import type { UnifiedTask, UnifiedTaskSource, UnifiedTaskStatus } from "@/types/unified-tasks";

const sourceUi: Record<UnifiedTaskSource, { label: string; icon: typeof School; className: string }> = {
  course: { label: "Курс", icon: BookOpenCheck, className: "bg-violet-50 text-violet-800" },
  offline: { label: "В школе", icon: School, className: "bg-amber-50 text-amber-900" },
  online: { label: "Онлайн", icon: MonitorPlay, className: "bg-blue-50 text-blue-800" },
};

const statusUi: Record<UnifiedTaskStatus, { label: string; icon: typeof Clock3; className: string }> = {
  todo: { label: "Нужно сделать", icon: Clock3, className: "bg-stone-100 text-stone-700" },
  waiting_review: { label: "На проверке", icon: Clock3, className: "bg-blue-50 text-blue-800" },
  needs_revision: { label: "Нужна доработка", icon: RotateCcw, className: "bg-red-50 text-red-800" },
  completed: { label: "Выполнено", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-800" },
};

function dueLabel(task: UnifiedTask) {
  if (!task.timing.dueAt) return task.source === "course" ? "Без срока" : null;
  const formatted = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(task.timing.dueAt));
  if (task.timing.dueKind === "next_lesson") return `К следующему уроку · ${formatted}`;
  if (task.timing.overdue) return `Срок прошёл · ${formatted}`;
  return `Сдать до ${formatted}`;
}

export function UnifiedTaskCard({ task, compact = false }: { task: UnifiedTask; compact?: boolean }) {
  const source = sourceUi[task.source];
  const status = statusUi[task.status];
  const SourceIcon = source.icon;
  const StatusIcon = status.icon;
  const due = dueLabel(task);

  return (
    <article className={`rounded-[24px] border bg-white shadow-soft ${
      task.status === "needs_revision" ? "border-red-100" : "border-stone-200"
    } ${compact ? "p-4" : "p-5 sm:p-6"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${source.className}`}>
          <SourceIcon size={13} /> {source.label}
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${status.className}`}>
          <StatusIcon size={13} /> {status.label}
        </span>
      </div>

      <h3 className={`font-display mt-4 leading-tight ${compact ? "text-xl" : "text-2xl"}`}>{task.title}</h3>
      {task.descriptionPreview ? (
        <p className={`mt-2 text-sm leading-6 text-stone-600 ${compact ? "line-clamp-2" : "line-clamp-2"}`}>
          {task.descriptionPreview}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-stone-500">
        <span>{task.context.primary}{task.context.secondary ? ` · ${task.context.secondary}` : ""}</span>
        {task.context.teacherName ? (
          <span className="inline-flex items-center gap-1.5"><UserRound size={13} /> {task.context.teacherName}</span>
        ) : null}
        {due ? (
          <span className={`inline-flex items-center gap-1.5 ${task.timing.overdue ? "text-red-700" : ""}`}>
            <CalendarClock size={13} /> {due}
          </span>
        ) : null}
      </div>

      {(task.result.completionPercent != null || task.result.scorePercent != null || task.result.reviewComment || task.result.points != null) ? (
        <div className="mt-4 rounded-2xl bg-stone-50 p-3 text-xs text-stone-600">
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-bold text-stone-800">
            {task.result.completionPercent != null ? <span>Выполнено: {task.result.completionPercent}%</span> : null}
            {task.result.scorePercent != null ? <span>Результат теста: {task.result.scorePercent}%</span> : null}
            {task.result.points != null ? <span className="inline-flex items-center gap-1"><Star size={13} className="text-gold" /> {task.result.points} баллов</span> : null}
          </div>
          {task.result.reviewComment ? <p className="mt-1 leading-5">{task.result.reviewComment}</p> : null}
        </div>
      ) : null}

      <Link
        href={task.target.href}
        className={`mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition ${
          task.actionRequired ? "bg-ink text-white hover:bg-stone-800" : "border border-stone-300 text-stone-700 hover:bg-stone-50"
        }`}
      >
        {task.target.actionLabel} <ArrowRight size={15} />
      </Link>
    </article>
  );
}
