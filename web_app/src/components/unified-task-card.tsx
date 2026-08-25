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
  course: { label: "Самостоятельный курс", icon: BookOpenCheck, className: "bg-violet-50 text-violet-800" },
  offline: { label: "Урок в школе", icon: School, className: "bg-amber-50 text-amber-900" },
  online: { label: "Онлайн с преподавателем", icon: MonitorPlay, className: "bg-blue-50 text-blue-800" },
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

function revisionFeedback(task: UnifiedTask) {
  const comment = task.result.reviewComment?.trim();
  if (comment) return { label: "Что исправить", text: comment };
  if (task.source === "offline" && task.result.completionPercent != null) {
    return {
      label: "Результат проверки",
      text: `Преподаватель отметил ${Math.round(task.result.completionPercent)}% выполнения, но не оставил текстового комментария. Повторите задание к следующему уроку.`,
    };
  }
  return {
    label: "Результат проверки",
    text: "Работа возвращена на доработку без текстового комментария преподавателя.",
  };
}

export function UnifiedTaskCard({ task, compact = false }: { task: UnifiedTask; compact?: boolean }) {
  const source = sourceUi[task.source];
  const status = statusUi[task.status];
  const SourceIcon = source.icon;
  const StatusIcon = status.icon;
  const due = dueLabel(task);
  const homeworkPercent = task.source === "offline" ? task.result.completionPercent : null;
  const safeHomeworkPercent = homeworkPercent == null
    ? null
    : Math.min(100, Math.max(0, Math.round(homeworkPercent)));
  const ActionIcon = task.status === "needs_revision" ? RotateCcw : ArrowRight;
  const revision = task.status === "needs_revision" ? revisionFeedback(task) : null;

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
        {task.source === "offline" ? (
          <span className={`ml-auto inline-flex items-center rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${
            safeHomeworkPercent == null
              ? "bg-stone-100 text-stone-500"
              : safeHomeworkPercent >= 100
                ? "bg-emerald-50 text-emerald-800"
                : "bg-amber-50 text-amber-900"
          }`}>
            {safeHomeworkPercent == null ? "Процент не выставлен" : `ДЗ · ${safeHomeworkPercent}%`}
          </span>
        ) : null}
      </div>

      <h3 className={`font-display mt-4 leading-tight ${compact ? "text-xl" : "text-2xl"}`}>{task.title}</h3>
      {task.descriptionPreview ? (
        <p className={`mt-2 text-sm leading-6 text-stone-600 ${compact ? "line-clamp-2" : "line-clamp-2"}`}>
          {task.descriptionPreview}
        </p>
      ) : null}

      {revision ? (
        <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-950">
          <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-red-700">
            <RotateCcw size={14} /> {revision.label}
          </p>
          <p className="mt-2 leading-6">{revision.text}</p>
        </div>
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

      {(task.source === "offline" || task.result.scorePercent != null || task.result.reviewComment || task.result.points != null) ? (
        <div className="mt-4 rounded-2xl bg-stone-50 p-3 text-xs text-stone-600">
          {task.source === "offline" ? (
            safeHomeworkPercent == null ? (
              <p className="font-semibold text-stone-500">
                Преподаватель ещё не выставил процент выполнения этого ДЗ.
              </p>
            ) : (
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-stone-700">Выполнение домашнего задания</span>
                  <strong className="text-sm text-stone-900">{safeHomeworkPercent}%</strong>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
                  <div
                    className={`h-full rounded-full transition-all ${
                      safeHomeworkPercent >= 100
                        ? "bg-emerald-500"
                        : safeHomeworkPercent >= 50
                          ? "bg-amber-500"
                          : "bg-orange-500"
                    }`}
                    style={{ width: `${safeHomeworkPercent}%` }}
                  />
                </div>
              </div>
            )
          ) : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-bold text-stone-800">
            {task.result.scorePercent != null ? <span>Результат теста: {task.result.scorePercent}%</span> : null}
            {task.result.points != null ? <span className={`inline-flex items-center gap-1 ${task.source === "offline" ? "mt-2" : ""}`}><Star size={13} className="text-gold" /> {task.result.points} баллов</span> : null}
          </div>
          {task.result.reviewComment && task.status !== "needs_revision" ? <p className="mt-1 leading-5">{task.result.reviewComment}</p> : null}
        </div>
      ) : null}

      <Link
        href={task.target.href}
        className={`mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition ${
          task.actionRequired ? "bg-ink text-white hover:bg-stone-800" : "border border-stone-300 text-stone-700 hover:bg-stone-50"
        }`}
      >
        {task.target.actionLabel} <ActionIcon size={15} />
      </Link>
    </article>
  );
}
