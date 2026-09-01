"use client";

import { AlertTriangle, CheckCircle2, Clock3, RotateCcw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { UnifiedTaskCard } from "@/components/unified-task-card";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import type { UnifiedTaskSource } from "@/types/unified-tasks";

type View = "action" | "waiting" | "completed";

const views: Array<{
  key: View;
  label: string;
  icon: typeof Clock3;
  accent: string;
}> = [
  { key: "action", label: "Нужно сделать", icon: RotateCcw, accent: "text-red-700" },
  { key: "waiting", label: "На проверке", icon: Clock3, accent: "text-blue-700" },
  { key: "completed", label: "Выполнено", icon: CheckCircle2, accent: "text-emerald-700" },
];

const sources: Array<{ key: "all" | UnifiedTaskSource; label: string }> = [
  { key: "all", label: "Все" },
  { key: "course", label: "Курсы" },
  { key: "offline", label: "С преподавателем" },
  { key: "online", label: "Онлайн" },
];

const sourceUnavailableLabel: Record<UnifiedTaskSource, string> = {
  course: "курсов",
  offline: "школы",
  online: "онлайн-уроков",
};

function TasksContent() {
  const params = useSearchParams();
  const router = useRouter();
  const rawView = params.get("view");
  const rawSource = params.get("source");
  const view: View = rawView === "waiting" || rawView === "completed" ? rawView : "action";
  const source: "all" | UnifiedTaskSource = rawSource === "course" || rawSource === "offline" || rawSource === "online"
    ? rawSource
    : "all";

  const resource = useApiResource(() => api.studentTasks({
    scope: view === "completed" ? "completed" : "active",
    status: view === "waiting" ? "waiting_review" : undefined,
    source: source === "all" ? undefined : source,
    limit: 100,
  }), [view, source]);

  function setFilters(next: { view?: View; source?: "all" | UnifiedTaskSource }) {
    const query = new URLSearchParams(params.toString());
    const nextView = next.view ?? view;
    const nextSource = next.source ?? source;
    if (nextView === "action") query.delete("view"); else query.set("view", nextView);
    if (nextSource === "all") query.delete("source"); else query.set("source", nextSource);
    router.replace(`/tasks${query.toString() ? `?${query.toString()}` : ""}`, { scroll: false });
  }

  if (resource.loading && !resource.data) return <LoadingState label="Собираем задания из всех разделов" />;
  if (resource.error || !resource.data) {
    return <ErrorState message={resource.error ?? "Не удалось загрузить задания"} retry={resource.reload} />;
  }

  const { data, meta } = resource.data;
  const refreshing = resource.loading;
  const items = view === "action" ? data.items.filter((task) => task.actionRequired) : data.items;
  const unavailable = (Object.entries(meta?.sources ?? {}) as Array<[UnifiedTaskSource, { status: string }]>)
    .filter(([, state]) => state.status === "unavailable")
    .map(([key]) => sourceUnavailableLabel[key]);
  const empty = view === "waiting"
    ? { title: "Нет заданий на проверке", description: "Отправленные работы появятся здесь, пока преподаватель их проверяет." }
    : view === "completed"
      ? { title: "Выполненных заданий пока нет", description: "После проверки готовые работы сохранятся в этом разделе." }
      : { title: "Сейчас всё сделано", description: "Новые задания появятся после уроков или внутри курса." };

  return (
    <>
      <PageHeader
        eyebrow="Единая учебная очередь"
        title="Задания"
        description="Всё, что нужно сделать по курсам и занятиям с преподавателем."
      />

      <section
        data-testid="task-state-filters"
        aria-label="Состояние заданий"
        aria-busy={refreshing}
        className="mb-4 grid grid-cols-3 gap-2 sm:gap-3"
      >
        {views.map(({ key, label, icon, accent }) => (
          <TaskStateFilter
            key={key}
            label={label}
            value={key === "action"
              ? data.counts.actionRequired
              : key === "waiting"
                ? data.counts.waitingReview
                : data.counts.completed}
            icon={icon}
            accent={accent}
            active={view === key}
            onClick={() => setFilters({ view: key })}
          />
        ))}
      </section>

      <div className="mb-4 space-y-2">
        <div data-testid="task-source-filters" className="grid grid-cols-2 gap-2 sm:flex">
          {sources.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilters({ source: key })}
              className={`min-h-10 min-w-0 rounded-xl px-3 text-xs font-black transition sm:min-h-9 sm:shrink-0 sm:rounded-full sm:px-4 ${
                source === key ? "bg-amber-100 text-amber-950" : "border border-stone-200 bg-white text-stone-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex h-5 items-center justify-end" aria-live="polite">
          {refreshing ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-stone-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-gold" /> Обновляем список
            </span>
          ) : null}
        </div>
      </div>

      {meta?.partial ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <span className="inline-flex items-center gap-2 font-semibold">
            <AlertTriangle size={17} /> Не удалось обновить задания из {unavailable.join(" и ")}. Остальные задания показаны.
          </span>
          <button type="button" onClick={() => void resource.reload()} className="font-black underline underline-offset-4">Повторить</button>
        </div>
      ) : null}

      <div
        data-testid="task-results"
        aria-busy={refreshing}
        className={`min-h-[360px] transition-opacity ${refreshing ? "pointer-events-none opacity-60" : "opacity-100"}`}
      >
        {items.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {items.map((task) => <UnifiedTaskCard key={task.id} task={task} />)}
          </div>
        ) : meta?.partial ? (
          <div className="rounded-[26px] border border-dashed border-amber-300 bg-white p-8 text-center">
            <AlertTriangle className="mx-auto text-amber-600" />
            <h2 className="font-display mt-3 text-2xl">Часть заданий временно недоступна</h2>
            <p className="mt-2 text-sm text-stone-500">Повторите загрузку, чтобы проверить остальные задания.</p>
          </div>
        ) : (
          <EmptyState title={source === "all" ? empty.title : `${empty.title} в выбранном разделе`} description={empty.description} />
        )}
      </div>

      {meta?.truncated ? (
        <p className="mt-5 text-center text-xs font-semibold text-stone-400">Показаны первые 100 заданий по выбранному фильтру.</p>
      ) : null}
    </>
  );
}

function TaskStateFilter({
  label,
  value,
  icon: Icon,
  accent,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: typeof Clock3;
  accent: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-w-0 rounded-2xl border p-3 text-left shadow-sm transition sm:p-4 ${
        active
          ? "border-ink bg-ink text-white shadow-[0_12px_28px_rgba(21,22,19,0.16)]"
          : "border-stone-200 bg-white text-stone-700 hover:border-gold/40"
      }`}
    >
      <span className={`flex min-h-8 items-start gap-1.5 text-[9px] font-black uppercase leading-4 tracking-[0.08em] sm:min-h-0 sm:text-[10px] sm:tracking-[0.12em] ${
        active ? "text-white/65" : "text-stone-400"
      }`}>
        <Icon size={13} className="mt-0.5 shrink-0" />
        <span>{label}</span>
      </span>
      <span className={`font-display mt-1 block text-2xl sm:text-3xl ${active ? "text-white" : accent}`}>{value}</span>
    </button>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<LoadingState label="Открываем задания" />}>
      <TasksContent />
    </Suspense>
  );
}
