import { ArrowRight, BookOpenCheck, MessageSquare, MonitorPlay, Music2 } from "lucide-react";
import Link from "next/link";
import { isHistoricalTask, taskDate, taskStatusLabel } from "@/lib/task-presentation";
import type { UnifiedTask } from "@/types/unified-tasks";

const sources = {
  course: { label: "Курс", icon: BookOpenCheck },
  offline: { label: "Урок с преподавателем", icon: Music2 },
  online: { label: "Онлайн", icon: MonitorPlay },
};

export function UnifiedTaskCard({ task }: { task: UnifiedTask }) {
  const historical = isHistoricalTask(task);
  const SourceIcon = sources[task.source].icon;
  const assigned = taskDate(task.timing.assignedAt);
  // A legacy inferred next lesson is not a newly assigned deadline.
  const due = !historical && task.actionRequired ? taskDate(task.timing.dueAt, true) : null;
  const comment = task.result.reviewComment?.trim();
  const statusColor = historical ? "bg-stone-100 text-stone-600"
    : task.status === "waiting_review" ? "bg-blue-50 text-blue-800"
    : task.status === "completed" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900";

  return (
    <article data-testid="task-card" className="min-w-0 rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
      <div className="flex min-w-0 items-start gap-4">
        <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-700 sm:flex">
          <SourceIcon size={22} aria-hidden="true" />
        </span>
        <div className="grid min-w-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_250px]">
          <div className="min-w-0">
            <h2 className="font-display break-words text-xl leading-snug sm:text-2xl">{task.title}</h2>
            <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor}`}>{taskStatusLabel(task)}</span>
            <p className="mt-2 break-words text-xs leading-5 text-stone-500">
              {sources[task.source].label}{assigned ? ` · ${assigned}` : ""}
              {task.source === "course" && task.context.primary ? ` · ${task.context.primary}` : ""}
            </p>
            {task.descriptionPreview && <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-stone-700">{task.descriptionPreview}</p>}
            {comment && <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-950">
              <MessageSquare size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span className="line-clamp-2 break-words">Комментарий: {comment}</span>
            </p>}
            {due && <p className={`mt-2 text-xs leading-5 ${task.timing.overdue ? "text-red-700" : "text-stone-600"}`}>
              {task.timing.overdue ? "Срок прошёл" : task.timing.dueKind === "next_lesson" ? "К следующему уроку" : "Сдать до"}: {due}
            </p>}
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 xl:border-l xl:border-stone-200 xl:pl-5">
            {task.context.teacherName && <div className="min-w-0 flex-1 xl:basis-full">
              <p className="hidden text-xs text-stone-500 xl:block">Преподаватель</p>
              <p className="break-words text-xs leading-5 text-stone-600 xl:mt-1 xl:text-sm">{task.context.teacherName}</p>
            </div>}
            <Link href={task.target.href} aria-label={`Открыть: ${task.title}`}
              className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-3 rounded-lg px-4 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-700 ${task.actionRequired && !historical ? "bg-gold text-ink hover:bg-[#d4aa55]" : "border border-stone-300 text-ink hover:bg-stone-50"}`}>
              Открыть <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
